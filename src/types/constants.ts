
// ============================================================================
// General / Shared Constants
// ============================================================================

export const ASSEMBLYSCRIPT_POOL_NAME = 'vitest-pool-assemblyscript';

/** Prefix for AssemblyScript compiler strip-inline exclusions and instrumentation exclusions */
export const ASSEMBLYSCRIPT_LIB_PREFIX = '~lib/';

/** Paths instrumentation exclusions and assetion error stack frame filtering */
export const POOL_INTERNAL_PATHS = new Set([
  'assembly/index.ts'
]);

export const ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID = 'assemblyscript' as const;

/** Error names for AssemblyScript test failures reported to vitest */
export const TEST_ERROR_NAMES = {
  /** Assertion evaluated to false within a test function */
  AssertionFailure: 'AssertionFailure',
  /** WASM runtime called abort after a non-planned user code error */
  WASMRuntimeError: 'WASMRuntimeError',
} as const;

/** Error names for internal AssemblyScript pool failures */
export const POOL_ERROR_NAMES = {
  /** AssemblyScript oompiler (asc) error */
  CompilationError: 'CompilationError',
  /** Native instrumentation and debug info extraction error */
  WASMInstrumentationError: 'WASMInstrumentationError',
  /** Unexpected WASM execution error (not a known test error path) */
  WASMExecutionHarnessError: 'WASMExecutionHarnessError',
  /** Hybrid coverage provider error */
  HybridCoverageProviderError: 'HybridCoverageProviderError',
  /** vitest RPC reporting error */
  PoolReportingError: 'PoolReportingError',
  /** User configuration error */
  PoolConfigError: 'PoolConfigError',
  /** Generic AssemblyScript pool error */
  PoolError: 'PoolError',
  /** Indicates intentional abort (flow-control) */
  PoolRunAborted: 'PoolRunAborted',
  /**
   * Indicates intentional WASM executor exection halt (flow-control) and should
   * be handled by reporting an AssemblyScriptTestError to vitest
   */
  WASMExecutionAbort: 'WASMExecutionAbort',
} as const;

export const COVERAGE_PAYLOAD_FORMATS = {
  AssemblyScript: 'assemblyscript',
} as const;

// ============================================================================
// AssemblyScript Compiler
// ============================================================================

// Redefined locally to avoid isolatedModules const enum access issues
// with assemmblyscript enum exports. Reference assemblyscript.generated.d.ts

export const ASCommonFlags = {
  Static: 32,
  Get: 2048,
  Set: 4096,
} as const;

export const ASNodeKind = {
  Source: 0,
  NamedType: 1,
  FunctionType: 2,
  TypeName: 3,
  TypeParameter: 4,
  Parameter: 5,
  Identifier: 6,
  Assertion: 7,
  Binary: 8,
  Call: 9,
  Class: 10,
  Comma: 11,
  ElementAccess: 12,
  False: 13,
  Function: 14,
  InstanceOf: 15,
  Literal: 16,
  New: 17,
  Null: 18,
  Omitted: 19,
  Parenthesized: 20,
  PropertyAccess: 21,
  Ternary: 22,
  Super: 23,
  This: 24,
  True: 25,
  Constructor: 26,
  UnaryPostfix: 27,
  UnaryPrefix: 28,
  Compiled: 29,
  Block: 30,
  Break: 31,
  Continue: 32,
  Do: 33,
  Empty: 34,
  Export: 35,
  ExportDefault: 36,
  ExportImport: 37,
  Expression: 38,
  For: 39,
  ForOf: 40,
  If: 41,
  Import: 42,
  Return: 43,
  Switch: 44,
  Throw: 45,
  Try: 46,
  Variable: 47,
  Void: 48,
  While: 49,
  Module: 50,
  ClassDeclaration: 51,
  EnumDeclaration: 52,
  EnumValueDeclaration: 53,
  FieldDeclaration: 54,
  FunctionDeclaration: 55,
  ImportDeclaration: 56,
  InterfaceDeclaration: 57,
  MethodDeclaration: 58,
  NamespaceDeclaration: 59,
  TypeDeclaration: 60,
  VariableDeclaration: 61,
  Decorator: 62,
  ExportMember: 63,
  SwitchCase: 64,
  IndexSignature: 65,
  Comment: 66,
} as const;

export const ASDecoratorKind = {
  Custom: 0,
  Global: 1,
  Operator: 2,
  OperatorBinary: 3,
  OperatorPrefix: 4,
  OperatorPostfix: 5,
  Unmanaged: 6,
  Final: 7,
  Inline: 8,
  External: 9,
  ExternalJs: 10,
  Builtin: 11,
  Lazy: 12,
  Unsafe: 13
} as const;

export const ASSourceKind = {
  User: 0,
  UserEntry: 1,
  Library: 2,
  LibraryEntry: 3
} as const;
