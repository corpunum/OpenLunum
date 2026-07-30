import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CliCommand,
  CliExitCodeValue,
  CliErrorOutput,
  CliSuccessOutput,
} from '../src/cli-contract.js';
import {
  CLI_CONTRACT_VERSION,
  CliExitCode,
  COMMANDS,
  EXIT_CODES,
  formatCliError,
  formatCliSuccess,
  formatStructuredError,
  getContractManifest,
} from '../src/cli-contract.js';

describe('CLI contract', () => {
  it('contract version is a semver string', () => {
    assert.match(CLI_CONTRACT_VERSION, /^\d+\.\d+\.\d+$/u);
  });

  it('contract version is 1.0.0', () => {
    assert.strictEqual(CLI_CONTRACT_VERSION, '1.0.0');
  });

  it('exit codes are unique integers', () => {
    const codes = Object.values(EXIT_CODES);
    assert.strictEqual(new Set(codes).size, codes.length);
    for (const code of codes) assert.strictEqual(typeof code, 'number');
  });

  it('EXIT_CODES includes SUCCESS=0, RUNTIME_ERROR=1, USAGE_ERROR=2', () => {
    assert.strictEqual(EXIT_CODES.SUCCESS, 0);
    assert.strictEqual(EXIT_CODES.RUNTIME_ERROR, 1);
    assert.strictEqual(EXIT_CODES.USAGE_ERROR, 2);
  });

  it('CliExitCode has distinct values', () => {
    const codes = Object.values(CliExitCode);
    assert.strictEqual(new Set(codes).size, codes.length);
    for (const code of codes) assert.strictEqual(typeof code, 'number');
  });

  it('CliExitCode has expected numeric values', () => {
    assert.strictEqual(CliExitCode.SUCCESS, 0);
    assert.strictEqual(CliExitCode.VALIDATION_ERROR, 1);
    assert.strictEqual(CliExitCode.IO_ERROR, 2);
    assert.strictEqual(CliExitCode.INTERNAL_ERROR, 3);
    assert.strictEqual(CliExitCode.USAGE_ERROR, 4);
  });

  it('COMMANDS includes all expected subcommands', () => {
    const names = COMMANDS.map(c => c.name);
    for (const expected of ['inspect', 'encode', 'compile', 'migrate', 'pipeline', 'quality-gate', 'process-jsonl']) {
      assert.ok(names.includes(expected), `missing command: ${expected}`);
    }
  });

  it('each command has a non-empty name, description, and at least one exit code', () => {
    for (const cmd of COMMANDS) {
      assert.ok(cmd.name.length > 0);
      assert.ok(cmd.description.length > 0);
      assert.ok(cmd.exitCodes.length > 0);
    }
  });

  it('each command exit code references a valid EXIT_CODES value', () => {
    const validCodes = new Set(Object.values(EXIT_CODES));
    for (const cmd of COMMANDS) {
      for (const ec of cmd.exitCodes) {
        assert.ok(validCodes.has(ec.code), `command ${cmd.name} exit code ${ec.code} not in EXIT_CODES`);
      }
    }
  });

  it('command names are unique', () => {
    const names = COMMANDS.map(c => c.name);
    assert.strictEqual(new Set(names).size, names.length);
  });

  it('each command flag has name, valueType, and description', () => {
    for (const cmd of COMMANDS) {
      for (const f of cmd.flags) {
        assert.ok(f.name.length > 0);
        assert.ok(['string', 'boolean', 'number'].includes(f.valueType));
        assert.ok(f.description.length > 0);
      }
    }
  });
});

describe('CliCommand type', () => {
  it('covers all supported commands', () => {
    const expectedCommands: CliCommand[] = [
      'inspect',
      'encode',
      'compile',
      'migrate',
      'pipeline',
      'quality-gate',
      'process-jsonl',
      'contract',
    ];

    for (const cmd of expectedCommands) {
      const _: CliCommand = cmd;
    }

    assert.ok(true);
  });
});

describe('formatCliError', () => {
  it('formats error with code and message', () => {
    const error: CliErrorOutput = {
      code: CliExitCode.VALIDATION_ERROR,
      command: 'migrate',
      message: 'Input record invalid',
    };

    const formatted = formatCliError(error);
    assert.ok(formatted.includes('Error [1]'));
    assert.ok(formatted.includes('Input record invalid'));
    assert.ok(formatted.includes('migrate'));
  });

  it('formats error with details array', () => {
    const error: CliErrorOutput = {
      code: CliExitCode.IO_ERROR,
      command: 'pipeline',
      message: 'File not found',
      details: ['File /path/to/file does not exist', 'Check the path and retry'],
    };

    const formatted = formatCliError(error);
    assert.ok(formatted.includes('Error [2]'));
    assert.ok(formatted.includes('File /path/to/file does not exist'));
    assert.ok(formatted.includes('Check the path and retry'));
    assert.ok(formatted.includes('Details:'));
  });

  it('handles error without details', () => {
    const error: CliErrorOutput = {
      code: CliExitCode.USAGE_ERROR,
      command: 'encode',
      message: 'Missing required flag --sem',
    };

    const formatted = formatCliError(error);
    assert.ok(formatted.includes('Error [4]'));
    assert.ok(!formatted.includes('Details:'));
  });
});

describe('formatCliSuccess', () => {
  it('formats success output with data', () => {
    const output: CliSuccessOutput = {
      code: 0,
      command: 'inspect',
      data: { fingerprint: 'lfp:sha256:abc123' },
    };

    const formatted = formatCliSuccess(output);
    assert.ok(formatted.includes('Success: inspect'));
    assert.ok(formatted.includes('lfp:sha256:abc123'));
  });

  it('handles null data', () => {
    const output: CliSuccessOutput = {
      code: 0,
      command: 'validate',
      data: null,
    };

    const formatted = formatCliSuccess(output);
    assert.ok(formatted.includes('Success: validate'));
  });

  it('handles undefined data', () => {
    const output: CliSuccessOutput = {
      code: 0,
      command: 'process',
      data: undefined,
    };

    const formatted = formatCliSuccess(output);
    assert.ok(formatted.includes('Success: process'));
  });

  it('formats complex data structures', () => {
    const output: CliSuccessOutput = {
      code: 0,
      command: 'quality-gate',
      data: {
        passed: 5,
        failed: 2,
      },
    };

    const formatted = formatCliSuccess(output);
    assert.ok(formatted.includes('Success: quality-gate'));
    assert.ok(formatted.includes('passed'));
  });
});

describe('formatStructuredError', () => {
  it('returns a StructuredError with code, message, and exitCode', () => {
    const err = formatStructuredError('TEST_ERROR', 'something failed');
    assert.strictEqual(err.code, 'TEST_ERROR');
    assert.strictEqual(err.message, 'something failed');
    assert.strictEqual(err.exitCode, EXIT_CODES.RUNTIME_ERROR);
  });

  it('includes details when provided', () => {
    const err = formatStructuredError('X', 'msg', { details: { line: 5 } });
    assert.deepStrictEqual(err.details, { line: 5 });
  });

  it('includes command when provided', () => {
    const err = formatStructuredError('X', 'msg', { command: 'encode' });
    assert.strictEqual(err.command, 'encode');
  });

  it('uses custom exitCode', () => {
    const err = formatStructuredError('X', 'msg', { exitCode: EXIT_CODES.USAGE_ERROR });
    assert.strictEqual(err.exitCode, EXIT_CODES.USAGE_ERROR);
  });

  it('omits details and command when not provided', () => {
    const err = formatStructuredError('X', 'msg');
    assert.strictEqual(err.details, undefined);
    assert.strictEqual(err.command, undefined);
  });
});

describe('getContractManifest', () => {
  it('returns version and commands', () => {
    const manifest = getContractManifest();
    assert.strictEqual(manifest.version, CLI_CONTRACT_VERSION);
    assert.ok(manifest.commands.length >= 7);
  });
});
