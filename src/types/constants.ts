/**
 * Plain Constants
 * 
 * Only things that don't require importing ./types to avoid circular dependencies.
 */


// ============================================================================
// General / Shared Constants
// ============================================================================

export const ASSEMBLYSCRIPT_POOL_NAME = 'assemblyscript' as const;

export const AS_POOL_ERROR_WRAPPER_FLAG = '__as_pool_wrapper__' as const;

export const AS_POOL_ERROR_TYPE_FLAG = '__as_pool__' as const;

export const AS_POOL_WORKER_MSG_FLAG = '__as_pool__' as const;

export const AS_POOL_WASM_IMPORTS_MODULE_NAME = '__as_pool_env__' as const;

export const AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME = '__coverage_memory' as const;

export const VITEST_WORKER_REQUEST_MSG_FLAG = '__vitest_worker_request__' as const;

export const VITEST_WORKER_RESPONSE_MSG_FLAG = '__vitest_worker_response__' as const;

export const COVERAGE_PAYLOAD_FORMATS = {
  AssemblyScript: 'assemblyscript',
} as const;

/** Prefix for AssemblyScript compiler strip-inline exclusions and instrumentation exclusions */
export const ASSEMBLYSCRIPT_LIB_PREFIX = '~lib/' as const;

export const INTERNAL_PATH_LIB_PREFIX: string = `${ASSEMBLYSCRIPT_LIB_PREFIX}vitest-pool-assemblyscript/assembly/` as const;

export const INTERNAL_FUNCTION_NAME_SUBSTRING = '__vitest_assemblyscript_' as const;

/** Paths instrumentation exclusions and assetion error stack frame filtering */
export const POOL_INTERNAL_PATHS: string[] = [
  // AS compiler source maps these as relative paths when running locally
  'assembly/compare.ts',
  'assembly/describe.ts',
  'assembly/expect.ts',
  'assembly/index.ts',
  'assembly/options.ts',
  'assembly/utils.ts',
  'assembly/test.ts',

  // AS compiler source maps these as library paths when running published version
  `${INTERNAL_PATH_LIB_PREFIX}compare.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}describe.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}expect.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}index.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}options.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}stringify.ts`,
  `${INTERNAL_PATH_LIB_PREFIX}test.ts`,
] as const;

/** Error names for AssemblyScript test failures reported to vitest */
export const TEST_ERROR_NAMES = {
  /** Assertion evaluated to false within a test function */
  AssertionError: 'AssertionError',
  /** WASM runtime called abort after a non-planned user code error */
  WASMRuntimeError: 'WASMRuntimeError',
} as const;

/** Error names for internal AssemblyScript pool failures */
export const POOL_ERROR_NAMES = {
  /** AssemblyScript compiler (asc) error */
  CompilationError: 'CompilationError',
  /** Native instrumentation and debug info extraction error */
  WASMInstrumentationError: 'WASMInstrumentationError',
  /** Error importing/creating user imports for WASM environment */
  WASMUserImportsError: 'WASMUserImportsError',
  /** Unexpected WASM execution error */
  WASMExecutionHarnessError: 'WASMExecutionHarnessError',
  /** Hybrid coverage provider error */
  HybridCoverageProviderError: 'HybridCoverageProviderError',
  /** vitest RPC reporting error */
  PoolReportingError: 'PoolReportingError',
  /** User configuration error */
  PoolConfigError: 'PoolConfigError',
  /** User syntax error in `test`/`suite`/`expect` */
  PoolSyntaxError: 'PoolSyntaxError',
  /** Generic AssemblyScript pool error */
  PoolError: 'PoolError',

  /** Flow Control: Indicates intentional abort */
  PoolRunAbortedError: 'PoolRunAbortedError',
  /**
   * Flow Control: Indicates WASM execution halt through abort() handler,
   * and should be handled by reporting an AssemblyScriptTestError to vitest
   */
  WASMExecutionAbortError: 'WASMExecutionAbortError',
  WASMExecutionAbortSuccess: 'WASMExecutionAbortSuccess',
  /** Flow Control: Indicates WASM execution halt because test timeout elapsed */
  WASMExecutionTimeoutError: 'WASMExecutionTimeoutError',
} as const;


// ============================================================================
// AssemblyScript Deep Equals & Stringify Transform
// ============================================================================

/** Name of the method injected by the deep-equals compiler transform */
export const DEEP_EQUALS_INJECTED_METHOD_NAME = '__vitest_assemblyscript_deep_equals' as const;

/** Name of the method injected by the compiler transform that returns the runtime class name */
export const TYPENAME_INJECTED_METHOD_NAME = '__vitest_assemblyscript_typename' as const;

/** Name of the method injected by the compiler transform that returns stringified field contents */
export const STRINGIFY_INJECTED_METHOD_NAME = '__vitest_assemblyscript_stringify' as const;

/**
 * Name of the @global enum in assembly/compare.ts that represents deep equality comparison results.
 * Used in transform-generated code to reference enum members (e.g. EqualityResult.Equal).
 */
export const EQUALITY_RESULT_ENUM_NAME = '__vitest_assemblyscript_EqualityResult' as const;

/**
 * Export alias for pool's equals() function used by injected deep equal method comparison body.
 */
export const COMPARE_EQUALS_GLOBAL_ALIAS = '__vitest_assemblyscript_compare_equals' as const;

/**
 * Global alias for the path push function used by injected deep equality method field comparisons.
 */
export const COMPARE_EQUALS_PATH_PUSH_GLOBAL_ALIAS = '__vitest_assemblyscript_compare_equals_path_push' as const;

/**
 * Global alias for the path pop function used by injected deep equality method field comparisons.
 */
export const COMPARE_EQUALS_PATH_POP_GLOBAL_ALIAS = '__vitest_assemblyscript_compare_equals_path_pop' as const;

/**
 * Global alias for the stringifyValue() wrapper used by injected stringify method bodies.
 */
export const STRINGIFY_VALUE_GLOBAL_ALIAS = '__vitest_assemblyscript_stringify_value' as const;

/**
 * Global alias for the escapeToDiffString() wrapper used by injected stringify method bodies.
 */
export const ESCAPE_TO_DIFF_STRING_GLOBAL_ALIAS = '__vitest_assemblyscript_escape_to_diff_string' as const;

/**
 * Global alias for the depth-to-indent helper used by injected stringify method bodies.
 */
export const STRINGIFY_INDENT_GLOBAL_ALIAS = '__vitest_assemblyscript_stringify_indent' as const;

/**
 * Global alias for the short-form budget overflow predicate used by injected stringify method bodies.
 */
export const STRINGIFY_EXCEEDS_BUDGET_GLOBAL_ALIAS = '__vitest_assemblyscript_stringify_exceeds_budget' as const;


// ============================================================================
// AssemblyScript Compiler Internals
// ============================================================================

// Original const enum values defined in assemblyscript.generated.d.ts.
// These are reexported to avoid access issues with `const enum` exports 
// in assemblyscript, because we're using isolatedModules & isolatedDeclarations

import * as ascript from 'assemblyscript';
import type * as AS from 'assemblyscript';

type NodeKindMap = Record<keyof typeof AS.NodeKind, number>;
type CommonFlagsMap = Record<keyof typeof AS.CommonFlags, number>;
type DecoratorKindMap = Record<keyof typeof AS.DecoratorKind, number>;
type SourceKindMap = Record<keyof typeof AS.SourceKind, number>;

const asRuntime = ascript as unknown as {
  NodeKind: NodeKindMap;
  CommonFlags: CommonFlagsMap;
  DecoratorKind: DecoratorKindMap;
  SourceKind: SourceKindMap;
};

export const ASNodeKind: NodeKindMap = asRuntime.NodeKind;
export const ASCommonFlags: CommonFlagsMap = asRuntime.CommonFlags;
export const ASDecoratorKind: DecoratorKindMap = asRuntime.DecoratorKind;
export const ASSourceKind: SourceKindMap = asRuntime.SourceKind;
