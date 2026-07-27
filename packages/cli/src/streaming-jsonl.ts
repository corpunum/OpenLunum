import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import {
  validateSem,
  fingerprintSem,
  classifyContent,
  type LunumSem,
} from '@corpunum/lunum';
import { formatStructuredError, EXIT_CODES, type StructuredError } from './cli-contract.js';

export type StreamOperation = 'validate' | 'fingerprint' | 'classify';

export interface StreamResult {
  line: number;
  id?: string;
  ok: boolean;
  output?: Record<string, unknown>;
  error?: StructuredError;
}

export interface StreamSummary {
  totalLines: number;
  successCount: number;
  errorCount: number;
  operation: StreamOperation;
}

function getInputStream(inputPath: string): Readable {
  if (inputPath === '-') return process.stdin;
  return createReadStream(inputPath, { encoding: 'utf8' });
}

function processLine(lineNum: number, raw: string, operation: StreamOperation): StreamResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      line: lineNum,
      ok: false,
      error: formatStructuredError('PARSE_ERROR', `Invalid JSON on line ${lineNum}`, { exitCode: EXIT_CODES.INPUT_VALIDATION_ERROR }),
    };
  }

  const id = typeof parsed.id === 'string' ? parsed.id : undefined;
  const goldSem = (parsed.goldSem ?? parsed.sem) as LunumSem | undefined;

  function result(ok: boolean, extra: { output?: Record<string, unknown>; error?: StructuredError }): StreamResult {
    const r: StreamResult = { line: lineNum, ok, ...extra };
    if (id) r.id = id;
    return r;
  }

  if (!goldSem) {
    return result(false, { error: formatStructuredError('MISSING_SEM', `No goldSem or sem field on line ${lineNum}`, { exitCode: EXIT_CODES.INPUT_VALIDATION_ERROR }) });
  }

  if (operation === 'validate') {
    const v = validateSem(goldSem);
    const r = result(v.ok, { output: { valid: v.ok, errors: v.errors } });
    if (!v.ok) r.error = formatStructuredError('VALIDATION_FAILED', v.errors.join('; '), { exitCode: EXIT_CODES.INPUT_VALIDATION_ERROR });
    return r;
  }

  if (operation === 'fingerprint') {
    const v = validateSem(goldSem);
    if (!v.ok) {
      return result(false, { error: formatStructuredError('VALIDATION_FAILED', v.errors.join('; '), { exitCode: EXIT_CODES.INPUT_VALIDATION_ERROR }) });
    }
    return result(true, { output: { fingerprint: fingerprintSem(goldSem) } });
  }

  if (operation === 'classify') {
    const sourceText = typeof parsed.sourceText === 'string' ? parsed.sourceText : '';
    const category = typeof parsed.category === 'string' ? parsed.category : 'simple_fact';
    return result(true, { output: { classification: classifyContent({ sourceText, category, risk: 'low', confidence: 0.8 }) } });
  }

  return result(false, { error: formatStructuredError('UNKNOWN_OPERATION', `Unknown operation: ${operation}`, { exitCode: EXIT_CODES.USAGE_ERROR }) });
}

export async function processJsonlStream(
  inputPath: string,
  operation: StreamOperation,
  writeLine: (json: string) => void,
): Promise<StreamSummary> {
  const stream = getInputStream(inputPath);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  let successCount = 0;
  let errorCount = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lineNum++;
    const result = processLine(lineNum, trimmed, operation);
    if (result.ok) successCount++;
    else errorCount++;
    writeLine(JSON.stringify(result));
  }

  return { totalLines: lineNum, successCount, errorCount, operation };
}
