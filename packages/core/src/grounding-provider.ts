import { createHash } from 'node:crypto';
import { stableStringify } from './canonicalize.js';
import { canonicalizeGroundingProposal } from './grounding.js';
import type { GroundingProposal } from './grounding.js';
import type { GroundingResolution } from './grounding.js';

/** Provider results are evidence, never an alternate semantic protocol. */
export type GroundingProviderStatus = 'resolved_exact' | 'ambiguous' | 'unresolved' | 'provider_error';

export interface GroundingProviderInput {
  proposal: GroundingProposal;
  language: string;
  /** Optional syntactic hint. Providers must not infer one when absent. */
  partOfSpeech?: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  context?: string;
}

export interface GroundingProviderCandidate {
  externalId: string;
  label?: string;
  language?: string;
  evidence: readonly string[];
}

export interface GroundingProviderResult {
  status: GroundingProviderStatus;
  provider: string;
  providerVersion: string;
  snapshotHash: string;
  language: string;
  candidates: readonly GroundingProviderCandidate[];
  /** Stable, machine-readable explanation; no raw provider object is trusted. */
  diagnostics: readonly string[];
}

export interface GroundingProvider {
  readonly provider: string;
  readonly providerVersion: string;
  readonly snapshotHash: string;
  resolve(input: GroundingProviderInput): GroundingProviderResult;
  explain(result: GroundingProviderResult): readonly string[];
}

export interface OmwLexicalRecord {
  language: string;
  lemma: string;
  /** CILI/ILI identifier, not a human label. */
  interlingualId: string;
  partOfSpeech?: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  source?: string;
  license?: string;
}

export interface OmwProviderOptions {
  version: string;
  snapshotHash?: string;
  records: readonly OmwLexicalRecord[];
  provider?: string;
}

export interface OmwTabImportOptions {
  language: string;
  source?: string;
  license?: string;
  /** `wordnet-bahasa` supports synset, language, quality, lemma rows. */
  format?: 'wordnet' | 'wordnet-bahasa';
  languageColumnValue?: string;
  /** Maps the tab file's `offset-pos` key to a CILI/ILI identifier. */
  synsetToInterlingualId: ReadonlyMap<string, string>;
}

export interface OmwTabImportResult {
  records: OmwLexicalRecord[];
  unmappedSynsets: string[];
  malformedLines: number[];
}

export interface WnLmfImportOptions {
  language: string;
  source?: string;
  license?: string;
}

export interface WnLmfImportResult {
  records: OmwLexicalRecord[];
  unmappedSynsets: string[];
  malformedEntries: number;
}

function normalizeLemma(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('und').replace(/[\s_]+/gu, '_');
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function validSnapshotHash(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

function canonicalRecord(record: OmwLexicalRecord): OmwLexicalRecord {
  return {
    language: record.language.normalize('NFKC').trim().toLocaleLowerCase('und'),
    lemma: normalizeLemma(record.lemma),
    interlingualId: record.interlingualId.normalize('NFKC').trim(),
    ...(record.partOfSpeech ? { partOfSpeech: record.partOfSpeech } : {}),
    ...(record.source ? { source: record.source.normalize('NFKC').trim() } : {}),
    ...(record.license ? { license: record.license.normalize('NFKC').trim() } : {}),
  };
}

function validateRecord(record: OmwLexicalRecord, index: number): void {
  if (!record || typeof record !== 'object') throw new TypeError(`OMW record ${index} must be an object`);
  if (typeof record.language !== 'string' || !/^\p{Letter}[\p{Letter}\p{Number}-]*$/u.test(record.language.normalize('NFKC').trim())) throw new TypeError(`OMW record ${index} has invalid language`);
  if (typeof record.lemma !== 'string' || !normalizeLemma(record.lemma)) throw new TypeError(`OMW record ${index} has an empty lemma`);
  if (typeof record.interlingualId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]*$/u.test(record.interlingualId.normalize('NFKC').trim())) throw new TypeError(`OMW record ${index} has an invalid interlingual ID`);
}

function xmlAttributes(input: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])(.*?)\2/gu;
  for (const match of input.matchAll(pattern)) attributes.set(match[1]!, match[3]!);
  return attributes;
}

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#x[0-9a-f]+;|&#\d+;/giu, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    const number = entity.startsWith('&#x') || entity.startsWith('&#X') ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}

/** Import the lexical entries and explicit ILI attributes from WN-LMF XML. */
export function importWnLmf(content: string, options: WnLmfImportOptions): WnLmfImportResult {
  const synsets = new Map<string, { ili: string; partOfSpeech: OmwLexicalRecord['partOfSpeech'] }>();
  const unmapped = new Set<string>();
  const synsetTag = /<Synset\b([^>]*)>/gu;
  for (const match of content.matchAll(synsetTag)) {
    const attributes = xmlAttributes(match[1]!);
    const id = attributes.get('id');
    const ili = attributes.get('ili')?.trim() ?? '';
    const posCode = attributes.get('partOfSpeech')?.toLowerCase();
    const partOfSpeech = ({ n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' } as const)[posCode as 'n' | 'v' | 'a' | 's' | 'r'];
    if (!id || !partOfSpeech) continue;
    if (!ili || ili === 'in') unmapped.add(id);
    else synsets.set(id, { ili, partOfSpeech });
  }
  const records: OmwLexicalRecord[] = [];
  let malformedEntries = 0;
  const entryTag = /<LexicalEntry\b[^>]*>([\s\S]*?)<\/LexicalEntry>/gu;
  for (const entry of content.matchAll(entryTag)) {
    const lemmaMatch = /<Lemma\b([^>]*)\/>/u.exec(entry[1]!);
    const lemmaAttributes = lemmaMatch ? xmlAttributes(lemmaMatch[1]!) : null;
    const writtenForm = lemmaAttributes?.get('writtenForm');
    const senses = [...entry[1]!.matchAll(/<Sense\b([^>]*)\/>/gu)];
    if (!writtenForm || senses.length === 0) { malformedEntries += 1; continue; }
    for (const sense of senses) {
      const synset = xmlAttributes(sense[1]!).get('synset');
      const mapped = synset ? synsets.get(synset) : undefined;
      if (!mapped) { if (synset) unmapped.add(synset); continue; }
      records.push({ language: options.language, lemma: decodeXml(writtenForm), interlingualId: mapped.ili, ...(mapped.partOfSpeech ? { partOfSpeech: mapped.partOfSpeech } : {}), ...(options.source ? { source: options.source } : {}), ...(options.license ? { license: options.license } : {}) });
    }
  }
  return { records, unmappedSynsets: [...unmapped].sort((a, b) => a.localeCompare(b, 'en')), malformedEntries };
}

/** Import the documented OMW tab format without guessing unmapped synsets. */
export function importOmwTab(content: string, options: OmwTabImportOptions): OmwTabImportResult {
  const records: OmwLexicalRecord[] = [];
  const unmapped = new Set<string>();
  const malformedLines: number[] = [];
  for (const [offset, rawLine] of content.split(/\r?\n/u).entries()) {
    const lineNumber = offset + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    let synset: string | undefined;
    let lemmaType: string | undefined;
    let lemma: string | undefined;
    if (fields.length === 3 && options.format !== 'wordnet-bahasa') {
      [synset, lemmaType, lemma] = fields;
      if (lemmaType !== 'lemma' && !/^[a-z]{3}:lemma$/u.test(lemmaType!)) {
        continue;
      }
    } else if (fields.length >= 4 && options.format !== 'wordnet-bahasa' && /(?:^|:)def$/u.test(fields[1]!)) {
      continue;
    } else if (fields.length === 4 && options.format === 'wordnet-bahasa') {
      const [bahasaSynset, languageCode, , bahasaLemma] = fields;
      if (options.languageColumnValue && languageCode !== options.languageColumnValue) continue;
      synset = bahasaSynset;
      lemmaType = bahasaSynset?.split('-')[1];
      lemma = bahasaLemma;
    } else {
      malformedLines.push(lineNumber);
      continue;
    }
    const mappingKey = synset!;
    const interlingualId = options.synsetToInterlingualId.get(mappingKey);
    if (!interlingualId) { unmapped.add(mappingKey); continue; }
    const posCode = (lemmaType === 'lemma' || /^[a-z]{3}:lemma$/u.test(lemmaType!.toLowerCase())) ? synset!.split('-')[1] : lemmaType!.toLowerCase();
    const partOfSpeech = ({ n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' } as const)[posCode as 'n' | 'v' | 'a' | 's' | 'r'];
    if (!partOfSpeech || !lemma) { malformedLines.push(lineNumber); continue; }
    records.push({ language: options.language, lemma: lemma.replace(/_/gu, ' '), interlingualId, partOfSpeech, ...(options.source ? { source: options.source } : {}), ...(options.license ? { license: options.license } : {}) });
  }
  return { records, unmappedSynsets: [...unmapped].sort((a, b) => a.localeCompare(b, 'en')), malformedLines };
}

/**
 * Offline exact lookup over a pinned OMW/CILI-derived record set.
 *
 * This intentionally resolves only an unmodified lexical head. A compound
 * proposal with modifiers remains unresolved because WordNet evidence for the
 * head does not prove the composition. Callers may add a separate, explicitly
 * verified composition provider later.
 */
export function createOmwProvider(options: OmwProviderOptions): GroundingProvider {
  options.records.forEach(validateRecord);
  const records = options.records.map(canonicalRecord).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b), 'en'));
  const snapshotHash = options.snapshotHash ?? sha256(records);
  if (!validSnapshotHash(snapshotHash)) throw new TypeError('OMW snapshotHash must be a SHA-256 hex digest');
  const provider = options.provider ?? 'omw-cili';
  return Object.freeze({
    provider,
    providerVersion: options.version,
    snapshotHash,
    resolve(input: GroundingProviderInput): GroundingProviderResult {
      const canonical = canonicalizeGroundingProposal(input.proposal);
      const language = input.language.normalize('NFKC').trim().toLocaleLowerCase('und');
      const base = { provider, providerVersion: options.version, snapshotHash, language };
      if (!canonical.valid || !canonical.canonical) return { ...base, status: 'provider_error', candidates: [], diagnostics: ['invalid grounding proposal'] };
      if (canonical.canonical.modifiers.length > 0) return { ...base, status: 'unresolved', candidates: [], diagnostics: ['OMW lexical evidence does not prove a modified composition'] };
      if (!input.partOfSpeech || input.partOfSpeech === 'other') return { ...base, status: 'unresolved', candidates: [], diagnostics: ['part-of-speech is required for exact lexical grounding'] };
      const lemma = canonical.canonical.head.key;
      const matches = records.filter((record) => record.language === language && record.lemma === lemma && (!input.partOfSpeech || record.partOfSpeech === input.partOfSpeech));
      const byId = new Map<string, GroundingProviderCandidate>();
      for (const match of matches) {
        if (!match.interlingualId) continue;
        const externalId = `ili:${match.interlingualId}`;
        byId.set(externalId, { externalId, label: match.lemma, language: match.language, evidence: Object.freeze([...(match.source ? [`source:${match.source}`] : []), ...(match.license ? [`license:${match.license}`] : [])]) });
      }
      const candidates = [...byId.values()].sort((a, b) => a.externalId.localeCompare(b.externalId, 'en'));
      return { ...base, status: candidates.length === 1 ? 'resolved_exact' : candidates.length > 1 ? 'ambiguous' : 'unresolved', candidates, diagnostics: candidates.length === 1 ? ['exact lemma-to-ILI match'] : candidates.length > 1 ? ['lemma maps to multiple ILI senses'] : ['no exact lemma-to-ILI match'] };
    },
    explain(result: GroundingProviderResult): readonly string[] { return Object.freeze([...result.diagnostics]); },
  });
}

export interface StableEntityProviderOptions {
  provider: string;
  providerVersion: string;
  snapshotHash: string;
  resolveExact(input: GroundingProviderInput): readonly GroundingProviderCandidate[];
}

/**
 * Generic adapter for a prevalidated stable-ID entity snapshot (for example a
 * Wikidata dump). Label search belongs outside this adapter; only exact,
 * context-checked assertions may enter it.
 */
export function createStableEntityProvider(options: StableEntityProviderOptions): GroundingProvider {
  if (!validSnapshotHash(options.snapshotHash)) throw new TypeError('entity snapshotHash must be a SHA-256 hex digest');
  return Object.freeze({
    provider: options.provider,
    providerVersion: options.providerVersion,
    snapshotHash: options.snapshotHash,
    resolve(input: GroundingProviderInput): GroundingProviderResult {
      const candidates = [...options.resolveExact(input)].sort((a, b) => a.externalId.localeCompare(b.externalId, 'en'));
      const unique = [...new Map(candidates.map((candidate) => [candidate.externalId, candidate])).values()];
      return {
        provider: options.provider,
        providerVersion: options.providerVersion,
        snapshotHash: options.snapshotHash,
        language: input.language,
        status: unique.length === 1 ? 'resolved_exact' : unique.length > 1 ? 'ambiguous' : 'unresolved',
        candidates: unique,
        diagnostics: unique.length === 1 ? ['exact stable-ID assertion'] : unique.length > 1 ? ['multiple stable-ID assertions'] : ['no exact stable-ID assertion'],
      };
    },
    explain(result: GroundingProviderResult): readonly string[] { return Object.freeze([...result.diagnostics]); },
  });
}

export interface GroundingCascadeResult {
  status: 'resolved_exact' | 'ambiguous' | 'unresolved' | 'provider_error';
  provider?: string;
  candidate?: GroundingProviderCandidate;
  attempted: readonly string[];
  results: readonly GroundingProviderResult[];
}

/** Convert one exact provider assertion into the existing materialization contract. */
export function toGroundingResolution(proposal: GroundingProposal, result: GroundingProviderResult): GroundingResolution {
  const canonical = canonicalizeGroundingProposal(proposal);
  const path = canonical.canonical?.path ?? proposal.path;
  if (!canonical.valid || !canonical.canonical) {
    return { path, status: 'invalid', issues: ['provider result cannot materialize an invalid grounding proposal'] };
  }
  if (result.status !== 'resolved_exact' || result.candidates.length !== 1) {
    return {
      path,
      status: result.status === 'ambiguous' ? 'ambiguous' : result.status === 'provider_error' ? 'invalid' : 'unresolved',
      registry: { registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash },
      issues: [...result.diagnostics],
    };
  }
  const externalId = result.candidates[0]!.externalId;
  if (!/^[a-z][a-z0-9.-]*$/u.test(result.provider) || !/^\S+$/u.test(externalId)) {
    return { path, status: 'invalid', registry: { registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash }, issues: ['provider or external ID is not safe for a canonical namespace'] };
  }
  return {
    path,
    status: 'resolved',
    canonicalId: `urn:${result.provider}:${externalId}`,
    registry: { registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash },
    issues: [],
  };
}

/** Resolve conservatively: the first exact result wins only if no provider disagrees. */
export function resolveGroundingCascade(input: GroundingProviderInput, providers: readonly GroundingProvider[]): GroundingCascadeResult {
  const results: GroundingProviderResult[] = [];
  for (const provider of providers) {
    let result: GroundingProviderResult;
    try { result = provider.resolve(input); } catch (error) {
      result = { status: 'provider_error', provider: provider.provider, providerVersion: provider.providerVersion, snapshotHash: provider.snapshotHash, language: input.language, candidates: [], diagnostics: [`provider threw: ${error instanceof Error ? error.message : String(error)}`] };
    }
    results.push(result);
    if (result.status === 'ambiguous') return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
    if (result.status !== 'resolved_exact' || result.candidates.length !== 1) continue;
    const candidate = result.candidates[0]!;
    const later = providers.slice(providers.indexOf(provider) + 1);
    for (const other of later) {
      let comparison: GroundingProviderResult;
      try { comparison = other.resolve(input); } catch { continue; }
      results.push(comparison);
      if (comparison.status === 'ambiguous') return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
      if (comparison.status === 'resolved_exact' && comparison.candidates.length === 1 && comparison.candidates[0]!.externalId !== candidate.externalId) return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
    }
    return { status: 'resolved_exact', provider: result.provider, candidate, attempted: results.map((item) => item.provider), results };
  }
  return { status: results.some((result) => result.status === 'provider_error') ? 'provider_error' : 'unresolved', attempted: results.map((item) => item.provider), results };
}
