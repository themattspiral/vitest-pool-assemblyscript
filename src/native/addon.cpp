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
#include <set>
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

/**
 * Structure to hold expression information during AST walk
 */
struct ExpressionInfo {
  std::string type;                    // Expression type name
  Expression::Id typeId;               // Expression type ID (for efficient comparison)
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

/**
 * Custom content structure for CFGWalker
 */
struct BlockContent {
  std::vector<Expression*> expressions;
};

// Data structure to collect function info during instrumentation
struct FunctionInfo {
  std::string name;
  uint32_t coverageMemoryIndex;
  int homeFileIndex;
  bool hasReturnExpression;
  ExpressionInfo returnExpression;
  bool hasFirstNonConstExpression;
  ExpressionInfo firstNonConstExpression;
  std::vector<ExpressionInfo> expressions;
  std::vector<BasicBlockInfo> blocks;
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
    if (!currBasicBlock || curr->is<Block>()) {
      return;  // Skip if no current block or if it's a Block expression
    }

    // Add expression to current basic block's content
    currBasicBlock->contents.expressions.push_back(curr);

    // Get debug location from function's debugLocations map
    Function* func = getFunction();
    ExpressionInfo info;
    info.type = getExpressionName(curr);  // Use Binaryen's built-in function
    info.typeId = curr->_id;              // Store ID for efficient comparison
    info.hasDebugLocation = false;

    // Check debugLocations map (version_124+ returns std::optional)
    auto it = func->debugLocations.find(curr);
    if (it != func->debugLocations.end() && it->second.has_value()) {
      const auto& loc = it->second.value();
      info.fileIndex = loc.fileIndex;
      info.lineNumber = loc.lineNumber;
      info.columnNumber = loc.columnNumber;
      info.hasDebugLocation = true;
    } else {
      // No debug location - set defaults
      info.fileIndex = -1;
      info.lineNumber = -1;
      info.columnNumber = -1;
    }

    // Determine if this is a branch expression and count paths
    info.isBranch = false;
    info.branchPaths = 0;

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

    // After walk, build basic block info with expression indices
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

/**
 * Extract the "home file" base path from a function name
 *
 * Function names follow patterns like:
 *   - "test-fixtures/assembly-src/class-utils/Counter#constructor~anonymous|1"
 *   - "start:test-fixtures/assembly/class.as.test~anonymous|2"
 *   - "~lib/rt/stub/__alloc"
 *
 * This extracts the base file path (without extension) that should match
 * an entry in debugSourceFiles.
 *
 * Algorithm:
 *   1. Truncate at first '~' (removes anonymous suffixes)
 *   2. If starts with "start:", remove prefix - remaining IS the file path
 *   3. Otherwise, remove last '/' component (class/function name)
 *
 * Returns empty string if extraction fails.
 */
std::string extractHomeFilePath(const std::string& funcName) {
  std::string path = funcName;

  // Step 1: Truncate at first '~' (removes ~anonymous|N suffixes)
  size_t tildePos = path.find('~');
  if (tildePos != std::string::npos) {
    path = path.substr(0, tildePos);
  }

  // Step 2: Check for "start:" prefix
  const std::string startPrefix = "start:";
  if (path.rfind(startPrefix, 0) == 0) {
    // Remove "start:" prefix - the remaining path IS the file path
    return path.substr(startPrefix.length());
  }

  // Step 3: Remove last '/' component (function name or ClassName#method)
  size_t lastSlash = path.rfind('/');
  if (lastSlash != std::string::npos && lastSlash > 0) {
    return path.substr(0, lastSlash);
  }

  // Couldn't extract - return empty
  return "";
}

/**
 * Find the file index in debugSourceFiles that matches a base path
 *
 * Compares by checking if the source file path starts with the base path.
 * For example: base "test-fixtures/assembly-src/class-utils" matches
 * source file "test-fixtures/assembly-src/class-utils.ts"
 *
 * Returns -1 if no match found.
 */
int findHomeFileIndex(const std::string& basePath, const std::vector<std::string>& debugSourceFiles) {
  if (basePath.empty()) {
    return -1;
  }

  for (size_t i = 0; i < debugSourceFiles.size(); i++) {
    const std::string& sourceFile = debugSourceFiles[i];
    // Check if source file starts with base path
    if (sourceFile.rfind(basePath, 0) == 0) {
      // Make sure it's a proper match (base path followed by '.' or end)
      // This prevents "class-utils" from matching "class-utils-other.ts"
      if (sourceFile.length() == basePath.length() ||
          sourceFile[basePath.length()] == '.') {
        return static_cast<int>(i);
      }
    }
  }

  return -1;
}

/**
 * Check if a function should be instrumented for coverage
 *
 * Filters out:
 * - Import functions (have non-empty module name)
 * - Framework functions (start with __)
 * - Test framework functions (from assembly/index/)
 * - Stdlib functions (start with ~lib/)
 * - Other runtime functions (start with ~)
 */
bool shouldInstrumentFunction(Function* func) {
  const std::string& name = func->name.toString();

  // Skip if this is an import (has non-empty module)
  if (func->module.size() > 0) {
    return false;
  }

  // Skip framework functions (start with __)
  if (name.rfind("__", 0) == 0) {
    return false;
  }

  // Skip test framework functions (from assembly/index/)
  if (name.rfind("assembly/index/", 0) == 0) {
    return false;
  }

  // Skip stdlib functions (start with ~lib/)
  if (name.rfind("~lib/", 0) == 0) {
    return false;
  }

  // Skip other runtime functions (start with ~)
  if (name.rfind("~", 0) == 0) {
    return false;
  }

  // Skip functions without a body
  if (!func->body) {
    return false;
  }

  return true;
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
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: wasmBuffer and sourceMapBuffer")
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

  try {
    // Extract buffer data
    Napi::Buffer<char> wasmBuf = info[0].As<Napi::Buffer<char>>();
    Napi::Buffer<char> sourceMapBuf = info[1].As<Napi::Buffer<char>>();

    // Check for optional debug flag (third argument)
    bool debugMode = false;
    if (info.Length() >= 3 && info[2].IsBoolean()) {
      debugMode = info[2].As<Napi::Boolean>().Value();
    }

    std::vector<char> wasmData(wasmBuf.Data(), wasmBuf.Data() + wasmBuf.Length());
    std::vector<char> sourceMapData(sourceMapBuf.Data(), sourceMapBuf.Data() + sourceMapBuf.Length());

    // Parse WASM binary with source map
    Module module;
    WasmBinaryReader reader(module, FeatureSet::All, wasmData, sourceMapData);
    reader.setDebugInfo(true);
    reader.read();

    if (debugMode) {
      std::cout << "[NativeAddon] Parsed module with " << module.functions.size() << " functions" << std::endl;
      std::cout << "[NativeAddon] Debug source files: " << module.debugInfoFileNames.size() << std::endl;
      for (size_t i = 0; i < module.debugInfoFileNames.size(); i++) {
        std::cout << "[NativeAddon]   [" << i << "] " << module.debugInfoFileNames[i] << std::endl;
      }
    }

    // Enable multi-memory feature for coverage memory
    module.features.setMultiMemory(true);

    // Add __coverage_memory import
    // This is a secondary memory used to store coverage counters
    Name coverageMemoryName("__coverage_memory");
    auto coverageMemory = Builder::makeMemory(coverageMemoryName);
    coverageMemory->module = "env";
    coverageMemory->base = "__coverage_memory";
    coverageMemory->initial = 1;
    coverageMemory->max = 4;  // 4 pages = 256KB, supports 65536 functions
    coverageMemory->shared = false;
    module.addMemory(std::move(coverageMemory));

    // Instrument functions and collect debug info
    Builder builder(module);
    uint32_t coverageIndex = 0;

    // Store debug file names for resolving fileIndex -> filePath
    const auto& debugFileNames = module.debugInfoFileNames;

    std::vector<FunctionInfo> instrumentedFunctions;

    // Create walker for debug info extraction
    DebugInfoWalker walker(&module);

    ModuleUtils::iterDefinedFunctions(module, [&](Function* func) {
      std::string funcName = func->name.toString();

      // Check if this function should be instrumented
      if (!shouldInstrumentFunction(func)) {
        if (debugMode) {
          std::cout << "[NativeAddon] SKIP (filtered): " << funcName << std::endl;
        }
        return;
      }

      // Walk function to collect expressions and basic blocks
      walker.walkFunctionInModule(func, &module);

      // Determine home file for representativeLocation filtering
      std::string homeFilePath = extractHomeFilePath(funcName);
      int homeFileIndex = findHomeFileIndex(homeFilePath, debugFileNames);

      if (debugMode) {
        std::cout << "[NativeAddon] Processing: " << funcName << std::endl;
        std::cout << "[NativeAddon]   homeFilePath: " << homeFilePath << std::endl;
        std::cout << "[NativeAddon]   homeFileIndex: " << homeFileIndex << std::endl;
        std::cout << "[NativeAddon]   expressions: " << walker.expressions.size() << std::endl;
      }

      // Find representative expression (Return preferred, then first non-Const)
      // Store by VALUE to avoid dangling pointers when walker.expressions is cleared
      bool foundReturn = false;
      bool foundFirstNonConst = false;
      ExpressionInfo returnExpr;
      ExpressionInfo firstNonConst;

      for (const auto& expr : walker.expressions) {
        if (expr.hasDebugLocation && homeFileIndex >= 0 &&
            expr.fileIndex == static_cast<uint32_t>(homeFileIndex)) {
          if (expr.typeId == Expression::ReturnId && !foundReturn) {
            returnExpr = expr;  // Copy by value
            foundReturn = true;
            if (debugMode) {
              std::cout << "[NativeAddon]   Found Return at " << expr.lineNumber << ":" << expr.columnNumber << std::endl;
            }
          } else if (expr.typeId != Expression::ConstId && !foundFirstNonConst) {
            firstNonConst = expr;  // Copy by value
            foundFirstNonConst = true;
            if (debugMode) {
              std::cout << "[NativeAddon]   Found firstNonConst (" << expr.type << ") at " << expr.lineNumber << ":" << expr.columnNumber << std::endl;
            }
          }
        }
      }

      // Store function info for later output
      FunctionInfo funcInfo;
      funcInfo.name = funcName;
      funcInfo.homeFileIndex = homeFileIndex;
      funcInfo.hasReturnExpression = foundReturn;
      funcInfo.returnExpression = returnExpr;
      funcInfo.hasFirstNonConstExpression = foundFirstNonConst;
      funcInfo.firstNonConstExpression = firstNonConst;
      funcInfo.expressions = walker.expressions;
      funcInfo.blocks = walker.blocks;

      std::string reprType = foundReturn ? "Return" : (foundFirstNonConst ? "firstNonConst" : "NONE");
      const uint32_t reprLine = foundReturn ? returnExpr.lineNumber : (foundFirstNonConst ? firstNonConst.lineNumber : 0);
      const uint32_t reprCol = foundReturn ? returnExpr.columnNumber : (foundFirstNonConst ? firstNonConst.columnNumber : 0);

      // Skip instrumentation if it does not have a known representative location
      if (foundReturn || foundFirstNonConst) {
        funcInfo.coverageMemoryIndex = coverageIndex;
        instrumentedFunctions.push_back(funcInfo);
      } else {
        instrumentedFunctions.push_back(funcInfo);

        if (debugMode) {
          std::cout << "[NativeAddon]   Not Instrumenting, Gathering debug info only (reprLoc=NONE)" << std::endl;
        }

        return;
      }

      // Create coverage instrumentation code:
      // addr = coverageIndex * 4  (4 bytes per i32 counter)
      // counter = i32.load(addr, __coverage_memory)
      // i32.store(addr, counter + 1, __coverage_memory)
      Expression* addr = builder.makeBinary(
        MulInt32,
        builder.makeConst(Literal(static_cast<int32_t>(coverageIndex))),
        builder.makeConst(Literal(int32_t(4)))
      );

      // Load current counter value
      Expression* loadCounter = builder.makeLoad(
        4,           // bytes
        false,       // signed
        0,           // offset
        4,           // align
        addr,
        Type::i32,
        coverageMemoryName
      );

      // Increment counter
      Expression* incrementedCounter = builder.makeBinary(
        AddInt32,
        loadCounter,
        builder.makeConst(Literal(int32_t(1)))
      );

      // Store incremented value (need fresh addr expression)
      Expression* addrForStore = builder.makeBinary(
        MulInt32,
        builder.makeConst(Literal(static_cast<int32_t>(coverageIndex))),
        builder.makeConst(Literal(int32_t(4)))
      );

      Expression* storeCounter = builder.makeStore(
        4,           // bytes
        0,           // offset
        4,           // align
        addrForStore,
        incrementedCounter,
        Type::i32,
        coverageMemoryName
      );

      // Prepend instrumentation to function body
      func->body = builder.makeSequence(storeCounter, func->body, func->body->type);

      if (debugMode) {
        std::cout << "[NativeAddon]   INSTRUMENTED \"" << funcName << "\"  [idx=" << coverageIndex << "]"
                  << " reprLoc=" << reprType << " at " << reprLine << ":" << reprCol << std::endl;
      }

      coverageIndex++;
    });

    if (debugMode) {
      std::cout << "[NativeAddon] Instrumentation complete: " << coverageIndex << " functions instrumented"
                << "(" << instrumentedFunctions.size() << " total with debug info gathered)" << std::endl;
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
      funcObj.Set("hasDebugInfo", Napi::Boolean::New(env, !funcInfo.expressions.empty()));

      // Add representativeLocation if found (prefer Return, fallback to first non-Const)
      if (funcInfo.hasReturnExpression) {
        Napi::Object reprLoc = Napi::Object::New(env);
        reprLoc.Set("fileIndex", Napi::Number::New(env, funcInfo.returnExpression.fileIndex));
        reprLoc.Set("line", Napi::Number::New(env, funcInfo.returnExpression.lineNumber));
        reprLoc.Set("column", Napi::Number::New(env, funcInfo.returnExpression.columnNumber));
        funcObj.Set("representativeLocation", reprLoc);
      } else if (funcInfo.hasFirstNonConstExpression) {
        Napi::Object reprLoc = Napi::Object::New(env);
        reprLoc.Set("fileIndex", Napi::Number::New(env, funcInfo.firstNonConstExpression.fileIndex));
        reprLoc.Set("line", Napi::Number::New(env, funcInfo.firstNonConstExpression.lineNumber));
        reprLoc.Set("column", Napi::Number::New(env, funcInfo.firstNonConstExpression.columnNumber));
        funcObj.Set("representativeLocation", reprLoc);
      }

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

NODE_API_MODULE(wasm_binaryen_debug, Init)
