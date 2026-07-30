/**
 * OpenLunum CLI Contract (R11.1, R11.2, R11.3)
 *
 * This module exports stable, versioned types for CLI commands, exit codes,
 * and structured error/success output. All types are frozen and semver-stable.
 */

export const CLI_CONTRACT_VERSION = '1.0.0' as const;

/**
 * CliCommand: Union of all supported CLI commands
 */
export type CliCommand = 'inspect' | 'encode' | 'compile' | 'migrate' | 'pipeline' | 'quality-gate' | 'process-jsonl' | 'contract';

/**
 * CliExitCode: Enumerated exit codes with stable numeric values
 * - SUCCESS: 0 (successful execution)
 * - VALIDATION_ERROR: 1 (input or record validation failed)
 * - IO_ERROR: 2 (file system or I/O error)
 * - INTERNAL_ERROR: 3 (internal/runtime error)
 * - USAGE_ERROR: 4 (invalid CLI usage)
 */
export const CliExitCode = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  IO_ERROR: 2,
  INTERNAL_ERROR: 3,
  USAGE_ERROR: 4,
} as const;

export type CliExitCodeValue = typeof CliExitCode[keyof typeof CliExitCode];

/**
 * Legacy alias for backwards compatibility
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
  INPUT_VALIDATION_ERROR: 3,
  GATE_FAILURE: 4,
} as const;

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];

/**
 * CliErrorOutput: Structured error output with optional details
 */
export interface CliErrorOutput {
  readonly code: CliExitCodeValue;
  readonly command: string;
  readonly message: string;
  readonly details?: readonly string[];
}

/**
 * CliSuccessOutput: Structured success output with command and data payload
 */
export interface CliSuccessOutput {
  readonly code: 0;
  readonly command: string;
  readonly data: unknown;
}

/**
 * formatCliError: Formats a CliErrorOutput into human-readable text
 */
export function formatCliError(error: CliErrorOutput): string {
  const lines: string[] = [];
  lines.push(`Error [${error.code}]: ${error.message}`);
  if (error.command) {
    lines.push(`Command: ${error.command}`);
  }
  if (error.details && error.details.length > 0) {
    lines.push('Details:');
    for (const detail of error.details) {
      lines.push(`  - ${detail}`);
    }
  }
  return lines.join('\n');
}

/**
 * formatCliSuccess: Formats a CliSuccessOutput into human-readable text
 */
export function formatCliSuccess(output: CliSuccessOutput): string {
  const lines: string[] = [];
  lines.push(`Success: ${output.command}`);
  if (output.data !== null && output.data !== undefined) {
    lines.push(JSON.stringify(output.data, null, 2));
  }
  return lines.join('\n');
}

export interface CLICommandSpec {
  name: string;
  description: string;
  flags: CLIFlagSpec[];
  exitCodes: ExitCodeSpec[];
  stdinSupport: boolean;
  stdoutFormat: 'json' | 'jsonl' | 'text' | 'markdown';
}

export interface CLIFlagSpec {
  name: string;
  required: boolean;
  valueType: 'string' | 'boolean' | 'number';
  description: string;
}

export interface ExitCodeSpec {
  code: ExitCode;
  meaning: string;
}

export const COMMANDS: readonly CLICommandSpec[] = [
  {
    name: 'inspect',
    description: 'Derive a Lunum sidecar from text input',
    flags: [
      { name: 'text', required: false, valueType: 'string', description: 'Text to inspect' },
      { name: 'role', required: false, valueType: 'string', description: 'Role of the message sender' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'Sidecar output written to stdout' },
      { code: EXIT_CODES.RUNTIME_ERROR, meaning: 'Internal error during derivation' },
    ],
    stdinSupport: false,
    stdoutFormat: 'json',
  },
  {
    name: 'encode',
    description: 'Validate a Sem, compute its fingerprint and rendering',
    flags: [
      { name: 'sem', required: true, valueType: 'string', description: 'Path to the Sem JSON file' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'Encoded output written to stdout' },
      { code: EXIT_CODES.INPUT_VALIDATION_ERROR, meaning: 'Sem failed validation' },
    ],
    stdinSupport: false,
    stdoutFormat: 'json',
  },
  {
    name: 'compile',
    description: 'Compile a context message array into a mixed-mode context',
    flags: [
      { name: 'messages', required: true, valueType: 'string', description: 'Path to messages JSON file' },
      { name: 'mode', required: false, valueType: 'string', description: 'Context mode: natural | lunum | mixed | shadow_mixed' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'Compiled context written to stdout' },
      { code: EXIT_CODES.INPUT_VALIDATION_ERROR, meaning: 'Messages failed to parse' },
    ],
    stdinSupport: false,
    stdoutFormat: 'json',
  },
  {
    name: 'migrate',
    description: 'Migrate records between schema versions',
    flags: [
      { name: 'from', required: true, valueType: 'string', description: 'Source schema version' },
      { name: 'to', required: true, valueType: 'string', description: 'Target schema version' },
      { name: 'dry-run', required: false, valueType: 'boolean', description: 'Validate without writing' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'Migration completed' },
      { code: EXIT_CODES.INPUT_VALIDATION_ERROR, meaning: 'Input record invalid' },
      { code: EXIT_CODES.RUNTIME_ERROR, meaning: 'Migration failed' },
    ],
    stdinSupport: false,
    stdoutFormat: 'json',
  },
  {
    name: 'pipeline',
    description: 'Run the full parse-encode-render pipeline on text',
    flags: [
      { name: 'text', required: false, valueType: 'string', description: 'Input text' },
      { name: 'language', required: false, valueType: 'string', description: 'Source language' },
      { name: 'category', required: false, valueType: 'string', description: 'Policy category' },
      { name: 'risk', required: false, valueType: 'string', description: 'Risk level' },
      { name: 'mode', required: false, valueType: 'string', description: 'Pipeline mode' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'Pipeline result written to stdout' },
      { code: EXIT_CODES.RUNTIME_ERROR, meaning: 'Pipeline execution error' },
    ],
    stdinSupport: false,
    stdoutFormat: 'json',
  },
  {
    name: 'quality-gate',
    description: 'Run quality gates on experiment results',
    flags: [
      { name: 'input', required: false, valueType: 'string', description: 'Input file path or - for stdin' },
      { name: 'strict', required: false, valueType: 'boolean', description: 'Enable strict mode' },
      { name: 'min-pass-rate', required: false, valueType: 'number', description: 'Minimum pass rate' },
      { name: 'format', required: false, valueType: 'string', description: 'Output format: json | markdown' },
      { name: 'output', required: false, valueType: 'string', description: 'Output file path' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'All gates passed' },
      { code: EXIT_CODES.GATE_FAILURE, meaning: 'One or more gates failed' },
      { code: EXIT_CODES.INPUT_VALIDATION_ERROR, meaning: 'Input data invalid' },
    ],
    stdinSupport: true,
    stdoutFormat: 'json',
  },
  {
    name: 'process-jsonl',
    description: 'Stream-process a JSONL file line by line with bounded memory',
    flags: [
      { name: 'input', required: true, valueType: 'string', description: 'Input JSONL file path or - for stdin' },
      { name: 'operation', required: true, valueType: 'string', description: 'Operation: validate | fingerprint | classify' },
      { name: 'output', required: false, valueType: 'string', description: 'Output file path (default: stdout)' },
    ],
    exitCodes: [
      { code: EXIT_CODES.SUCCESS, meaning: 'All items processed' },
      { code: EXIT_CODES.INPUT_VALIDATION_ERROR, meaning: 'One or more items invalid' },
      { code: EXIT_CODES.RUNTIME_ERROR, meaning: 'Processing error' },
    ],
    stdinSupport: true,
    stdoutFormat: 'jsonl',
  },
] as const;

export interface StructuredError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  command?: string;
  exitCode: ExitCode;
}

export function formatStructuredError(code: string, message: string, opts: { details?: Record<string, unknown>; command?: string; exitCode?: ExitCode } = {}): StructuredError {
  const err: StructuredError = { code, message, exitCode: opts.exitCode ?? EXIT_CODES.RUNTIME_ERROR };
  if (opts.details) err.details = opts.details;
  if (opts.command) err.command = opts.command;
  return err;
}

export function getContractManifest(): { version: string; commands: readonly CLICommandSpec[] } {
  return { version: CLI_CONTRACT_VERSION, commands: COMMANDS };
}
