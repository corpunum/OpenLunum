#!/usr/bin/env node
// Builds a single markdown bundle for a reviewer that cannot read the repository.
//   node experiments/cross-vendor-review-v1/build-bundle.mjs [--small] > /tmp/bundle.md
// --small (for models with ~64k-token context): no ADRs except 0024/0025, results only, four core files.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = [
  'VISION.md', 'README.md', 'STATUS.md', 'AGENTS.md', 'docs/REPOSITORY_OPERATING_MODEL.md',
  ...fs.readdirSync(path.join(root, 'decisions')).filter((f) => f.endsWith('.md')).sort().map((f) => `decisions/${f}`),
  'reports/diagnostic/2026-09-26/EVALUATION.md',
  'reports/independent-evaluation/2026-09-26/REPORT.md',
  'reports/independent-evaluation/2026-09-26-round2/REPORT.md',
  'reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md',
  'reports/independent-evaluation/2026-10-16-fable-review/REPORT.md',
  'reports/diagnostic/2026-10-16/core-module-audit/README.md',
  ...['discourse-unit-identity-v1', 'ambient-discourse-v1', 'ambient-discourse-v2', 'compacted-context-graded-qa-v1', 'source-locator-v1', 'greek-fold-recall-v1', 'general-frames-v1', 'frame-gaps-v1', 'inclusive-bound-v1', 'contract-0.16-live-check-v1']
    .flatMap((e) => ['PREREGISTRATION.md', 'RESULTS.md'].map((f) => `experiments/${e}/${f}`)),
  ...['types', 'fingerprint', 'canonicalize', 'agent-native', 'agent-builder', 'frame-registry', 'semantic-registry', 'literal-retention', 'source-bound', 'context'].map((m) => `packages/core/src/${m}.ts`),
].filter((f) => fs.existsSync(path.join(root, f)))
  .filter((f) => !process.argv.includes('--small') || !(
    (f.startsWith('decisions/') && !/00(24|25)-/u.test(f))
    || f.endsWith('PREREGISTRATION.md') || f === 'docs/REPOSITORY_OPERATING_MODEL.md' || f === 'reports/independent-evaluation/2026-09-26/REPORT.md'
    || (f.startsWith('packages/') && !/(fingerprint|agent-native|literal-retention|source-bound)\.ts$/u.test(f))));
const fence = (f) => (f.endsWith('.md') ? '' : f.endsWith('.json') ? 'json' : 'ts');
let out = `# OpenLunum review bundle\n\nRepository: https://github.com/corpunum/OpenLunum at commit \`${commit}\`. ${files.length} files, verbatim.\n\n`;
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  out += `\n\n---\n\n## FILE: ${f}\n\n${fence(f) ? `\`\`\`${fence(f)}\n${text}\n\`\`\`` : text}\n`;
}
// The full meaning report is ~200 KB; include a compact per-item view of both runs instead.
const report = JSON.parse(fs.readFileSync(path.join(root, 'reports/independent-evaluation/2026-10-07-round2-v17-live/scoring/meaning-report.json'), 'utf8'));
const compact = Object.fromEntries(['original', 'v17'].map((run) => [run, { overall: { outcomeCorrect: report[run].overall.outcomeCorrect, reviewed: report[run].overall.reviewed, matchesOrAbstentions: report[run].overall.reviewedMatchesOrDeclaredAbstentions, unresolved: report[run].overall.unresolved },
  items: report[run].items.map((i) => ({ id: i.probeId, source: i.sourceText, expected: i.expectedOutcome, observed: i.observed, meaning: i.meaningStatus, failures: i.failureClasses, candidateSem: i.candidateSem })) }]));
out += `\n\n---\n\n## FILE (derived, compact): reports/independent-evaluation/2026-10-07-round2-v17-live/scoring/meaning-report.json\n\n\`\`\`json\n${JSON.stringify(compact)}\n\`\`\`\n`;
process.stdout.write(out);
