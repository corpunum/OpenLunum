/**
 * Long-Context Sessions — R7.5
 *
 * Evaluates memory management in long-context sessions with retrieval,
 * updates, contradictions, and stale memory detection.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface SessionEvent {
  type: 'add' | 'update' | 'contradict' | 'retrieve' | 'expire';
  timestamp: number;
  key: string;
  value: string;
}

export interface MemoryEntry {
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  expired: boolean;
}

export interface MemoryConflict {
  key: string;
  oldValue: string;
  newValue: string;
  resolution: 'update' | 'reject' | 'conflict';
}

export interface RetrievalAttempt {
  key: string;
  found: boolean;
  value: string | null;
  stale: boolean;
}

export interface StaleReport {
  total: number;
  stale: number;
  staleRate: number;
  details: RetrievalAttempt[];
}

export interface ScenarioResult {
  timeline: SessionTimeline;
  staleReport: StaleReport;
  passed: boolean;
}

// ── SessionMemory ────────────────────────────────────────────────────

export class SessionMemory {
  readonly entries: Map<string, MemoryEntry> = new Map();

  add(key: string, value: string, timestamp: number): void {
    this.entries.set(key, {
      key,
      value,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      expired: false,
    });
  }

  update(key: string, value: string, timestamp: number): boolean {
    const existing = this.entries.get(key);
    if (!existing) return false;
    existing.value = value;
    existing.updatedAt = timestamp;
    existing.version += 1;
    return true;
  }

  retrieve(key: string): RetrievalAttempt {
    const entry = this.entries.get(key);
    if (!entry) {
      return { key, found: false, value: null, stale: false };
    }
    return {
      key,
      found: true,
      value: entry.value,
      stale: entry.expired,
    };
  }

  expire(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.expired = true;
    return true;
  }
}

// ── SessionTimeline ──────────────────────────────────────────────────

export interface SessionTimeline {
  events: SessionEvent[];
  memory: SessionMemory;
  conflicts: MemoryConflict[];
  retrievals: RetrievalAttempt[];
}

// ── Core functions ───────────────────────────────────────────────────

export function buildSessionTimeline(events: SessionEvent[]): SessionTimeline {
  const memory = new SessionMemory();
  const conflicts: MemoryConflict[] = [];
  const retrievals: RetrievalAttempt[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'add': {
        const existing = memory.entries.get(event.key);
        if (existing && !existing.expired) {
          // Adding to an existing key is a potential conflict if values differ
          if (existing.value !== event.value) {
            conflicts.push({
              key: event.key,
              oldValue: existing.value,
              newValue: event.value,
              resolution: 'conflict',
            });
          }
        }
        memory.add(event.key, event.value, event.timestamp);
        break;
      }
      case 'update': {
        const existing = memory.entries.get(event.key);
        if (existing && existing.value !== event.value) {
          conflicts.push({
            key: event.key,
            oldValue: existing.value,
            newValue: event.value,
            resolution: 'update',
          });
        }
        if (!memory.update(event.key, event.value, event.timestamp)) {
          // Key doesn't exist yet — treat as add
          memory.add(event.key, event.value, event.timestamp);
        }
        break;
      }
      case 'contradict': {
        const existing = memory.entries.get(event.key);
        if (existing) {
          conflicts.push({
            key: event.key,
            oldValue: existing.value,
            newValue: event.value,
            resolution: 'conflict',
          });
        }
        // Contradiction overwrites
        memory.add(event.key, event.value, event.timestamp);
        break;
      }
      case 'retrieve': {
        const attempt = memory.retrieve(event.key);
        retrievals.push(attempt);
        break;
      }
      case 'expire': {
        memory.expire(event.key);
        break;
      }
    }
  }

  return { events, memory, conflicts, retrievals };
}

export function detectStaleRetrievals(timeline: SessionTimeline): StaleReport {
  const details = timeline.retrievals;
  const total = details.length;
  const stale = details.filter((r) => r.stale).length;
  return {
    total,
    stale,
    staleRate: total === 0 ? 0 : stale / total,
    details,
  };
}

// ── Scenarios ────────────────────────────────────────────────────────

export const SESSION_TEST_SCENARIOS: ReadonlyArray<{
  name: string;
  description: string;
  events: SessionEvent[];
}> = [
  {
    name: 'basic-crud',
    description: 'Add, retrieve, update, retrieve — no conflicts',
    events: [
      { type: 'add', timestamp: 1, key: 'color', value: 'blue' },
      { type: 'retrieve', timestamp: 2, key: 'color', value: '' },
      { type: 'update', timestamp: 3, key: 'color', value: 'green' },
      { type: 'retrieve', timestamp: 4, key: 'color', value: '' },
    ],
  },
  {
    name: 'contradiction',
    description: 'Add A=1, then contradict A=2 — conflict detected',
    events: [
      { type: 'add', timestamp: 1, key: 'answer', value: '1' },
      { type: 'contradict', timestamp: 2, key: 'answer', value: '2' },
      { type: 'retrieve', timestamp: 3, key: 'answer', value: '' },
    ],
  },
  {
    name: 'stale-retrieval',
    description: 'Add, expire, retrieve — stale detection',
    events: [
      { type: 'add', timestamp: 1, key: 'token', value: 'abc123' },
      { type: 'expire', timestamp: 2, key: 'token', value: '' },
      { type: 'retrieve', timestamp: 3, key: 'token', value: '' },
    ],
  },
  {
    name: 'complex-session',
    description: '10+ events with mixed operations',
    events: [
      { type: 'add', timestamp: 1, key: 'user', value: 'alice' },
      { type: 'add', timestamp: 2, key: 'role', value: 'admin' },
      { type: 'add', timestamp: 3, key: 'theme', value: 'dark' },
      { type: 'retrieve', timestamp: 4, key: 'user', value: '' },
      { type: 'update', timestamp: 5, key: 'role', value: 'editor' },
      { type: 'contradict', timestamp: 6, key: 'user', value: 'bob' },
      { type: 'retrieve', timestamp: 7, key: 'user', value: '' },
      { type: 'expire', timestamp: 8, key: 'theme', value: '' },
      { type: 'retrieve', timestamp: 9, key: 'theme', value: '' },
      { type: 'add', timestamp: 10, key: 'lang', value: 'en' },
      { type: 'retrieve', timestamp: 11, key: 'role', value: '' },
      { type: 'update', timestamp: 12, key: 'lang', value: 'el' },
    ],
  },
];

// ── Runner ───────────────────────────────────────────────────────────

export function runSessionScenario(events: SessionEvent[]): ScenarioResult {
  const timeline = buildSessionTimeline(events);
  const staleReport = detectStaleRetrievals(timeline);

  const unresolvedConflicts = timeline.conflicts.filter(
    (c) => c.resolution === 'conflict',
  );
  const passed = unresolvedConflicts.length === 0 && staleReport.staleRate < 0.1;

  return { timeline, staleReport, passed };
}
