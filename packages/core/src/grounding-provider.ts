import { createHash } from 'node:crypto';
import { stableStringify } from './canonicalize.js';
import { canonicalizeGroundingProposal } from './grounding.js';
import type { GroundingProposal } from './grounding.js';
import type { GroundingResolution } from './grounding.js';
import { authenticatedGroundingResolutions, authenticatedProviderResults } from './grounding-capability.js';

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

// These capabilities deliberately do not survive JSON serialization.  The
// public conversion helpers therefore cannot be used as a second trust path:
// only results returned by the local, metadata-bound cascade are eligible for
// materialization in this process.

export interface GroundingProvider {
  readonly provider: string;
  readonly providerVersion: string;
  readonly snapshotHash: string;
  resolve(input: GroundingProviderInput): GroundingProviderResult;
  explain(result: GroundingProviderResult): readonly string[];
}

/** A pinned analyzer may propose lemmas; it cannot assign semantic identity. */
export interface MorphologyCandidate {
  lemma: string;
  partOfSpeech?: OmwLexicalRecord['partOfSpeech'];
  evidence: readonly string[];
}

export interface MorphologyAnalyzer {
  readonly analyzer: string;
  readonly analyzerVersion: string;
  readonly snapshotHash: string;
  analyze(input: { surface: string; language: string; partOfSpeech?: GroundingProviderInput['partOfSpeech'] }): readonly MorphologyCandidate[];
}

export interface MorphologyProviderOptions {
  base: GroundingProvider;
  analyzer: MorphologyAnalyzer;
}

/** Result of intersecting independently obtained candidate sets. */
export interface GroundingCandidateIntersection {
  /** Candidate-set narrowing is evidence, not provider-owned exact identity. */
  status: 'candidate_narrowed' | 'ambiguous' | 'unresolved';
  candidates: readonly GroundingProviderCandidate[];
  diagnostics: readonly string[];
}

export interface GroundingCandidateIntersectionOptions {
  /** The caller's explicit semantic relation between the observations. */
  relation: 'same-concept' | 'same-reference' | 'same-translation';
}

/**
 * Narrow candidate sets only when the caller has an explicit relation between
 * the observations (for example, a judged translation pair). This operation
 * never invents a candidate and never turns lexical proximity into identity.
 */
export function intersectGroundingCandidateSets(results: readonly GroundingProviderResult[], options: GroundingCandidateIntersectionOptions): GroundingCandidateIntersection {
  if (!options || !options.relation) return { status: 'unresolved', candidates: [], diagnostics: ['explicit semantic relation is required for candidate-set intersection'] };
  if (results.length === 0) return { status: 'unresolved', candidates: [], diagnostics: ['no provider candidate sets supplied'] };
  if (results.some((result) => result.status === 'provider_error')) return { status: 'unresolved', candidates: [], diagnostics: ['provider error prevents candidate-set intersection'] };
  if (results.some((result) => result.status === 'unresolved' && result.candidates.length > 0) || results.some((result) => result.status !== 'unresolved' && result.candidates.length === 0)) return { status: 'unresolved', candidates: [], diagnostics: ['provider status is inconsistent with its candidate set'] };
  if (new Set(results.map((result) => `${result.provider}\u0000${result.snapshotHash}`)).size !== results.length) return { status: 'unresolved', candidates: [], diagnostics: ['candidate sets are not independently namespaced provider observations'] };
  const namespaces = new Set(results.flatMap((result) => result.candidates.map((candidate) => candidate.externalId.split(':', 1)[0])));
  if (namespaces.size > 1) return { status: 'unresolved', candidates: [], diagnostics: ['candidate identity namespaces are incompatible'] };
  let current = new Map(results[0]!.candidates.map((candidate) => [candidate.externalId, candidate]));
  for (const result of results.slice(1)) {
    const next = new Map(result.candidates.map((candidate) => [candidate.externalId, candidate]));
    current = new Map([...current.entries()].flatMap(([externalId, candidate]) => {
      const other = next.get(externalId);
      return other ? [[externalId, { ...candidate, evidence: Object.freeze([...new Set([...candidate.evidence, ...other.evidence, `relation:${options.relation}`])]) }] ] : [];
    }));
  }
  const candidates = [...current.values()].sort((a, b) => a.externalId.localeCompare(b.externalId, 'en'));
  if (candidates.length === 1) return { status: 'candidate_narrowed', candidates, diagnostics: ['one identity remains in the explicit candidate-set intersection; provider-owned exact resolution is still required'] };
  if (candidates.length > 1) return { status: 'ambiguous', candidates, diagnostics: [`${candidates.length} identities remain in the explicit candidate-set intersection`] };
  return { status: 'unresolved', candidates: [], diagnostics: ['candidate-set intersection is empty'] };
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
  invalidMappings: number[];
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
  invalidMappings: number[];
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

function providerResultIssues(result: unknown): string[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['provider returned a non-object result'];
  const value = result as Record<string, unknown>;
  const issues: string[] = [];
  if (!['resolved_exact', 'ambiguous', 'unresolved', 'provider_error'].includes(value.status as string)) issues.push('provider returned an invalid status');
  if (typeof value.provider !== 'string' || !value.provider.trim()) issues.push('provider returned an invalid provider name');
  if (typeof value.providerVersion !== 'string' || !value.providerVersion.trim()) issues.push('provider returned an invalid provider version');
  if (typeof value.snapshotHash !== 'string' || !validSnapshotHash(value.snapshotHash)) issues.push('provider returned an invalid snapshot hash');
  if (typeof value.language !== 'string' || !value.language.trim()) issues.push('provider returned an invalid language');
  if (!Array.isArray(value.candidates)) issues.push('provider returned a non-array candidate list');
  else for (const candidate of value.candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) { issues.push('provider returned a non-object candidate'); continue; }
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.externalId !== 'string' || !/^\S+$/u.test(entry.externalId)) issues.push('provider returned an invalid external ID');
    if (!Array.isArray(entry.evidence) || entry.evidence.some((e) => typeof e !== 'string')) issues.push('provider returned invalid candidate evidence');
    if (entry.label !== undefined && typeof entry.label !== 'string') issues.push('provider returned an invalid candidate label');
    if (entry.language !== undefined && typeof entry.language !== 'string') issues.push('provider returned an invalid candidate language');
  }
  if (!Array.isArray(value.diagnostics) || value.diagnostics.some((e) => typeof e !== 'string')) issues.push('provider returned invalid diagnostics');
  return issues;
}

function containProviderResult(result: unknown, provider: GroundingProvider, input: GroundingProviderInput): GroundingProviderResult {
  const issues = providerResultIssues(result);
  if (issues.length === 0) {
    const value = result as GroundingProviderResult;
    if (value.provider !== provider.provider || value.providerVersion !== provider.providerVersion || value.snapshotHash !== provider.snapshotHash) {
      issues.push('provider result metadata does not match its provider instance');
    }
  }
  if (issues.length) return { status: 'provider_error', provider: provider.provider, providerVersion: provider.providerVersion, snapshotHash: provider.snapshotHash, language: input.language, candidates: [], diagnostics: Object.freeze(issues) };
  const value = result as GroundingProviderResult;
  const contained = Object.freeze({
    status: value.status,
    provider: value.provider,
    providerVersion: value.providerVersion,
    snapshotHash: value.snapshotHash,
    language: value.language,
    candidates: Object.freeze(value.candidates.map((candidate) => Object.freeze({
      externalId: candidate.externalId,
      ...(candidate.label !== undefined ? { label: candidate.label } : {}),
      ...(candidate.language !== undefined ? { language: candidate.language } : {}),
      evidence: Object.freeze([...candidate.evidence]),
    }))),
    diagnostics: Object.freeze([...value.diagnostics]),
  });
  authenticatedProviderResults.add(contained);
  return contained;
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

function validInterlingualId(value: string): boolean {
  return /^i[0-9]+$/u.test(value.normalize('NFKC').trim());
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
  const invalidMappings: number[] = [];
  const lexicalEntryStarts = [...content.matchAll(/<LexicalEntry\b/gu)].length;
  const entryTag = /<LexicalEntry\b[^>]*>([\s\S]*?)<\/LexicalEntry>/gu;
  const matchedEntries = [...content.matchAll(entryTag)];
  for (const entry of matchedEntries) {
    const lemmaMatch = /<Lemma\b([^>]*)\/>/u.exec(entry[1]!);
    const lemmaAttributes = lemmaMatch ? xmlAttributes(lemmaMatch[1]!) : null;
    const writtenForm = lemmaAttributes?.get('writtenForm');
    const senses = [...entry[1]!.matchAll(/<Sense\b([^>]*)\/>/gu)];
    if (!writtenForm || senses.length === 0) { malformedEntries += 1; continue; }
    for (const sense of senses) {
      const synset = xmlAttributes(sense[1]!).get('synset');
      const mapped = synset ? synsets.get(synset) : undefined;
      if (!mapped) { if (synset) unmapped.add(synset); continue; }
      if (!validInterlingualId(mapped.ili)) { invalidMappings.push(records.length + 1); continue; }
      records.push({ language: options.language, lemma: decodeXml(writtenForm), interlingualId: mapped.ili, ...(mapped.partOfSpeech ? { partOfSpeech: mapped.partOfSpeech } : {}), ...(options.source ? { source: options.source } : {}), ...(options.license ? { license: options.license } : {}) });
    }
  }
  malformedEntries += Math.max(0, lexicalEntryStarts - matchedEntries.length);
  return { records, unmappedSynsets: [...unmapped].sort((a, b) => a.localeCompare(b, 'en')), malformedEntries, invalidMappings };
}

/** Import the documented OMW tab format without guessing unmapped synsets. */
export function importOmwTab(content: string, options: OmwTabImportOptions): OmwTabImportResult {
  const records: OmwLexicalRecord[] = [];
  const unmapped = new Set<string>();
  const malformedLines: number[] = [];
  const invalidMappings: number[] = [];
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
      if (!synset || !lemma || (lemmaType !== 'lemma' && !/^[a-z]{3}:lemma$/u.test(lemmaType!))) {
        malformedLines.push(lineNumber);
        continue;
      }
    } else if (fields.length >= 4 && options.format !== 'wordnet-bahasa' && /(?:^|:)def$/u.test(fields[1]!)) {
      continue;
    } else if (fields.length === 4 && options.format === 'wordnet-bahasa') {
      const [bahasaSynset, languageCode, , bahasaLemma] = fields;
      if (options.languageColumnValue && languageCode !== options.languageColumnValue) continue;
      if (!bahasaSynset || !bahasaLemma) { malformedLines.push(lineNumber); continue; }
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
    if (!validInterlingualId(interlingualId)) { invalidMappings.push(lineNumber); continue; }
    const posCode = (lemmaType === 'lemma' || /^[a-z]{3}:lemma$/u.test(lemmaType!.toLowerCase())) ? synset!.split('-')[1] : lemmaType!.toLowerCase();
    const partOfSpeech = ({ n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' } as const)[posCode as 'n' | 'v' | 'a' | 's' | 'r'];
    if (!partOfSpeech || !lemma) { malformedLines.push(lineNumber); continue; }
    records.push({ language: options.language, lemma: lemma.replace(/_/gu, ' '), interlingualId, partOfSpeech, ...(options.source ? { source: options.source } : {}), ...(options.license ? { license: options.license } : {}) });
  }
  return { records, unmappedSynsets: [...unmapped].sort((a, b) => a.localeCompare(b, 'en')), malformedLines, invalidMappings };
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
  const index = new Map<string, OmwLexicalRecord[]>();
  for (const record of records) {
    const key = `${record.language}\u0000${record.lemma}\u0000${record.partOfSpeech ?? 'other'}`;
    const values = index.get(key) ?? [];
    values.push(record);
    index.set(key, values);
  }
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
      const matches = index.get(`${language}\u0000${lemma}\u0000${input.partOfSpeech}`) ?? [];
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

/**
 * Add morphology as conservative candidate generation around an exact
 * provider. A surface form is exact only when every surviving analyzer/base
 * path yields one unique external identity; ambiguity and analyzer failure
 * remain visible and fail closed.
 */
export function createMorphologyAugmentedProvider(options: MorphologyProviderOptions): GroundingProvider {
  if (!validSnapshotHash(options.analyzer.snapshotHash)) throw new TypeError('morphology analyzer snapshotHash must be a SHA-256 hex digest');
  const provider = `morphology+${options.base.provider}`;
  const providerVersion = `${options.analyzer.analyzer}/${options.analyzer.analyzerVersion}+${options.base.providerVersion}`;
  const snapshotHash = sha256({ analyzer: options.analyzer.snapshotHash, base: options.base.snapshotHash });
  return Object.freeze({
    provider, providerVersion, snapshotHash,
    resolve(input: GroundingProviderInput): GroundingProviderResult {
      const language = input.language.normalize('NFKC').trim().toLocaleLowerCase('und');
      const canonical = canonicalizeGroundingProposal(input.proposal);
      const base = { provider, providerVersion, snapshotHash, language };
      if (!canonical.valid || !canonical.canonical) return { ...base, status: 'provider_error', candidates: [], diagnostics: ['invalid grounding proposal'] };
      let morphology: readonly MorphologyCandidate[];
      try {
        morphology = options.analyzer.analyze({ surface: canonical.canonical.head.key, language, ...(input.partOfSpeech ? { partOfSpeech: input.partOfSpeech } : {}) });
      } catch (error) {
        return { ...base, status: 'provider_error', candidates: [], diagnostics: Object.freeze([`morphology analyzer failed: ${error instanceof Error ? error.message : String(error)}`]) };
      }
      const candidates = new Map<string, GroundingProviderCandidate>();
      const diagnostics: string[] = [`analyzer:${options.analyzer.analyzer}@${options.analyzer.analyzerVersion}`, `analyzer-candidates:${morphology.length}`];
      for (const candidate of morphology) {
        if (!candidate || typeof candidate.lemma !== 'string' || !candidate.lemma.trim()) continue;
        const proposal = JSON.parse(JSON.stringify(input.proposal)) as GroundingProposal;
        proposal.head.key = candidate.lemma;
        const selectedPartOfSpeech = input.partOfSpeech ?? candidate.partOfSpeech;
        if (input.partOfSpeech && candidate.partOfSpeech && candidate.partOfSpeech !== input.partOfSpeech) continue;
        const result = options.base.resolve({ proposal, language, ...(selectedPartOfSpeech ? { partOfSpeech: selectedPartOfSpeech } : {}) });
        for (const resolved of result.candidates) {
          candidates.set(resolved.externalId, { ...resolved, evidence: Object.freeze([...resolved.evidence, `morphology:${options.analyzer.analyzer}`, ...candidate.evidence]) });
        }
      }
      const resolvedCandidates = [...candidates.values()].sort((a, b) => a.externalId.localeCompare(b.externalId, 'en'));
      if (resolvedCandidates.length === 1) return { ...base, status: 'resolved_exact', candidates: resolvedCandidates, diagnostics: Object.freeze([...diagnostics, 'one unique identity after exact lemma resolution']) };
      if (resolvedCandidates.length > 1) return { ...base, status: 'ambiguous', candidates: resolvedCandidates, diagnostics: Object.freeze([...diagnostics, 'multiple identities survive morphology and exact lookup']) };
      return { ...base, status: 'unresolved', candidates: [], diagnostics: Object.freeze([...diagnostics, 'no identity survives morphology and exact lookup']) };
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
      let rawCandidates: readonly GroundingProviderCandidate[];
      try {
        rawCandidates = options.resolveExact(input);
      } catch (error) {
        return {
          provider: options.provider,
          providerVersion: options.providerVersion,
          snapshotHash: options.snapshotHash,
          language: input.language,
          status: 'provider_error',
          candidates: [],
          diagnostics: [`stable-ID resolver failed: ${error instanceof Error ? error.message : String(error)}`],
        };
      }
      if (!Array.isArray(rawCandidates) || rawCandidates.some((candidate) => !candidate || typeof candidate.externalId !== 'string' || !/^\S+$/u.test(candidate.externalId))) {
        return {
          provider: options.provider,
          providerVersion: options.providerVersion,
          snapshotHash: options.snapshotHash,
          language: input.language,
          status: 'provider_error',
          candidates: [],
          diagnostics: ['stable-ID resolver returned an invalid external ID'],
        };
      }
      const candidates = [...rawCandidates].sort((a, b) => a.externalId.localeCompare(b.externalId, 'en'));
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
  if (!result || typeof result !== 'object' || !authenticatedProviderResults.has(result)) {
    return { path, status: 'invalid', groundingFingerprint: canonical.canonical.groundingFingerprint, issues: ['provider result was not authenticated by the grounding cascade'] };
  }
  if (result.status !== 'resolved_exact' || result.candidates.length !== 1) {
    return {
      path,
      status: result.status === 'ambiguous' ? 'ambiguous' : result.status === 'provider_error' ? 'invalid' : 'unresolved',
      groundingFingerprint: canonical.canonical.groundingFingerprint,
      registry: { registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash },
      issues: [...result.diagnostics],
    };
  }
  const externalId = result.candidates[0]!.externalId;
  if (!/^[a-z][a-z0-9.-]*$/u.test(result.provider) || !/^\S+$/u.test(externalId)) {
    return { path, status: 'invalid', registry: { registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash }, issues: ['provider or external ID is not safe for a canonical namespace'] };
  }
  const resolution: GroundingResolution = Object.freeze({
    path,
    status: 'resolved',
    canonicalId: `urn:${result.provider}:${externalId}`,
    groundingFingerprint: canonical.canonical.groundingFingerprint,
    registry: Object.freeze({ registryId: result.provider, version: result.providerVersion, snapshotHash: result.snapshotHash }),
    issues: Object.freeze([]),
  });
  authenticatedGroundingResolutions.add(resolution);
  return resolution;
}

/** Resolve conservatively: the first exact result wins only if no provider disagrees. */
export function resolveGroundingCascade(input: GroundingProviderInput, providers: readonly GroundingProvider[]): GroundingCascadeResult {
  const results: GroundingProviderResult[] = [];
  for (const provider of providers) {
    let rawResult: unknown;
    try { rawResult = provider.resolve(input); } catch (error) {
      rawResult = { status: 'provider_error', provider: provider.provider, providerVersion: provider.providerVersion, snapshotHash: provider.snapshotHash, language: input.language, candidates: [], diagnostics: [`provider threw: ${error instanceof Error ? error.message : String(error)}`] };
    }
    const result = containProviderResult(rawResult, provider, input);
    results.push(result);
    if (result.status === 'ambiguous') return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
    if (result.status !== 'resolved_exact' || result.candidates.length !== 1) continue;
    const candidate = result.candidates[0]!;
    const later = providers.slice(providers.indexOf(provider) + 1);
    for (const other of later) {
      let rawComparison: unknown;
      try { rawComparison = other.resolve(input); } catch (error) {
        rawComparison = { status: 'provider_error', provider: other.provider, providerVersion: other.providerVersion, snapshotHash: other.snapshotHash, language: input.language, candidates: [], diagnostics: [`provider threw: ${error instanceof Error ? error.message : String(error)}`] };
      }
      const comparison = containProviderResult(rawComparison, other, input);
      results.push(comparison);
      if (comparison.status === 'ambiguous') return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
      if (comparison.status === 'resolved_exact' && comparison.candidates.length === 1) {
        const namespace = (provider: string, externalId: string): string => externalId.includes(':') ? externalId.slice(0, externalId.indexOf(':')) : provider;
        const agrees = namespace(comparison.provider, comparison.candidates[0]!.externalId) === namespace(result.provider, candidate.externalId)
          && comparison.candidates[0]!.externalId === candidate.externalId;
        if (!agrees) return { status: 'ambiguous', attempted: results.map((item) => item.provider), results };
      }
    }
    return { status: 'resolved_exact', provider: result.provider, candidate, attempted: results.map((item) => item.provider), results };
  }
  return { status: results.some((result) => result.status === 'provider_error') ? 'provider_error' : 'unresolved', attempted: results.map((item) => item.provider), results };
}
