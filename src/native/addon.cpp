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

// Binaryen C++ API headers
#include "wasm-binary.h"
#include "wasm-io.h"
#include "ir/module-utils.h"
#include "cfg/cfg-traversal.h"
#include "support/name.h"

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
      for (auto* expr : bb->contents.expressions) {
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
 * Evaluate a constant expression to get its i32 value
 * Used for extracting offset values from Const expressions
 */
uint32_t evaluateConstExpr(Expression* expr) {
  if (!expr || !expr->is<Const>()) {
    return 0;
  }
  return expr->cast<Const>()->value.geti32();
}

/**
 * Read an i32 value from data segments at a given memory address
 * Returns 0 if the address is not found in any data segment
 */
uint32_t readI32FromDataSegments(const std::vector<std::unique_ptr<DataSegment>>& dataSegments, uint32_t memAddr) {
  for (const auto& segment : dataSegments) {
    if (segment->isPassive) {
      continue; // Skip passive segments (not placed in memory at load time)
    }

    uint32_t segmentOffset = evaluateConstExpr(segment->offset);
    uint32_t segmentEnd = segmentOffset + segment->data.size();

    // Check if memAddr is within this segment
    if (memAddr >= segmentOffset && memAddr + 4 <= segmentEnd) {
      // Extract 4 bytes as little-endian i32
      uint32_t offset = memAddr - segmentOffset;
      uint32_t value =
        (static_cast<uint8_t>(segment->data[offset + 0]) << 0) |
        (static_cast<uint8_t>(segment->data[offset + 1]) << 8) |
        (static_cast<uint8_t>(segment->data[offset + 2]) << 16) |
        (static_cast<uint8_t>(segment->data[offset + 3]) << 24);
      return value;
    }
  }

  return 0; // Address not found in any segment
}

/**
 * Build a mapping from element table indices to function names
 * This is used to resolve function pointer globals to their actual functions
 */
std::map<uint32_t, Name> buildElementToFunctionMap(Module& module) {
  std::map<uint32_t, Name> elementToFunc;

  for (const auto& segment : module.elementSegments) {
    if (segment->table.isNull() || !segment->offset) {
      continue; // Skip segments without table or offset
    }

    uint32_t baseIndex = evaluateConstExpr(segment->offset);

    for (size_t i = 0; i < segment->data.size(); i++) {
      Expression* elem = segment->data[i];
      if (elem && elem->is<RefFunc>()) {
        Name funcName = elem->cast<RefFunc>()->func;
        elementToFunc[baseIndex + i] = funcName;
      }
    }
  }

  return elementToFunc;
}

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
 * Build a mapping from function names to global names
 * For arrow functions stored as globals, this maps:
 *   "start:test/assembly/anonymous~anonymous|1" -> "test/assembly/anonymous/distinctiveArrow"
 */
std::map<std::string, std::string> buildFunctionToGlobalMap(Module& module) {
  std::map<std::string, std::string> funcToGlobal;

  // First build element index -> function name map
  std::map<uint32_t, Name> elementToFunc = buildElementToFunctionMap(module);

  // Then for each global, check if it's a function pointer
  for (const auto& global : module.globals) {
    if (!global->init || !global->init->is<Const>()) {
      continue; // Not a const-initialized global
    }

    // Get the memory address stored in the global
    uint32_t memAddr = global->init->cast<Const>()->value.geti32();

    if (memAddr == 0) {
      continue; // Null pointer
    }

    // Read the element index from memory
    uint32_t elementIndex = readI32FromDataSegments(module.dataSegments, memAddr);

    // Look up the function name from element table
    if (elementToFunc.count(elementIndex)) {
      Name funcName = elementToFunc[elementIndex];
      funcToGlobal[std::string(funcName.str)] = std::string(global->name.str);
    }
  }

  return funcToGlobal;
}

/**
 * Extract debug information from a WASM binary with source map
 *
 * @param wasmBuffer - Node.js Buffer containing WASM binary
 * @param sourceMapBuffer - Node.js Buffer containing source map JSON
 * @returns JavaScript object with debug information structure
 */
Napi::Object ExtractDebugInfo(const Napi::CallbackInfo& info) {
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

    // Convert to std::vector for Binaryen API
    std::vector<char> wasmData(wasmBuf.Data(), wasmBuf.Data() + wasmBuf.Length());
    std::vector<char> sourceMapData(sourceMapBuf.Data(), sourceMapBuf.Data() + sourceMapBuf.Length());

    // Parse WASM binary with source map using WasmBinaryReader
    Module module;
    WasmBinaryReader reader(module, FeatureSet::All, wasmData, sourceMapData);
    reader.setDebugInfo(true);  // Enable debug info population
    reader.read();

    // Build result object
    Napi::Object result = Napi::Object::New(env);

    // Provide all debug source file names
    Napi::Array debugSourceFiles = Napi::Array::New(env, module.debugInfoFileNames.size());
    for (size_t i = 0; i < module.debugInfoFileNames.size(); i++) {
      debugSourceFiles[i] = Napi::String::New(env, module.debugInfoFileNames[i]);
    }
    result.Set("debugSourceFiles", debugSourceFiles);

    // Store debug file names locally for resolving fileIndex -> filePath
    const auto& debugFileNames = module.debugInfoFileNames;

    // Build mapping from function names to global names (for arrow functions)
    std::map<std::string, std::string> funcToGlobal = buildFunctionToGlobalMap(module);

    // Extract function information using our custom walker
    // Output as flat array (TS wrapper will group by file and position)
    Napi::Array functions = Napi::Array::New(env);
    DebugInfoWalker walker(&module);
    size_t funcArrayIndex = 0;

    ModuleUtils::iterDefinedFunctions(module, [&](Function* func) {
      std::string funcName = func->name.toString();

      // Skip stdlib functions - they can't be resolved to user source files
      if (funcName.rfind("~lib/", 0) == 0) {
        return;
      }

      // Walk this function to collect expressions and basic blocks
      walker.walkFunctionInModule(func, &module);

      // Determine this function's "home" file index for representativeLocation filtering
      std::string homeFilePath = extractHomeFilePath(funcName);
      int homeFileIndex = findHomeFileIndex(homeFilePath, debugFileNames);

      // Create function info object
      Napi::Object funcInfo = Napi::Object::New(env);

      // Add function name and WASM index
      funcInfo.Set("name", Napi::String::New(env, funcName));
      funcInfo.Set("wasmIndex", Napi::Number::New(env, funcArrayIndex));

      // Add hasDebugInfo flag
      bool hasDebugInfo = !func->debugLocations.empty();
      funcInfo.Set("hasDebugInfo", Napi::Boolean::New(env, hasDebugInfo));

      // Add function signature
      Napi::Object signature = Napi::Object::New(env);

      // Extract parameter types
      Napi::Array params = Napi::Array::New(env);
      if (func->type.isSignature()) {
        wasm::Signature sig = func->type.getSignature();
        for (size_t i = 0; i < sig.params.size(); i++) {
          params[i] = Napi::String::New(env, sig.params[i].toString());
        }
      }
      signature.Set("params", params);

      // Extract result types
      Napi::Array results = Napi::Array::New(env);
      if (func->type.isSignature()) {
        wasm::Signature sig = func->type.getSignature();
        for (size_t i = 0; i < sig.results.size(); i++) {
          results[i] = Napi::String::New(env, sig.results[i].toString());
        }
      }
      signature.Set("results", results);

      funcInfo.Set("signature", signature);

      // Check if this function has a corresponding global (arrow function)
      std::string funcNameStr(func->name.str);
      auto it = funcToGlobal.find(funcNameStr);
      if (it != funcToGlobal.end()) {
        funcInfo.Set("globalName", Napi::String::New(env, it->second));
      }

      // Convert expressions to JavaScript array
      // Also track representative expression from HOME FILE for representativeLocation
      // (ignores expressions from inlined code in other files)
      Napi::Array expressions = Napi::Array::New(env, walker.expressions.size());
      const ExpressionInfo* returnExpression = nullptr;
      const ExpressionInfo* firstNonConstExpression = nullptr;

      for (size_t i = 0; i < walker.expressions.size(); i++) {
        const auto& expr = walker.expressions[i];
        Napi::Object exprObj = Napi::Object::New(env);

        exprObj.Set("type", Napi::String::New(env, expr.type));
        exprObj.Set("isBranch", Napi::Boolean::New(env, expr.isBranch));

        // Only include branchPaths if this is a branch expression
        if (expr.isBranch) {
          exprObj.Set("branchPaths", Napi::Number::New(env, expr.branchPaths));
        }

        if (expr.hasDebugLocation) {
          // Add location if it exists
          Napi::Object location = Napi::Object::New(env);
          location.Set("fileIndex", Napi::Number::New(env, expr.fileIndex));
          location.Set("line", Napi::Number::New(env, expr.lineNumber));
          location.Set("column", Napi::Number::New(env, expr.columnNumber));
          exprObj.Set("location", location);

          // Track expressions from HOME FILE for representativeLocation selection
          // Priority: 1) Return expression, 2) First non-Const expression
          // This avoids selecting inlined default parameter values (always Const)
          // which would point to the wrong function's source location
          if (homeFileIndex >= 0 && expr.fileIndex == static_cast<uint32_t>(homeFileIndex)) {
            if (expr.typeId == Expression::ReturnId && returnExpression == nullptr) {
              returnExpression = &expr;
            } else if (expr.typeId != Expression::ConstId && firstNonConstExpression == nullptr) {
              firstNonConstExpression = &expr;
            }
          }
        }

        expressions[i] = exprObj;
      }
      funcInfo.Set("expressions", expressions);

      // Select representativeLocation: prefer Return, fallback to first non-Const
      const ExpressionInfo* representativeExpression = returnExpression != nullptr
          ? returnExpression
          : firstNonConstExpression;

      // Add representativeLocation only if we found a suitable expression from the home file
      if (representativeExpression != nullptr) {
        Napi::Object representativeLocation = Napi::Object::New(env);
        representativeLocation.Set("fileIndex", Napi::Number::New(env, representativeExpression->fileIndex));
        representativeLocation.Set("line", Napi::Number::New(env, representativeExpression->lineNumber));
        representativeLocation.Set("column", Napi::Number::New(env, representativeExpression->columnNumber));
        funcInfo.Set("representativeLocation", representativeLocation);
      }

      // Convert basic blocks to JavaScript array
      Napi::Array basicBlocks = Napi::Array::New(env, walker.blocks.size());
      for (size_t i = 0; i < walker.blocks.size(); i++) {
        const auto& block = walker.blocks[i];
        Napi::Object blockObj = Napi::Object::New(env);

        blockObj.Set("index", Napi::Number::New(env, i));

        // Expression indices
        Napi::Array exprIndices = Napi::Array::New(env, block.expressionIndices.size());
        for (size_t j = 0; j < block.expressionIndices.size(); j++) {
          exprIndices[j] = Napi::Number::New(env, block.expressionIndices[j]);
        }
        blockObj.Set("expressionIndices", exprIndices);

        // Branch targets (as array of BranchEdgeDebugInfo objects)
        Napi::Array branches = Napi::Array::New(env, block.branches.size());
        for (size_t j = 0; j < block.branches.size(); j++) {
          Napi::Object branchObj = Napi::Object::New(env);
          branchObj.Set("targetBlockIndex", Napi::Number::New(env, block.branches[j]));
          // Note: sourceExpressionIndex could be added here if we track which expression causes the branch
          branches[j] = branchObj;
        }
        blockObj.Set("branches", branches);

        basicBlocks[i] = blockObj;
      }
      funcInfo.Set("basicBlocks", basicBlocks);

      // Add to flat array (TS wrapper will group by file and position)
      functions[funcArrayIndex] = funcInfo;

      funcArrayIndex++;
    });

    result.Set("functions", functions);

    return result;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Failed to extract debug info: ") + e.what())
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  } catch (...) {
    Napi::Error::New(env, "Failed to extract debug info: Unknown error")
        .ThrowAsJavaScriptException();
    return Napi::Object::New(env);
  }
}

/**
 * Initialize the addon
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("extractDebugInfo", Napi::Function::New(env, ExtractDebugInfo));
  return exports;
}

NODE_API_MODULE(wasm_binaryen_debug, Init)
