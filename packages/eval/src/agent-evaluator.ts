/**
 * Blind agent-native evaluation.
 *
 * The gold item type is intentionally not exported. The evaluator owner keeps
 * it inside this module/process and only exposes BlindEvalNextItem to an
 * extraction worker. Results never include the gold Sem or its fingerprint.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  getExtractionContract,
  SEMANTIC_TRANSPORT_SCHEMA_SHA256,
  submitCandidate,
} from '@corpunum/lunum';
import type { AgentExtractionProvenance, LunumSem } from '@corpunum/lunum';
import { readJsonlLedger } from './io.js';

const BLIND_EVALUATION_VERSION = 'openlunum-blind-agent-eval/0.1' as const;

interface PrivateGoldItem {
  id: string;
  sourceLanguage: string;
  sourceText: string;
  goldSem: LunumSem;
  expectedOutcome?: 'parse' | 'abstain';
  semanticGroup?: string;
}

export interface BlindEvalNextItem {
  runId: string;
  itemId: string;
  sourceLanguage: string;
  sourceText: string;
  contractVersion: string;
  contractHash: string;
}

export interface BlindEvalSubmission {
  runId: string;
  itemId: string;
  candidateSem: unknown;
  provenance: AgentExtractionProvenance;
}

export interface BlindEvalResult {
  runId: string;
  itemId: string;
  status: 'passed' | 'failed' | 'error';
  candidateIdentityAvailable: boolean;
  identityComparable: boolean;
  semanticIdentityExact: boolean;
  abstained: boolean;
  failureClass: string | null;
  diagnostics: string[];
  provenance: AgentExtractionProvenance;
  submittedAt: string;
}

export interface BlindEvalLanguageSummary {
  language: string;
  parseTargets: number;
  exact: number;
  exactRate: number;
  candidateIdentityAvailable: number;
}

export interface BlindEvalSummary {
  runId: string;
  totalItems: number;
  completedItems: number;
  parseTargets: number;
  parseExact: number;
  parseExactMicro: number | null;
  abstentionTargets: number;
  correctAbstentions: number;
  unexpectedParses: number;
  abstentionAccuracy: number | null;
  candidateIdentityAvailable: number;
  identityComparable: number;
  identityExact: number;
  comparableButNonExact: number;
  failureClasses: Record<string, number>;
  byLanguage: BlindEvalLanguageSummary[];
  goldGroups: number;
  goldGroupsConverging: number;
  modelGroupsAttempted: number;
  modelGroupsConverging: number;
}

interface DurableBlindResult extends BlindEvalResult {
  schema: typeof BLIND_EVALUATION_VERSION;
}

interface PrivateBlindResult {
  schema: 'openlunum-blind-private/0.1';
  runId: string;
  itemId: string;
  candidateSem: unknown;
  candidateIdentity: string | null;
  provenance: AgentExtractionProvenance;
}

interface BlindManifest {
  schema: typeof BLIND_EVALUATION_VERSION;
  runId: string;
  contractVersion: string;
  contractHash: string;
  transportSchemaHash: string;
  datasetHash: string;
  itemCount: number;
}

interface BlindCheckpoint {
  schema: 'openlunum-blind-checkpoint/0.1';
  runId: string;
  binding: string;
  completedItemIds: string[];
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function contractHash(): string {
  return hash(getExtractionContract());
}

function datasetHash(items: readonly PrivateGoldItem[]): string {
  return hash(items.map(({ id, sourceLanguage, sourceText, goldSem, expectedOutcome, semanticGroup }) => ({
    id, sourceLanguage, sourceText, goldSem, expectedOutcome, semanticGroup,
  })));
}

function safeExpectedOutcome(item: PrivateGoldItem): 'parse' | 'abstain' {
  return item.expectedOutcome ?? 'parse';
}

/**
 * Evaluator-owned blind session. Construct this only where gold is private;
 * extraction workers should receive the next()/submit() facade, not items.
 */
export class BlindAgentEvaluationSession {
  private readonly itemById: ReadonlyMap<string, PrivateGoldItem>;
  private readonly completed = new Map<string, DurableBlindResult>();
  private readonly privateResults = new Map<string, PrivateBlindResult>();
  private readonly claimed = new Set<string>();
  private readonly contractHashValue: string;
  private readonly datasetHashValue: string;
  private initialized = false;

  private constructor(
    private readonly runId: string,
    items: readonly PrivateGoldItem[],
    private readonly outputDirectory: string,
  ) {
    if (!runId || !outputDirectory || items.length === 0) throw new Error('blind evaluation requires runId, outputDirectory, and gold items');
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('blind evaluation item IDs must be unique');
    this.itemById = new Map(items.map(item => [item.id, item]));
    this.contractHashValue = contractHash();
    this.datasetHashValue = datasetHash(items);
    for (const item of items) {
      if (safeExpectedOutcome(item) !== 'parse') continue;
      const gold = submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, candidateSem: item.goldSem, provenance: { extractorType: 'other' } });
      if (!gold.candidateIdentityAvailable) throw new Error(`blind evaluation gold preflight failed for item ${item.id}`);
    }
  }

  /** Create a new evaluator-private session. Gold is never returned by this API. */
  static async create(runId: string, items: readonly PrivateGoldItem[], outputDirectory: string): Promise<BlindAgentEvaluationSession> {
    const session = new BlindAgentEvaluationSession(runId, items, outputDirectory);
    await session.initialize();
    return session;
  }

  private get ledgerPath(): string { return `${this.outputDirectory}/agent-results.jsonl`; }
  private get privateLedgerPath(): string { return `${this.outputDirectory}.private/agent-results.jsonl`; }
  private get checkpointPath(): string { return `${this.outputDirectory}/agent-checkpoint.json`; }
  private get manifestPath(): string { return `${this.outputDirectory}/agent-manifest.json`; }

  private binding(): string {
    return hash({ runId: this.runId, contractHash: this.contractHashValue, datasetHash: this.datasetHashValue, transportSchemaHash: SEMANTIC_TRANSPORT_SCHEMA_SHA256 });
  }

  private async initialize(): Promise<void> {
    await mkdir(this.outputDirectory, { recursive: true });
    const manifest: BlindManifest = {
      schema: BLIND_EVALUATION_VERSION,
      runId: this.runId,
      contractVersion: getExtractionContract().contractVersion,
      contractHash: this.contractHashValue,
      transportSchemaHash: SEMANTIC_TRANSPORT_SCHEMA_SHA256,
      datasetHash: this.datasetHashValue,
      itemCount: this.itemById.size,
    };
    const existingManifest = await this.readOptionalJson<BlindManifest>(this.manifestPath);
    if (existingManifest && (existingManifest.schema !== BLIND_EVALUATION_VERSION || existingManifest.runId !== this.runId || existingManifest.itemCount !== this.itemById.size || existingManifest.contractHash !== this.contractHashValue || existingManifest.datasetHash !== this.datasetHashValue || existingManifest.transportSchemaHash !== SEMANTIC_TRANSPORT_SCHEMA_SHA256)) {
      throw new Error('blind evaluation manifest is invalid or mismatched; refusing resume');
    }
    if (existingManifest && JSON.stringify(existingManifest) !== JSON.stringify(manifest)) {
      throw new Error('blind evaluation manifest mismatch; refusing to reuse output directory');
    }
    if (!existingManifest) await writeFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const ledger = await readJsonlLedger<DurableBlindResult>(this.ledgerPath);
    const privateLedger = await readJsonlLedger<PrivateBlindResult>(this.privateLedgerPath);
    for (const result of privateLedger) {
      if (result.schema !== 'openlunum-blind-private/0.1' || result.runId !== this.runId || !this.itemById.has(result.itemId) || this.privateResults.has(result.itemId)) throw new Error('invalid private blind evaluation ledger; refusing resume');
      this.privateResults.set(result.itemId, result);
    }
    for (const result of ledger) {
      if (result.schema !== BLIND_EVALUATION_VERSION || result.runId !== this.runId || !this.itemById.has(result.itemId)) {
        throw new Error('invalid blind evaluation ledger record; refusing resume');
      }
      if (this.completed.has(result.itemId)) throw new Error(`duplicate blind evaluation item: ${result.itemId}`);
      this.validateDurableResult(result, this.privateResults.get(result.itemId));
      this.completed.set(result.itemId, result);
    }
    if (this.privateResults.size !== this.completed.size) throw new Error('private and public blind ledgers disagree; refusing resume');
    const checkpoint = await this.readOptionalJson<BlindCheckpoint>(this.checkpointPath);
    if (checkpoint && (checkpoint.schema !== 'openlunum-blind-checkpoint/0.1' || !Array.isArray(checkpoint.completedItemIds) || new Set(checkpoint.completedItemIds).size !== checkpoint.completedItemIds.length)) throw new Error('invalid blind evaluation checkpoint; refusing resume');
    if (checkpoint && (checkpoint.binding !== this.binding() || checkpoint.runId !== this.runId)) {
      throw new Error('blind evaluation checkpoint provenance mismatch; refusing resume');
    }
    if (checkpoint && checkpoint.completedItemIds.some(id => !this.completed.has(id))) {
      throw new Error('blind evaluation checkpoint is ahead of durable ledger; refusing resume');
    }
    await this.persistCheckpoint();
    this.initialized = true;
  }

  private async readOptionalJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error(`Malformed blind evaluation metadata at ${file}; refusing resume`);
    }
  }

  private async persistCheckpoint(): Promise<void> {
    const checkpoint: BlindCheckpoint = {
      schema: 'openlunum-blind-checkpoint/0.1', runId: this.runId, binding: this.binding(),
      completedItemIds: [...this.completed.keys()],
    };
    await writeFile(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  }

  /** Return only the next unsubmitted source item and contract binding. */
  next(): BlindEvalNextItem | null {
    if (!this.initialized) throw new Error('blind evaluation is not initialized');
    for (const item of this.itemById.values()) {
      if (!this.completed.has(item.id)) {
        if (this.claimed.has(item.id)) continue;
        this.claimed.add(item.id);
        return {
          runId: this.runId, itemId: item.id, sourceLanguage: item.sourceLanguage, sourceText: item.sourceText,
          contractVersion: getExtractionContract().contractVersion, contractHash: this.contractHashValue,
        };
      }
    }
    return null;
  }

  /** Validate and privately score one candidate. Gold never appears in the result. */
  async submit(input: BlindEvalSubmission): Promise<BlindEvalResult> {
    if (!this.initialized) throw new Error('blind evaluation is not initialized');
    if (input.runId !== this.runId) throw new Error('blind evaluation run ID mismatch');
    const item = this.itemById.get(input.itemId);
    if (!item) throw new Error('unknown blind evaluation item');
    if (this.completed.has(item.id)) throw new Error('blind evaluation item already completed');
    const expectedOutcome = safeExpectedOutcome(item);
    let candidate: ReturnType<typeof submitCandidate> | null = null;
    let error: string | null = null;
    try {
      candidate = submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, candidateSem: input.candidateSem, provenance: input.provenance });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const abstained = candidate ? !candidate.candidateIdentityAvailable : true;
    const identityComparable = Boolean(candidate?.candidateIdentityAvailable && expectedOutcome === 'parse');
    const goldIdentity = expectedOutcome === 'parse' ? this.goldIdentityFor(item) : null;
    const semanticIdentityExact = Boolean(identityComparable && goldIdentity && candidate?.semanticFingerprint === goldIdentity);
    const passed = Boolean(candidate && (expectedOutcome === 'abstain' ? abstained : semanticIdentityExact));
    const result: DurableBlindResult = {
      schema: BLIND_EVALUATION_VERSION, runId: this.runId, itemId: item.id, status: error ? 'error' : passed ? 'passed' : 'failed',
      candidateIdentityAvailable: candidate?.candidateIdentityAvailable ?? false, identityComparable, semanticIdentityExact, abstained,
      failureClass: error ? 'submission_error' : passed ? null : (expectedOutcome === 'abstain' ? 'unexpected_parse' : candidate?.failureClass ?? 'semantic_identity_mismatch'),
      diagnostics: error ? ['candidate submission failed'] : candidate?.diagnostics ?? [], provenance: candidate?.provenance ?? input.provenance, submittedAt: new Date().toISOString(),
    };
    const privateResult: PrivateBlindResult = { schema: 'openlunum-blind-private/0.1', runId: this.runId, itemId: item.id, candidateSem: input.candidateSem, candidateIdentity: candidate?.semanticFingerprint ?? null, provenance: candidate?.provenance ?? input.provenance };
    await appendFile(this.ledgerPath, `${JSON.stringify(result)}\n`, 'utf8');
    await mkdir(`${this.outputDirectory}.private`, { recursive: true, mode: 0o700 });
    await appendFile(this.privateLedgerPath, `${JSON.stringify(privateResult)}\n`, 'utf8');
    this.completed.set(item.id, result);
    this.privateResults.set(item.id, privateResult);
    this.claimed.delete(item.id);
    await this.persistCheckpoint();
    const { schema: _schema, ...publicResult } = result;
    return publicResult;
  }

  completedCount(): number { return this.completed.size; }
  totalCount(): number { return this.itemById.size; }

  /** Rebuild evaluator metrics from the durable item ledger and private gold. */
  summary(): BlindEvalSummary {
    const results = [...this.completed.values()];
    const parseItems = [...this.itemById.values()].filter(item => safeExpectedOutcome(item) === 'parse');
    const abstentionTargets = this.itemById.size - parseItems.length;
    const parseExact = results.filter(result => this.itemById.get(result.itemId) && safeExpectedOutcome(this.itemById.get(result.itemId)!) === 'parse' && result.semanticIdentityExact).length;
    const correctAbstentions = results.filter(result => this.itemById.get(result.itemId) && safeExpectedOutcome(this.itemById.get(result.itemId)!) === 'abstain' && result.abstained).length;
    const unexpectedParses = results.filter(result => this.itemById.get(result.itemId) && safeExpectedOutcome(this.itemById.get(result.itemId)!) === 'abstain' && !result.abstained).length;
    const failureClasses: Record<string, number> = {};
    for (const result of results) if (result.failureClass) failureClasses[result.failureClass] = (failureClasses[result.failureClass] ?? 0) + 1;
    const languages = [...new Set([...this.itemById.values()].map(item => item.sourceLanguage))].sort();
    const byLanguage = languages.map(language => {
      const ids = new Set([...this.itemById.values()].filter(item => item.sourceLanguage === language && safeExpectedOutcome(item) === 'parse').map(item => item.id));
      const rows = results.filter(result => ids.has(result.itemId));
      return { language, parseTargets: ids.size, exact: rows.filter(row => row.semanticIdentityExact).length, exactRate: ids.size ? rows.filter(row => row.semanticIdentityExact).length / ids.size : 0, candidateIdentityAvailable: rows.filter(row => row.candidateIdentityAvailable).length };
    });
    const groups = new Map<string, DurableBlindResult[]>();
    for (const result of results) {
      const group = this.itemById.get(result.itemId)?.semanticGroup;
      if (group) groups.set(group, [...(groups.get(group) ?? []), result]);
    }
    let goldGroupsConverging = 0;
    let modelGroupsConverging = 0;
    for (const [group, rows] of groups) {
      const goldIds = new Set(rows.map(row => this.goldIdentityFor(this.itemById.get(row.itemId)!)).filter((id): id is string => id !== null));
      if (goldIds.size === 1) goldGroupsConverging++;
      const modelIds = new Set(rows.map(row => this.privateResults.get(row.itemId)?.candidateIdentity).filter((id): id is string => Boolean(id)));
      if (rows.length > 0 && rows.every(row => Boolean(this.privateResults.get(row.itemId)?.candidateIdentity)) && modelIds.size === 1) modelGroupsConverging++;
    }
    return {
      runId: this.runId, totalItems: this.itemById.size, completedItems: results.length,
      parseTargets: parseItems.length, parseExact, parseExactMicro: parseItems.length ? parseExact / parseItems.length : null,
      abstentionTargets, correctAbstentions, unexpectedParses, abstentionAccuracy: abstentionTargets ? correctAbstentions / abstentionTargets : null,
      candidateIdentityAvailable: results.filter(result => result.candidateIdentityAvailable).length,
      identityComparable: results.filter(result => result.identityComparable).length,
      identityExact: results.filter(result => result.semanticIdentityExact).length,
      comparableButNonExact: results.filter(result => result.identityComparable && !result.semanticIdentityExact).length,
      failureClasses, byLanguage, goldGroups: groups.size, goldGroupsConverging, modelGroupsAttempted: groups.size, modelGroupsConverging,
    };
  }

  private goldIdentityFor(item: PrivateGoldItem): string | null {
    if (safeExpectedOutcome(item) !== 'parse') return null;
    return submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, candidateSem: item.goldSem, provenance: { extractorType: 'other' } }).semanticFingerprint;
  }

  private validateDurableResult(result: DurableBlindResult, privateResult: PrivateBlindResult | undefined): void {
    const item = this.itemById.get(result.itemId);
    if (!item || !privateResult) throw new Error(`invalid blind result record for ${result.itemId}; refusing resume`);
    if (!['passed', 'failed', 'error'].includes(result.status) || typeof result.candidateIdentityAvailable !== 'boolean' || typeof result.identityComparable !== 'boolean' || typeof result.semanticIdentityExact !== 'boolean' || typeof result.abstained !== 'boolean' || !Array.isArray(result.diagnostics) || !result.provenance || typeof result.provenance !== 'object') throw new Error(`invalid blind result fields for ${result.itemId}; refusing resume`);
    if (result.status === 'error') {
      if (result.failureClass !== 'submission_error' || result.candidateIdentityAvailable || result.identityComparable || result.semanticIdentityExact || !result.abstained) throw new Error(`invalid blind error result for ${result.itemId}; refusing resume`);
      return;
    }
    const recomputed = submitCandidate({ sourceText: item.sourceText, sourceLanguage: item.sourceLanguage, candidateSem: privateResult.candidateSem, provenance: privateResult.provenance });
    const expectedOutcome = safeExpectedOutcome(item);
    const expectedAbstained = !recomputed.candidateIdentityAvailable;
    const expectedComparable = recomputed.candidateIdentityAvailable && expectedOutcome === 'parse';
    const expectedExact = expectedComparable && recomputed.semanticFingerprint === this.goldIdentityFor(item);
    const expectedPassed = expectedOutcome === 'abstain' ? expectedAbstained : expectedExact;
    if (recomputed.semanticFingerprint !== privateResult.candidateIdentity || recomputed.candidateIdentityAvailable !== result.candidateIdentityAvailable || result.abstained !== expectedAbstained || result.identityComparable !== expectedComparable || result.semanticIdentityExact !== expectedExact || (result.status === 'passed') !== expectedPassed) throw new Error(`blind result does not match candidate for ${result.itemId}; refusing resume`);
  }
}
