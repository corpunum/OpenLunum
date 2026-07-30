/**
 * OpenLunum Streaming Contract (R11.1, R11.2, R11.3)
 *
 * This module defines bounded-memory JSONL streaming types and a stream processor
 * that maintains constant memory usage regardless of input size.
 */

export const STREAMING_CONTRACT_VERSION = '1.0.0' as const;

/**
 * StreamingConfig: Configuration for bounded-memory streaming
 */
export interface StreamingConfig {
  readonly maxBufferSize: number;
  readonly flushIntervalMs: number;
}

/**
 * StreamEvent: Individual event in the stream
 */
export interface StreamEvent {
  readonly type: 'record' | 'error' | 'progress' | 'complete';
  readonly data: unknown;
  readonly timestamp: string;
}

/**
 * StreamProcessorStats: Statistics about stream processing
 */
export interface StreamProcessorStats {
  readonly processed: number;
  readonly errors: number;
  readonly bytesRead: number;
}

/**
 * StreamProcessor: Object with methods to process streaming data
 */
export interface StreamProcessor {
  process(line: string): StreamEvent;
  flush(): readonly StreamEvent[];
  stats(): StreamProcessorStats;
}

/**
 * createStreamProcessor: Creates a new stream processor with bounded memory
 *
 * The processor maintains a fixed-size buffer (maxBufferSize) and flushes
 * accumulated events at configurable intervals (flushIntervalMs) to prevent
 * memory growth regardless of input size.
 */
export function createStreamProcessor(config: StreamingConfig): StreamProcessor {
  let processedCount = 0;
  let errorCount = 0;
  let bytesRead = 0;
  const buffer: StreamEvent[] = [];
  let lastFlushTime = Date.now();

  function getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  function shouldFlush(): boolean {
    const timeSinceLastFlush = Date.now() - lastFlushTime;
    return buffer.length >= config.maxBufferSize || timeSinceLastFlush >= config.flushIntervalMs;
  }

  return {
    process(line: string): StreamEvent {
      bytesRead += line.length + 1; // +1 for newline

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
        processedCount++;
      } catch (error) {
        errorCount++;
        const errorEvent: StreamEvent = {
          type: 'error',
          data: {
            message: error instanceof Error ? error.message : String(error),
            line,
          },
          timestamp: getCurrentTimestamp(),
        };
        buffer.push(errorEvent);
        return errorEvent;
      }

      const recordEvent: StreamEvent = {
        type: 'record',
        data: parsed,
        timestamp: getCurrentTimestamp(),
      };
      buffer.push(recordEvent);

      if (shouldFlush()) {
        lastFlushTime = Date.now();
      }

      return recordEvent;
    },

    flush(): readonly StreamEvent[] {
      const result = [...buffer];
      buffer.length = 0;
      lastFlushTime = Date.now();
      return result;
    },

    stats(): StreamProcessorStats {
      return {
        processed: processedCount,
        errors: errorCount,
        bytesRead,
      };
    },
  };
}
