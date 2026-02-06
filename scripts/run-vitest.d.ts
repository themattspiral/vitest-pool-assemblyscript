export interface RunVitestOptions {
  cwd: string;
  args?: string[];
  capture?: boolean;
}

export interface RunVitestResult {
  jsonOutput: Record<string, unknown> | null;
  cliOutput: string;
  exitCode: number;
}

export function runVitest(options: RunVitestOptions): RunVitestResult;
