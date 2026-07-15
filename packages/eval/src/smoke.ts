import path from 'node:path';
import { canonicalizeSem, fingerprintSem, renderSem, validateSem } from '@corpunum/lunum';
import { findWorkspaceRoot, loadDataset, sha256File } from './io.js';

export async function runSmoke(root?: string): Promise<{ items: number; groups: number; datasetSha256: string }> {
  const resolvedRoot = root ?? await findWorkspaceRoot();
  const datasetPath = path.join(resolvedRoot, 'datasets/dev/multilingual-core-v1.jsonl');
  const items = await loadDataset(datasetPath);
  const groups = new Map<string, string>();
  for (const item of items) {
    const validation = validateSem(item.goldSem);
    if (!validation.ok) throw new Error(`${item.id}: ${validation.errors.join('; ')}`);
    const canonical = canonicalizeSem(item.goldSem);
    const fingerprint = fingerprintSem(canonical);
    if (!renderSem(canonical).code) throw new Error(`${item.id}: empty rendering`);
    if (item.semanticGroup) {
      const prior = groups.get(item.semanticGroup);
      if (prior && prior !== fingerprint) throw new Error(`${item.id}: semantic group ${item.semanticGroup} has inconsistent gold fingerprint`);
      groups.set(item.semanticGroup, fingerprint);
    }
  }
  return { items: items.length, groups: groups.size, datasetSha256: await sha256File(datasetPath) };
}
