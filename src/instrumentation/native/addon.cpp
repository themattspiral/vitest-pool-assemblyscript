/*
 * wasm-binaryen-debug Native Addon
 *
 * Wraps Binaryen's C++ API to extract detailed debug information from WebAssembly binaries.
 * Provides expression-level debug locations that the JavaScript API doesn't expose.
 */

#include <napi.h>
#include <vector>
#include <string>
#include <map>
#include <unordered_set>
#include <sstream>
#include <queue>

// Binaryen C++ API headers
#include "wasm-binary.h"
#include "wasm-io.h"
#include "wasm-builder.h"
#include "ir/module-utils.h"
#include "ir/names.h"
#include "ir/iteration.h"
#include "cfg/cfg-traversal.h"
#include "support/name.h"
#include "pass.h"

using namespace wasm;

// 32
const int32_t BYTES_PER_COUNTER = 4;

// 1 page = 64KB / 4bytes (32bits) each = 16384 counters
const int32_t COUNTERS_PER_PAGE = 16384;

// TODO - pass these through the call stack as params instead
// for now we don't expect them to  change between different calls
// in the same thread over the same vitest run, so it's safe to use this approach
thread_local bool DEBUG = false;
thread_local std::string LOG_PREFIX = "InstNative";

struct SourceDebugLocation {
  bool exists = false;
  int32_t fileIndex = 0;              // Debug location file index
  int32_t lineNumber = 0;            // Debug location line number
  int32_t columnNumber = 0;          // Debug location column number
};

/**
 * Structure to hold expression information during AST walk
 */
struct ExpressionInfo {
  std::string type;                    // Expression type name
  int32_t fileIndex;                  // Debug location file index
  int32_t lineNumber;                 // Debug location line number
  int32_t columnNumber;               // Debug location column number
  bool hasDebugLocation;               // Whether debug location exists
};

/**
 * Structure to hold basic block information
 */
struct BasicBlockInfo {
  std::vector<size_t> expressionIndices;  // Indices into the flat expression array (located exprs only)
  std::vector<size_t> branches;            // Indices of blocks this block branches to
  bool isDecision = false;                 // out-degree >= 2: an Istanbul branch decision. Single source
                                           // of truth for both branch identification and counter allocation.
  Expression* anchorExpr = nullptr;        // First expression in the block (entry-anchor for counter injection).
                                           // May be unlocated (e.g. an `if` consuming a logical result).
  int32_t coverageMemoryIndex = -1;        // Assigned block counter slot (region 2); -1 = block not instrumented.
  Expression* postAnchorExpr = nullptr;    // Empty fall-through blocks (e.g. an empty switch case) have no
                                           // expression of their own. This is the named Block they fall out
                                           // of; the counter is injected AFTER it (post-anchored), so it
                                           // increments exactly when control branches/falls to that block's end.
};

// Data structure to collect function info during instrumentation
struct FunctionInfo {
  std::string name;
  int32_t coverageMemoryIndex;
  SourceDebugLocation representativeLocation;
  std::vector<ExpressionInfo> expressions;
  std::vector<BasicBlockInfo> blocks;
  Function* func = nullptr;                // Retained for the block-counter injection pass (after the function loop)
};

/**
 * Custom content structure for CFGWalker
 */
struct BlockContent {
  std::vector<Expression*> expressions;
};

/**
 * Walker to extract expression and basic block information using CFGWalker
 *
 * This walker traverses the AST in a single pass to collect:
 * 1. All expressions with their debug locations and types
 * 2. Basic block groupings with branch edges
 */
struct DebugInfoWalker : public WalkerPass<CFGWalker<DebugInfoWalker, UnifiedExpressionVisitor<DebugInfoWalker>, BlockContent>> {
  Module* module;

  // Results for current function
  std::vector<ExpressionInfo> expressions;
  std::vector<BasicBlockInfo> blocks;

  // Map from BasicBlock pointer to block index for building branches
  std::map<BasicBlock*, size_t> blockIndexMap;

  // Fall-through basic blocks created when a named Block ends, mapped to that
  // Block expression. An empty one (e.g. an empty switch case that branches to
  // the block's end) has no expression to anchor a counter on, so we post-anchor
  // the counter onto the Block it falls out of (captured in doEndBlock below).
  std::map<BasicBlock*, Expression*> postAnchorByBB;

  explicit DebugInfoWalker(Module* m) : module(m) {}

  // Override CFGWalker::doEndBlock to record the Block expression each new
  // fall-through basic block falls out of. When a named Block with branches ends,
  // the base creates a fresh basic block for the fall-through/branch targets; at
  // that moment *currp is the Block and currBasicBlock is the new block.
  static void doEndBlock(DebugInfoWalker* self, Expression** currp) {
    BasicBlock* before = self->currBasicBlock;
    CFGWalker<DebugInfoWalker, UnifiedExpressionVisitor<DebugInfoWalker>, BlockContent>::doEndBlock(self, currp);
    if (self->currBasicBlock != nullptr && self->currBasicBlock != before) {
      self->postAnchorByBB[self->currBasicBlock] = *currp;
    }
  }

  /**
   * Called for each expression during CFG walk.
   *
   * Retains EVERY non-Block expression in the current basic block (located or
   * not). Two reasons we keep unlocated expressions now (previously skipped):
   *   - block-counter injection needs an anchor even for unlocated decision
   *     blocks (e.g. an `if` consuming a logical result has no located condition)
   *   - the first-executed expression (the entry anchor) may itself be unlocated
   *
   * Located-expression extraction (for statement coverage) and branch/decision
   * analysis happen in doWalkFunction, once the block structure is finalized.
   */
  void visitExpression(Expression* curr) {
    // Skip if not inside a basic block (CFGWalker state) or if a Block container
    // (Blocks are only containers and have no source locations of their own).
    if (!currBasicBlock || curr->is<Block>()) {
      return;
    }

    currBasicBlock->contents.expressions.push_back(curr);
  }

  /**
   * Called for each function
   * Walks the function and collects expression + basic block data
   */
  void doWalkFunction(Function* func) {
    // Reset state for this function
    expressions.clear();
    blocks.clear();
    blockIndexMap.clear();
    postAnchorByBB.clear();

    // Walk the function using CFGWalker
    CFGWalker<DebugInfoWalker, UnifiedExpressionVisitor<DebugInfoWalker>, BlockContent>::doWalkFunction(func);

    // Build per-block info from the collected expressions. The flat expressions[]
    // array and each block's expressionIndices are built together here (rather
    // than during the walk), so the indices always reference the correct entries
    // regardless of CFG vs. visit ordering.
    for (auto& bb : basicBlocks) {
      BasicBlockInfo blockInfo;

      // Store the index for this block
      blockIndexMap[bb.get()] = blocks.size();

      // A decision block (out-degree >= 2) is the single source of truth for
      // both branch identification (matcher) and counter allocation.
      blockInfo.isDecision = (bb->out.size() >= 2);

      // Entry-anchor: the block's first expression. CFGWalker extends PostWalker,
      // so visit order == execution order, making [0] the first-executed
      // expression. May be unlocated.
      if (!bb->contents.expressions.empty()) {
        blockInfo.anchorExpr = bb->contents.expressions[0];
      } else {
        // Empty block: if it's a fall-through created at the end of a named Block,
        // it can still be counted by post-anchoring a counter onto that Block.
        auto pit = postAnchorByBB.find(bb.get());
        if (pit != postAnchorByBB.end()) {
          blockInfo.postAnchorExpr = pit->second;
        }
      }

      // Collect located expressions for statement coverage. Unlocated
      // expressions are retained (above, for anchoring) but not emitted here.
      for (Expression* curr : bb->contents.expressions) {
        auto locIt = func->debugLocations.find(curr);
        if (locIt == func->debugLocations.end() || !locIt->second.has_value()) {
          continue;
        }
        const auto& loc = locIt->second.value();

        ExpressionInfo info;
        info.type = getExpressionName(curr);
        info.fileIndex = loc.fileIndex;
        info.lineNumber = loc.lineNumber;
        info.columnNumber = loc.columnNumber;
        info.hasDebugLocation = true;

        blockInfo.expressionIndices.push_back(expressions.size());
        expressions.push_back(info);
      }

      blocks.push_back(blockInfo);
    }

    // Now build branch edges between blocks
    for (size_t i = 0; i < basicBlocks.size(); i++) {
      auto& bb = basicBlocks[i];
      for (auto* outBlock : bb->out) {
        auto it = blockIndexMap.find(outBlock);
        if (it != blockIndexMap.end()) {
          blocks[i].branches.push_back(it->second);
        }
      }
    }
  }
};

bool startsWith(const std::string& str, const std::string& prefix) {
  return str.compare(0, prefix.length(), prefix) == 0;
}

/**
 * Check if a function should be instrumented for coverage
 */
bool shouldInstrumentFunction(
  Function* func,
  std::string& excludedLibraryFilePrefix,
  std::string& excludedLibraryFileOverridePrefix,
  std::string& excludedInternalFunctionSubstring
) {
  const std::string& name = func->name.toString();

  // Skip functions without a body
  if (!func->body) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Skip Reason: Empty Function Body" << std::endl;
    }
    return false;
  }
  
  // Skip if this is an import (has non-empty module)
  if (func->module.size() > 0) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Skip Reason: Imported from \"" << func->module.toString() << "\"" << std::endl;
    }
    return false;
  }

  // Skip Internal function (synthetic / injected by a transform)
  if (name.find(excludedInternalFunctionSubstring) != std::string::npos) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Skip Reason: Internal-only function" << std::endl;
    }
    return false;
  }

  // Skip library functions
  if (excludedLibraryFilePrefix.length() > 0 && startsWith(name, excludedLibraryFilePrefix)) {
    if (excludedLibraryFileOverridePrefix.length() != 0) {
      if (startsWith(name, excludedLibraryFileOverridePrefix)) {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " -   Library file but overriding skip to include" << std::endl;
        }
        return true;
      } else {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " -   Skip Reason: Library file" << std::endl;
        }
        return false;
      };
    }

    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Skip Reason: Library file" << std::endl;
    }
    return false;
  }

  // Skip Compiler-generated entry point
  if (name.compare("~start") == 0) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Skip Reason: Module entry point" << std::endl;
    }
    return false;
  }

  return true;
}

/**
 * Find a representative source location for a function by breadth-first search
 * over its body expression tree, returning the location of the SHALLOWEST
 * expression that carries a debug location. Returns a non-existent location if
 * no expression in the body has one.
 *
 * Breadth-first (rather than only the body block's direct children) is required
 * because some runtimes restructure a function's body: the incremental GC runtime
 * injects unlocated allocation/barrier bookkeeping at the body's top level and
 * nests the user's statements deeper, leaving every direct child unlocated. A
 * direct-children-only scan would then find nothing and skip the function from
 * instrumentation entirely (reading 0% coverage despite executing). Descending
 * finds the user's real statement instead. Shallowest-first keeps the choice on a
 * top-level statement and prefers it over a deeply-nested foreign location — e.g.
 * an inlined default-parameter `Const` buried in a call's arguments, which points
 * back to the parameter's definition in another file.
 *
 * The representative location only needs to fall inside the function's own source
 * range so the coverage provider's containment matching attributes the function's
 * entry counter correctly; it need not be perfectly identical across runtimes,
 * because cross-binary hit counts are summed by position downstream.
 */
SourceDebugLocation findFirstLocatedExpression(
  Expression* root,
  const std::unordered_map<wasm::Expression*, std::optional<wasm::Function::DebugLocation>>& debugLocations
) {
  SourceDebugLocation repLoc;
  if (!root) {
    return repLoc;
  }

  std::queue<Expression*> toVisit;
  toVisit.push(root);

  while (!toVisit.empty()) {
    Expression* expr = toVisit.front();
    toVisit.pop();
    if (!expr) {
      continue;
    }

    auto it = debugLocations.find(expr);
    if (it != debugLocations.end() && it->second.has_value()) {
      const auto& loc = it->second.value();
      repLoc.exists = true;
      repLoc.fileIndex = loc.fileIndex;
      repLoc.lineNumber = loc.lineNumber;
      repLoc.columnNumber = loc.columnNumber;
      return repLoc;
    }

    for (auto* child : ChildIterator(expr)) {
      toVisit.push(child);
    }
  }

  return repLoc;
}

SourceDebugLocation getRepresentativeLocation(Function* func) {
  SourceDebugLocation repLoc;

  Expression* body = func->body;
  if (!body) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Function has no body expression - No debug locations available to check" << std::endl;
    }
    return repLoc;
  }

  // Load/Store body: compiler-generated class member accessors (field value
  // getters / setters) whose expressions carry no source locations. Skip them
  // explicitly so they are not instrumented.
  if (body->is<Load>() || body->is<Store>()) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Compiler-generated accessor function (body=" << getExpressionName(body) << ") - No location" << std::endl;
    }
    return repLoc;
  }

  // Breadth-first search the body for the shallowest located expression.
  repLoc = findFirstLocatedExpression(body, func->debugLocations);

  if (DEBUG) {
    if (repLoc.exists) {
      std::cout << LOG_PREFIX << " -   Representative location=" << repLoc.fileIndex << ":"
                << repLoc.lineNumber << ":" << repLoc.columnNumber << std::endl;
    } else {
      std::cout << LOG_PREFIX << " -     Warning: no located expression found in body (" << getExpressionName(body) << ")" << std::endl;
    }
  }

  return repLoc;
}

/**
 * Build a coverage counter-increment sequence for a given counter slot:
 *   counter = i32.load(addr, __coverage_memory)
 *   i32.store(addr, counter + 1, __coverage_memory)
 *
 * Returns the store expression (which embeds the load + increment). Used for
 * both function-entry counters and basic-block counters. Two distinct address
 * Const nodes are built (one for the load, one for the store) so no IR node is
 * aliased into two tree positions; the emitted WASM is identical either way.
 */
Expression* makeCounterIncrement(
  Builder& builder,
  const Name& coverageMemoryWasmName,
  int32_t counterIndex
) {
  const int32_t counterAddressVal = counterIndex * BYTES_PER_COUNTER;

  // Load current counter value
  Expression* counterValue = builder.makeLoad(
    BYTES_PER_COUNTER,  // bytes - size
    false,              // signed - false, treat as unsigned (and no extension needed anyway)
    0,                  // offset - none, we already calculate the address based on data size
    BYTES_PER_COUNTER,  // align - we should always be aligned
    builder.makeConstantExpression(Literal(counterAddressVal)),  // address
    Type::i32,
    coverageMemoryWasmName
  );

  // Increment counter
  Expression* incrementedCounter = builder.makeBinary(
    AddInt32,
    counterValue,
    builder.makeConst(1)
  );

  // Store incremented value back
  return builder.makeStore(
    BYTES_PER_COUNTER,  // bytes
    0,                  // offset
    BYTES_PER_COUNTER,  // align hint
    builder.makeConstantExpression(Literal(counterAddressVal)),  // address
    incrementedCounter, // value
    Type::i32,
    coverageMemoryWasmName
  );
}

/**
 * PostWalker that injects block coverage counters at pre-recorded anchor
 * expressions. For each anchor, wraps it in a Block { counterIncrement, anchor },
 * finalized to the anchor's type — so the value and type seen by the surrounding
 * IR are unchanged, while the counter increments BEFORE the block's first
 * expression executes (entry-anchored).
 *
 * The anchor->counterIndex map holds original IR expression pointers captured
 * during the collection walk. They remain valid through injection because only
 * integer counter indices are assigned in between; the function-entry counter
 * prepend wraps the outer body without moving inner expressions.
 */
struct CounterInjectionWalker : public PostWalker<CounterInjectionWalker, UnifiedExpressionVisitor<CounterInjectionWalker>> {
  Builder& builder;
  Name coverageMemoryWasmName;
  const std::unordered_map<Expression*, int32_t>& anchorToCounterIndex;       // entry-anchored (counter before)
  const std::unordered_map<Expression*, int32_t>& postAnchorToCounterIndex;   // post-anchored (counter after)

  CounterInjectionWalker(
    Builder& b,
    const Name& memName,
    const std::unordered_map<Expression*, int32_t>& preMap,
    const std::unordered_map<Expression*, int32_t>& postMap
  ) : builder(b), coverageMemoryWasmName(memName),
      anchorToCounterIndex(preMap), postAnchorToCounterIndex(postMap) {}

  void visitExpression(Expression* curr) {
    auto it = anchorToCounterIndex.find(curr);
    if (it != anchorToCounterIndex.end()) {
      Expression** currp = getCurrentPointer();
      Expression* counterInc = makeCounterIncrement(builder, coverageMemoryWasmName, it->second);
      // Entry-anchored: counter increment runs before the anchor expression.
      Block* wrapped = builder.makeBlock();
      wrapped->list.push_back(counterInc);
      wrapped->list.push_back(*currp);
      wrapped->finalize(curr->type);
      *currp = wrapped;
      return;
    }

    auto pit = postAnchorToCounterIndex.find(curr);
    if (pit != postAnchorToCounterIndex.end()) {
      Expression** currp = getCurrentPointer();
      Expression* counterInc = makeCounterIncrement(builder, coverageMemoryWasmName, pit->second);
      // Post-anchored: counter runs AFTER the (named) Block, so it increments when
      // control branches/falls to that block's end (an empty fall-through case).
      Block* wrapped = builder.makeBlock();
      wrapped->list.push_back(*currp);
      wrapped->list.push_back(counterInc);
      // finalize(curr->type) is safe here because post-anchoring only ever targets empty
      // fall-through switch-case control blocks, which are always void — so curr->type is
      // `none`, matching the void counter-store that is this block's last element. A
      // value-producing block would need its result preserved across the counter; that
      // shape never occurs.
      wrapped->finalize(curr->type);
      *currp = wrapped;
      return;
    }
  }
};

/**
 * Instrument WASM binary for coverage and regenerate source map
 *
 * This function:
 * 1. Reads WASM binary with source map
 * 2. Adds __coverage_memory import (multi-memory for coverage counters)
 * 3. Instruments each user function with coverage counter increment
 * 4. Extracts debug information
 * 5. Writes instrumented binary with regenerated source map
 *
 * @param wasmBuffer - Node.js Buffer containing WASM binary
 * @param sourceMapBuffer - Node.js Buffer containing source map JSON
 * @returns Object with { instrumentedWasm, sourceMap, debugInfo }
 */
Napi::Object InstrumentForCoverage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Validate arguments
  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected 3 arguments: wasmBuffer, sourceMapBuffer, instrumentationOptions")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Argument 0 (wasmBuffer) must be a Buffer (WASM binary)")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }

  if (!info[1].IsBuffer()) {
    Napi::TypeError::New(env, "Argument 1 (sourceMapBuffer) must be a Buffer (source map)")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }
  
  if (!info[2].IsObject()) {
    Napi::TypeError::New(env, "Argument 2 (instrumentationOptions) must be supplied as an object")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }

  try {
    // Extract buffer data
    Napi::Buffer<char> wasmBuf = info[0].As<Napi::Buffer<char>>();
    Napi::Buffer<char> sourceMapBuf = info[1].As<Napi::Buffer<char>>();

    // Extract options
    const Napi::Object options = info[2].As<Napi::Object>();
    
    // Extracted options
    std::unordered_set<std::string> excludedFiles;
    std::string excludedLibraryFilePrefix;
    std::string excludedLibraryFileOverridePrefix = "";
    std::string excludedInternalFunctionSubstring = "";
    std::string coverageMemoryModule = "";
    std::string coverageMemoryName = "";

    if (options.Has("logPrefix")) {
      Napi::Value logPrefixProp = options.Get("logPrefix");
      if (logPrefixProp.IsString()) {
        LOG_PREFIX = logPrefixProp.As<Napi::String>().Utf8Value();
      }
    }

    if (options.Has("debug")) {
      Napi::Value debugProperty = options.Get("debug");
      if (debugProperty.IsBoolean()) {
        DEBUG = debugProperty.As<Napi::Boolean>().Value();

        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - DEBUG enabled" << std::endl;
        }
      }
    }
    
    if (options.Has("excludedFiles")) {
      Napi::Value excludedFilesProperty = options.Get("excludedFiles");
      if (excludedFilesProperty.IsArray()) {
        const Napi::Array filesArray = excludedFilesProperty.As<Napi::Array>();

        const int32_t count = filesArray.Length();
        if (DEBUG && count > 0) {
          std::cout << LOG_PREFIX << " - OPTIONS - " << count << " Excluded Files:" << std::endl;
        } else if (DEBUG) {
          std::cout << LOG_PREFIX << " - 0 Excluded Files" << std::endl;
        }

        for (int32_t i = 0; i < count; i++) {
          Napi::Value fileItem = filesArray[i];
          if (fileItem.IsString()) {
            const std::string file = fileItem.As<Napi::String>().Utf8Value();
            excludedFiles.insert(file);
            if (DEBUG) {
              std::cout << LOG_PREFIX << " -   [" << i << "] \"" << file << "\"" << std::endl;
            }
          }
        }
      }
    }

    if (options.Has("excludedLibraryFilePrefix")) {
      Napi::Value libraryFilePrefixProperty = options.Get("excludedLibraryFilePrefix");
      if (libraryFilePrefixProperty.IsString()) {
        excludedLibraryFilePrefix = libraryFilePrefixProperty.As<Napi::String>().Utf8Value();
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Excluded Library File Prefix: \"" << excludedLibraryFilePrefix << "\"" << std::endl;
        }
      }
    }
    
    if (options.Has("excludedLibraryFileOverridePrefix")) {
      Napi::Value libraryFileOverridePrefixProperty = options.Get("excludedLibraryFileOverridePrefix");
      if (libraryFileOverridePrefixProperty.IsString()) {
        excludedLibraryFileOverridePrefix = libraryFileOverridePrefixProperty.As<Napi::String>().Utf8Value();
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Excluded Library File Override Prefix: \"" << excludedLibraryFileOverridePrefix << "\"" << std::endl;
        }
      }
    }
    
    if (options.Has("excludedInternalFunctionSubstring")) {
      Napi::Value internalFunctionSubstringProperty = options.Get("excludedInternalFunctionSubstring");
      if (internalFunctionSubstringProperty.IsString()) {
        excludedInternalFunctionSubstring = internalFunctionSubstringProperty.As<Napi::String>().Utf8Value();
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Excluded Internal Function Name Substring: \"" << excludedInternalFunctionSubstring << "\"" << std::endl;
        }
      }
    }

    if (options.Has("coverageMemoryModule")) {
      Napi::Value coverageMemoryModuleProperty = options.Get("coverageMemoryModule");
      if (coverageMemoryModuleProperty.IsString()) {
        coverageMemoryModule = coverageMemoryModuleProperty.As<Napi::String>().Utf8Value();
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Coverage Memory Module: \"" << coverageMemoryModule << "\"" << std::endl;
        }
      }
    }
    
    if (options.Has("coverageMemoryName")) {
      Napi::Value coverageMemoryNameProperty = options.Get("coverageMemoryName");
      if (coverageMemoryNameProperty.IsString()) {
        coverageMemoryName = coverageMemoryNameProperty.As<Napi::String>().Utf8Value();
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Coverage Memory Name: \"" << coverageMemoryName << "\"" << std::endl;
        }
      }
    }

    std::vector<char> wasmData(wasmBuf.Data(), wasmBuf.Data() + wasmBuf.Length());
    std::vector<char> sourceMapData(sourceMapBuf.Data(), sourceMapBuf.Data() + sourceMapBuf.Length());

    // Parse WASM binary with source map
    Module module;
    WasmBinaryReader reader(module, FeatureSet::All, wasmData, sourceMapData);
    reader.setDebugInfo(true);
    reader.read();

    if (DEBUG) {
      std::cout << LOG_PREFIX << " - Read binary module with " << module.functions.size() << " functions" << std::endl;
      std::cout << LOG_PREFIX << " - Debug source files: " << module.debugInfoFileNames.size() << std::endl;
      for (size_t i = 0; i < module.debugInfoFileNames.size(); i++) {
        std::cout << LOG_PREFIX << " -   [" << i << "] " << module.debugInfoFileNames[i] << std::endl;
      }
    }

    // Instrument functions and collect debug info
    Builder builder(module);
    int32_t coverageIndex = 0;
    std::vector<FunctionInfo> instrumentedFunctions;

    // Enable multi-memory feature for coverage memory
    module.features.setMultiMemory(true);

    // secondary memory import used to store coverage counters
    const Name coverageMemoryWasmName(coverageMemoryName);

    // Create walker for debug info extraction
    DebugInfoWalker walker(&module);

    ModuleUtils::iterDefinedFunctions(module, [&](Function* func) {
      std::string funcName = func->name.toString();

      if (DEBUG) {
        std::cout << LOG_PREFIX << " - Processing function: \"" << funcName << "\"" << std::endl;
      }

      // Check if this function should be instrumented
      if (!shouldInstrumentFunction(func, excludedLibraryFilePrefix, excludedLibraryFileOverridePrefix, excludedInternalFunctionSubstring)) {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " -   SKIP function (quick filtered): \"" << funcName << "\"" << std::endl;
        }
        return;
      }

      // Determine the representative location and excluded-file status BEFORE
      // the CFG walk, so excluded / unlocatable functions skip the walk
      // entirely. repLoc depends only on func->body + func->debugLocations
      // (populated by the binary reader, not the walk), so it is available here.
      const SourceDebugLocation representativeLocation = getRepresentativeLocation(func);

      // skip function if it has no representative location
      if (!representativeLocation.exists) {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " -   SKIP function (No Representative Location, body=" << getExpressionName(func->body) << "): "
                    << "\"" << funcName << "\"" << std::endl;
        }
        return;
      }

      // Skip function if located within excluded file
      const std::string functionDebugFilePath =  module.debugInfoFileNames[representativeLocation.fileIndex];
      if (excludedFiles.find(functionDebugFilePath) != excludedFiles.end()) {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " -   SKIP function (excluded location file [" << representativeLocation.fileIndex << "] \""
                    << functionDebugFilePath <<"\"): \"" << funcName << "\"" << std::endl;
        }
        return;
      }

      // Walk function to collect expressions and basic blocks
      walker.walkFunctionInModule(func, &module);

      if (DEBUG) {
        std::cout << LOG_PREFIX << " -   CFG Walked function - expressions with locations: " << walker.expressions.size() << std::endl;
        std::cout << LOG_PREFIX << " -   Selected reprLoc=" << representativeLocation.fileIndex << ":" << representativeLocation.lineNumber
                  << ":" << representativeLocation.columnNumber << " | Now instrumenting with coverageMemoryIndex [" << coverageIndex << "]"
                  << " | " << std::endl;
      }

      // Store function info for later output
      FunctionInfo funcInfo;
      funcInfo.name = funcName;
      funcInfo.representativeLocation = representativeLocation;
      funcInfo.coverageMemoryIndex = coverageIndex;
      funcInfo.expressions = walker.expressions;
      funcInfo.blocks = walker.blocks;
      funcInfo.func = func;

      // add to list
      instrumentedFunctions.push_back(funcInfo);

      // Prepend function-entry counter increment to the function body
      func->body = builder.makeSequence(
        makeCounterIncrement(builder, coverageMemoryWasmName, coverageIndex),
        func->body,
        func->body->type
      );

      if (DEBUG) {
        std::cout << LOG_PREFIX << " -   INSTRUMENTED \"" << funcName << "\" | coverageMemoryIndex [" << coverageIndex << "]"
                  << " | reprLoc=" << representativeLocation.fileIndex << ":" << representativeLocation.lineNumber
                  << ":" << representativeLocation.columnNumber << std::endl;
      }

      coverageIndex++;
    });

    // ── Block counter assignment (region 2) + injection ──
    // Function-entry counters occupy indices [0, coverageIndex) — region 1, with
    // contiguous per-function indices. Block counters are assigned next, so
    // function counter indices stay stable and the existing per-function read
    // path is unaffected until the executor is updated to read the full array.
    const int32_t functionCounterCount = coverageIndex;
    for (auto& funcInfo : instrumentedFunctions) {
      std::unordered_map<Expression*, int32_t> anchorToCounterIndex;
      std::unordered_map<Expression*, int32_t> postAnchorToCounterIndex;

      for (auto& block : funcInfo.blocks) {
        // Instrument a block if it has a located expression (statement coverage)
        // OR is a decision (branch coverage needs the decision's hit count), via
        // an entry anchor (the block's first expression).
        const bool entryInstrument =
          (!block.expressionIndices.empty() || block.isDecision) && block.anchorExpr != nullptr;
        if (entryInstrument) {
          block.coverageMemoryIndex = coverageIndex++;
          anchorToCounterIndex[block.anchorExpr] = block.coverageMemoryIndex;
          continue;
        }

        // An empty fall-through block (e.g. an empty switch case) has no entry
        // anchor, but can be counted by post-anchoring onto the named Block it
        // falls out of. (A fused-logical decision block — `if (a && b)`, whose
        // condition is a control-flow construct CFGWalker never visits — is empty
        // with no post-anchor and is still not counted here.)
        if (block.postAnchorExpr != nullptr) {
          block.coverageMemoryIndex = coverageIndex++;
          postAnchorToCounterIndex[block.postAnchorExpr] = block.coverageMemoryIndex;
        }
      }

      if (!anchorToCounterIndex.empty() || !postAnchorToCounterIndex.empty()) {
        CounterInjectionWalker injector(builder, coverageMemoryWasmName, anchorToCounterIndex, postAnchorToCounterIndex);
        injector.walkFunctionInModule(funcInfo.func, &module);
      }
    }

    if (DEBUG) {
      std::cout << LOG_PREFIX << " - Counters: " << functionCounterCount << " function-entry + "
                << (coverageIndex - functionCounterCount) << " block = " << coverageIndex << " total" << std::endl;
    }

    int32_t requiredCoverageMemoryPages = std::ceil(coverageIndex / static_cast<double>(COUNTERS_PER_PAGE));

    // Add __coverage_memory import
    auto coverageMemory = Builder::makeMemory(coverageMemoryWasmName);
    coverageMemory->module = coverageMemoryModule;
    coverageMemory->base = coverageMemoryName;
    coverageMemory->shared = false;
    coverageMemory->initial = requiredCoverageMemoryPages;
    coverageMemory->max = requiredCoverageMemoryPages;

    if (DEBUG) {
      std::cout << LOG_PREFIX << " - Coverage memory pages set to: " << requiredCoverageMemoryPages << std::endl;
    }
    
    module.addMemory(std::move(coverageMemory));

    if (DEBUG) {
      std::cout << LOG_PREFIX << " - Instrumentation complete: " << functionCounterCount << " functions instrumented" << std::endl;
    }

    // Write instrumented module with source map regeneration
    BufferWithRandomAccess outputBuffer;
    PassOptions passOptions;
    WasmBinaryWriter writer(&module, outputBuffer, passOptions);
    writer.setNamesSection(true);

    // Set up source map output stream
    std::ostringstream sourceMapStream;
    writer.setSourceMap(&sourceMapStream, "output.wasm");

    writer.write();

    // Build result object
    Napi::Object result = Napi::Object::New(env);

    // Convert instrumented binary to Buffer
    Napi::Buffer<char> instrumentedWasm = Napi::Buffer<char>::Copy(
      env,
      reinterpret_cast<const char*>(outputBuffer.data()),
      outputBuffer.size()
    );
    result.Set("instrumentedWasm", instrumentedWasm);

    // Convert source map to string
    std::string sourceMapStr = sourceMapStream.str();
    result.Set("sourceMap", Napi::String::New(env, sourceMapStr));

    // Build debug info object (similar structure to ExtractDebugInfo output)
    Napi::Object debugInfo = Napi::Object::New(env);

    // Add debug source files
    Napi::Array debugSourceFiles = Napi::Array::New(env, module.debugInfoFileNames.size());
    for (size_t i = 0; i < module.debugInfoFileNames.size(); i++) {
      debugSourceFiles[i] = Napi::String::New(env, module.debugInfoFileNames[i]);
    }
    debugInfo.Set("debugSourceFiles", debugSourceFiles);

    // Total counter slots (function-entry + block). Used by the executor to size
    // its read of coverage memory once it reads block counters.
    debugInfo.Set("totalInstrumentationCounters", Napi::Number::New(env, coverageIndex));

    // Add function information
    Napi::Array functions = Napi::Array::New(env, instrumentedFunctions.size());

    for (size_t i = 0; i < instrumentedFunctions.size(); i++) {
      const auto& funcInfo = instrumentedFunctions[i];
      Napi::Object funcObj = Napi::Object::New(env);

      funcObj.Set("name", Napi::String::New(env, funcInfo.name));
      funcObj.Set("wasmIndex", Napi::Number::New(env, i));
      funcObj.Set("coverageMemoryIndex", Napi::Number::New(env, funcInfo.coverageMemoryIndex));

      Napi::Object reprLoc = Napi::Object::New(env);
      reprLoc.Set("fileIndex", Napi::Number::New(env, funcInfo.representativeLocation.fileIndex));
      reprLoc.Set("line", Napi::Number::New(env, funcInfo.representativeLocation.lineNumber));
      reprLoc.Set("column", Napi::Number::New(env, funcInfo.representativeLocation.columnNumber));
      funcObj.Set("representativeLocation", reprLoc);

      // Add expressions array
      Napi::Array expressions = Napi::Array::New(env, funcInfo.expressions.size());
      for (size_t j = 0; j < funcInfo.expressions.size(); j++) {
        const auto& expr = funcInfo.expressions[j];
        Napi::Object exprObj = Napi::Object::New(env);

        exprObj.Set("type", Napi::String::New(env, expr.type));

        if (expr.hasDebugLocation) {
          Napi::Object location = Napi::Object::New(env);
          location.Set("fileIndex", Napi::Number::New(env, expr.fileIndex));
          location.Set("line", Napi::Number::New(env, expr.lineNumber));
          location.Set("column", Napi::Number::New(env, expr.columnNumber));
          exprObj.Set("location", location);
        }

        expressions[j] = exprObj;
      }
      funcObj.Set("expressions", expressions);

      // Add basic blocks array
      Napi::Array basicBlocks = Napi::Array::New(env, funcInfo.blocks.size());
      for (size_t j = 0; j < funcInfo.blocks.size(); j++) {
        const auto& block = funcInfo.blocks[j];
        Napi::Object blockObj = Napi::Object::New(env);

        blockObj.Set("index", Napi::Number::New(env, j));
        blockObj.Set("isDecision", Napi::Boolean::New(env, block.isDecision));
        // Post-anchored: an empty fall-through switch case whose counter sits AFTER
        // the named Block it falls out of (it has a counter but no located expression
        // of its own). This is the sole source of emptyCaseHits.
        blockObj.Set("isPostAnchored", Napi::Boolean::New(env, block.postAnchorExpr != nullptr));
        if (block.coverageMemoryIndex >= 0) {
          blockObj.Set("coverageMemoryIndex", Napi::Number::New(env, block.coverageMemoryIndex));
        }

        Napi::Array exprIndices = Napi::Array::New(env, block.expressionIndices.size());
        for (size_t k = 0; k < block.expressionIndices.size(); k++) {
          exprIndices[k] = Napi::Number::New(env, block.expressionIndices[k]);
        }
        blockObj.Set("expressionIndices", exprIndices);

        Napi::Array branches = Napi::Array::New(env, block.branches.size());
        for (size_t k = 0; k < block.branches.size(); k++) {
          Napi::Object branchObj = Napi::Object::New(env);
          branchObj.Set("targetBlockIndex", Napi::Number::New(env, block.branches[k]));
          branches[k] = branchObj;
        }
        blockObj.Set("branches", branches);

        basicBlocks[j] = blockObj;
      }
      funcObj.Set("basicBlocks", basicBlocks);

      functions[i] = funcObj;
    }

    debugInfo.Set("functions", functions);

    result.Set("debugInfo", debugInfo);

    return result;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to instrument for coverage: ") + e.what())
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  } catch (...) {
    Napi::Error::New(env, "Failed to instrument for coverage: Unknown error")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }
}

/**
 * Initialize the addon
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("instrumentForCoverage", Napi::Function::New(env, InstrumentForCoverage));
  return exports;
}

NODE_API_MODULE(wasm_binaryen_debug_instrumenter, Init);
