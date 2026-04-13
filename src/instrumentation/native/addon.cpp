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

// Binaryen C++ API headers
#include "wasm-binary.h"
#include "wasm-io.h"
#include "wasm-builder.h"
#include "ir/module-utils.h"
#include "ir/names.h"
#include "cfg/cfg-traversal.h"
#include "support/name.h"
#include "pass.h"

using namespace wasm;

// 32
const uint32_t BYTES_PER_COUNTER = 4;

// 1 page = 64KB / 4bytes (32bits) each = 16384 counters
const uint32_t COUNTERS_PER_PAGE = 16384;

// TODO - pass these through the call stack as params instead
// for now we don't expect them to  change between different calls
// in the same thread over the same vitest run, so it's safe to use this approach
thread_local bool DEBUG = false;
thread_local std::string LOG_PREFIX = "InstNative";

struct SourceDebugLocation {
  bool exists = false;
  uint32_t fileIndex = 0;              // Debug location file index
  uint32_t lineNumber = 0;            // Debug location line number
  uint32_t columnNumber = 0;          // Debug location column number
};

/**
 * Structure to hold expression information during AST walk
 */
struct ExpressionInfo {
  std::string type;                    // Expression type name
  uint32_t fileIndex;                  // Debug location file index
  uint32_t lineNumber;                 // Debug location line number
  uint32_t columnNumber;               // Debug location column number
  bool hasDebugLocation;               // Whether debug location exists
  bool isBranch;                       // Whether this is a branch expression
  uint32_t branchPaths;                // Number of branch paths (if isBranch)
};

/**
 * Structure to hold basic block information
 */
struct BasicBlockInfo {
  std::vector<size_t> expressionIndices;  // Indices into the flat expression array
  std::vector<size_t> branches;            // Indices of blocks this block branches to
};

// Data structure to collect function info during instrumentation
struct FunctionInfo {
  std::string name;
  uint32_t coverageMemoryIndex;
  SourceDebugLocation representativeLocation;
  std::vector<ExpressionInfo> expressions;
  std::vector<BasicBlockInfo> blocks;
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

  explicit DebugInfoWalker(Module* m) : module(m) {}

  /**
   * Called for each expression during CFG walk
   * Collects expression info and adds to current basic block
   */
  void visitExpression(Expression* curr) {
    // skip collecting expressions if:
    //   - Not currently inside a basicBlock (`currBasicBlock` provided by CFGWalker)
    //   - expression is a Block (Blocks are only containers and have no debug locations)
    if (!currBasicBlock || curr->is<Block>()) {
      return;
    }

    // Get debug location from function's debugLocations map
    Function* func = getFunction();
    ExpressionInfo info;
    info.hasDebugLocation = false;

    // Check debugLocations map
    auto it = func->debugLocations.find(curr);
    if (it != func->debugLocations.end() && it->second.has_value()) {
      const auto& loc = it->second.value();
      info.fileIndex = loc.fileIndex;
      info.lineNumber = loc.lineNumber;
      info.columnNumber = loc.columnNumber;
      info.hasDebugLocation = true;
    }

    // skip expressions without debug locations
    // TODO - determine if this will cause problems in branch coverage
    if (!info.hasDebugLocation) {
      return;
    }

    info.type = getExpressionName(curr);  // Expression type string

    // Determine if this is a branch expression and count paths
    info.isBranch = false;
    info.branchPaths = 0;

    // TODO - determine if we're missing any branch types (SIMDTernary?)
    if (curr->is<If>()) {
      info.isBranch = true;
      auto* ifExpr = curr->cast<If>();
      info.branchPaths = ifExpr->ifFalse ? 2 : 1;  // If/else = 2, if only = 1
    } else if (curr->is<Break>()) {
      info.isBranch = true;
      info.branchPaths = 2;  // Branch taken or not (conditional break)
    } else if (curr->is<Select>()) {
      info.isBranch = true;
      info.branchPaths = 2;  // True or false condition
    } else if (curr->is<Switch>()) {
      info.isBranch = true;
      auto* switchExpr = curr->cast<Switch>();
      info.branchPaths = switchExpr->targets.size() + 1;  // N targets + default
    }

    // Add to flat expressions array
    expressions.push_back(info);

    // Add expression to current basic block's content
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

    // Walk the function using CFGWalker
    CFGWalker<DebugInfoWalker, UnifiedExpressionVisitor<DebugInfoWalker>, BlockContent>::doWalkFunction(func);

    // After walk, build out basic block info with expression indices.
    // `basicBlocks` provided by CFGWalker, now populated after the function walk
    size_t exprIndex = 0;
    for (auto& bb : basicBlocks) {  
      BasicBlockInfo blockInfo;

      // Store the index for this block
      blockIndexMap[bb.get()] = blocks.size();

      // Record expression indices for this block
      size_t expressionCount = bb->contents.expressions.size();
      for (size_t i = 0; i < expressionCount; i++) {
        blockInfo.expressionIndices.push_back(exprIndex++);
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
 * Find representative expression within a function's Block-type body (Return preferred, then first non-Const)
 */
SourceDebugLocation getRepresentativeLocationInBlockBody(
  Block* blockBody,
  const std::unordered_map<wasm::Expression*, std::optional<wasm::Function::DebugLocation>> debugLocations
) {
  SourceDebugLocation repLoc;

  if (DEBUG) {
    std::cout << LOG_PREFIX << " -     Checking func Block body: " << blockBody->list.size() << " body expressions" << std::endl;
  }
  
  for (size_t i = 0; i < blockBody->list.size(); i++) {
    Expression* exprInBlockBody = blockBody->list[i];

    if (exprInBlockBody) {
      auto it = debugLocations.find(exprInBlockBody);
      if (it != debugLocations.end() && it->second.has_value()) {
        const auto& loc = it->second.value();

        repLoc.exists = true;
        repLoc.fileIndex = loc.fileIndex;
        repLoc.lineNumber = loc.lineNumber;
        repLoc.columnNumber = loc.columnNumber;

        if (DEBUG) {
          std::cout << LOG_PREFIX << " -     Block body expr [" << i << "] (" << getExpressionName(exprInBlockBody) << ")="
                    << loc.fileIndex << ":" << loc.lineNumber << ":" << loc.columnNumber << " - break" << std::endl;
        }

        break;
        
      } else if (DEBUG) {
        std::cout << LOG_PREFIX << " -     Block body expr [" << i << "] (" << getExpressionName(exprInBlockBody) << ") - No location" << std::endl;
      }
    } else if (DEBUG) {
      std::cout << LOG_PREFIX << " -     WARNING: Block body expr [" << i << "] - EMPTY" << std::endl;
    }
  }

  return repLoc;
}

SourceDebugLocation getRepresentativeLocation(Function* func) {
  SourceDebugLocation repLoc;

  // Get body expression debug location
  Expression* body = func->body;

  if (!body) {
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Function has no body expression - No debug locations available to check" << std::endl;
    }
    return repLoc;
  }

  const std::string bodyType = getExpressionName(body);

  if (body->is<Load>() || body->is<Store>()) {
    // Load/Store body:
    //   - Compiler-generated functions with no expressions with locations
    //   - LOAD: Compiler-generated class member getters (field value getters, function member getters)
    //   - STORE: Compiler-generated class member value setters (field value setters)
    // 
    // Note: compiler-generated class member function setters use a Block body also,
    // but their expressions (Store+Call) have no locations
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Compiler-generated accessor function (body=" << bodyType << ") - No location" << std::endl;
    }
    return repLoc;
  } else if (body->is<Block>()) {
    // Block body:
    //   - Block expressions are only containers and have no source locations of their own
    //   - Examine expressions within the block body to find location, if one exists
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Checking function Block body expression list" << std::endl;
    }

    repLoc = getRepresentativeLocationInBlockBody(body->cast<Block>(), func->debugLocations);
  }

  // use body expression's debug location if available
  auto it = func->debugLocations.find(body);
  if (it != func->debugLocations.end() && it->second.has_value()) {
    const auto& loc = it->second.value();
    repLoc.exists = true;
    repLoc.fileIndex = loc.fileIndex;
    repLoc.lineNumber = loc.lineNumber;
    repLoc.columnNumber = loc.columnNumber;
    
    if (DEBUG) {
      std::cout << LOG_PREFIX << " -   Using function body (" << bodyType << ")="
                << repLoc.fileIndex << ":" << repLoc.lineNumber << ":" << repLoc.columnNumber << std::endl;
    }
  }

  if (!repLoc.exists && DEBUG) {
    std::cout << LOG_PREFIX << " -     Warning: Location expected on function body (" << bodyType << ") - No location found" << std::endl;
  }

  return repLoc;
}

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

    // 1 page = 64KB / 4bytes (32bits) each = 16384 counters
    uint32_t coverageMemoryPagesMin = 1;
    // 4 pages = 256KB / 4bytes (32bits) each = 65536 counters
    uint32_t coverageMemoryPagesMax = 4;
    uint32_t maxCounters = coverageMemoryPagesMax * COUNTERS_PER_PAGE;

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

        const uint32_t count = filesArray.Length();
        if (DEBUG && count > 0) {
          std::cout << LOG_PREFIX << " - OPTIONS - " << count << " Excluded Files:" << std::endl;
        } else if (DEBUG) {
          std::cout << LOG_PREFIX << " - 0 Excluded Files" << std::endl;
        }

        for (size_t i = 0; i < count; i++) {
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
    
    if (options.Has("coverageMemoryPagesMin")) {
      Napi::Value coverageMinProperty = options.Get("coverageMemoryPagesMin");
      if (coverageMinProperty.IsNumber()) {
        coverageMemoryPagesMin = coverageMinProperty.As<Napi::Number>().Int32Value();
        
        if (DEBUG) {
          const uint32_t minCounters = coverageMemoryPagesMin * COUNTERS_PER_PAGE;
          std::cout << LOG_PREFIX << " - OPTIONS - Coverage Memory Pages MIN: " << coverageMemoryPagesMin
                    << " (" << minCounters << " counters)" << std::endl;
        }
      }
    }
    
    if (options.Has("coverageMemoryPagesMax")) {
      Napi::Value coverageMaxProperty = options.Get("coverageMemoryPagesMax");
      if (coverageMaxProperty.IsNumber()) {
        coverageMemoryPagesMax = coverageMaxProperty.As<Napi::Number>().Int32Value();
        maxCounters = coverageMemoryPagesMax * COUNTERS_PER_PAGE;
        
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - OPTIONS - Coverage Memory Pages MAX: " << coverageMemoryPagesMax
                    << " (" << maxCounters << " counters)" << std::endl;
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
    uint32_t coverageIndex = 0;
    std::vector<FunctionInfo> instrumentedFunctions;

    // Enable multi-memory feature for coverage memory
    module.features.setMultiMemory(true);

    // Add __coverage_memory import
    // This is a secondary memory used to store coverage counters
    Name coverageMemoryName("__coverage_memory");
    auto coverageMemory = Builder::makeMemory(coverageMemoryName);
    coverageMemory->module = "__as_pool_env__";
    coverageMemory->base = "__coverage_memory";
    coverageMemory->initial = coverageMemoryPagesMin;
    coverageMemory->max = coverageMemoryPagesMax;
    coverageMemory->shared = false;
    module.addMemory(std::move(coverageMemory));

    // Create walker for debug info extraction
    DebugInfoWalker walker(&module);

    ModuleUtils::iterDefinedFunctions(module, [&](Function* func) {
      std::string funcName = func->name.toString();

      if (coverageIndex >= maxCounters) {
        if (DEBUG) {
          std::cout << LOG_PREFIX << " - ERROR: Processing function: \"" << funcName << "\""
                    << " Further instrumentation would exceed max covergare memory size" << std::endl;
        }
        return;
      }

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

      // Walk function to collect expressions and basic blocks
      walker.walkFunctionInModule(func, &module);
      
      if (DEBUG) {
        std::cout << LOG_PREFIX << " -   CFG Walked function - expressions with locations: " << walker.expressions.size() << std::endl;
      }

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

      if (DEBUG) {
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

      // add to list
      instrumentedFunctions.push_back(funcInfo);

      // Coverage instrumentation:
      //   counter = i32.load(addr, __coverage_memory)
      //   incremented = counter + 1
      //   i32.store(addr, incremented, __coverage_memory)

      const uint32_t counterAddressVal = coverageIndex * BYTES_PER_COUNTER;
      Expression* counterAddress = builder.makeConstantExpression(Literal(counterAddressVal));

      // Load current counter value
      Expression* counterValue = builder.makeLoad(
        BYTES_PER_COUNTER,  // bytes - size
        false,              // signed - false, treat as unsigned (and no extension needed anyway)
        0,                  // offset - none, we already calculate the address based on data size
        BYTES_PER_COUNTER,  // align - we should always be aligned
        counterAddress,     // address
        Type::i32,
        coverageMemoryName
      );

      // Increment counter
      Expression* incrementedCounter = builder.makeBinary(
        AddInt32,
        counterValue,
        builder.makeConst(1)
      );

      Expression* storeCounter = builder.makeStore(
        BYTES_PER_COUNTER,  // bytes
        0,                  // offset
        BYTES_PER_COUNTER,  // align hint
        counterAddress,     // address
        incrementedCounter, // value
        Type::i32,
        coverageMemoryName
      );

      // Prepend instrumentation to function body
      func->body = builder.makeSequence(storeCounter, func->body, func->body->type);

      if (DEBUG) {
        std::cout << LOG_PREFIX << " -   INSTRUMENTED \"" << funcName << "\" | coverageMemoryIndex [" << coverageIndex << "]"
                  << " | reprLoc=" << representativeLocation.fileIndex << ":" << representativeLocation.lineNumber
                  << ":" << representativeLocation.columnNumber << std::endl;
      }

      coverageIndex++;
    });

    if (DEBUG) {
      std::cout << LOG_PREFIX << " - Instrumentation complete: " << coverageIndex << " functions instrumented" << std::endl;
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
        exprObj.Set("isBranch", Napi::Boolean::New(env, expr.isBranch));
        if (expr.isBranch) {
          exprObj.Set("branchPaths", Napi::Number::New(env, expr.branchPaths));
        }

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
