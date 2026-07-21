import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRoundTripRetentionExperiment } from '../packages/eval/dist/src/round-trip-retention.js';
import { loadDataset, readJson } from '../packages/eval/dist/src/io.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const datasetPath = path.join(root, 'datasets/dev/multilingual-core-v1.jsonl');
  const dataset = await loadDataset(datasetPath);

  const profileCoder = await readJson(path.join(root, 'profiles/models/qwen3-coder-30b-live.json'));
  const profileQwen36 = await readJson(path.join(root, 'profiles/models/qwen36-35b-live.json'));

  const manifest = {
    schema: 'openlunum-experiment/0.1',
    id: 'multilingual-round-trip-retention',
    area: 'semantic-contract',
    task: 'retention',
    hypothesis: 'Multilingual parse+realize round-trip retention baselines on Qwen3 Coder and Qwen3.6',
    baselineCommit: 'fc4cd29b552de628876c1236162234032d84ad0c',
    dataset: {
      path: 'datasets/dev/multilingual-core-v1.jsonl',
      sha256: '6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873'
    },
    limits: {
      maxItems: 1,
      maxAttemptsPerItem: 1,
      maxModelCalls: 128
    },
    gates: {
      minimumFeatureRecall: 0.50,
      minimumExactRate: 0.25,
      requireProtectedLiteralCoverage: true
    },
    outputDirectory: 'reports/experiments/multilingual-retention'
  };

  console.log('Running round-trip retention experiment...');
  const { results, report } = await runRoundTripRetentionExperiment(manifest, root, dataset, [profileCoder, profileQwen36]);
  console.log('Errors:', results.filter(r => r.status === 'error').map(r => r.error));
  console.log('Report generated successfully!');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
