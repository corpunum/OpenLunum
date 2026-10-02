// No provider calls. Actual type weakening only in an isolated generated copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = fs.mkdtempSync(path.join(root, '.git/dataset-outcome-type-mutation-'));
const evalRoot = path.join(root, 'packages/eval');
for (const tree of ['src', 'test']) fs.cpSync(path.join(evalRoot, tree), path.join(directory, tree), { recursive: true });
fs.copyFileSync(path.join(evalRoot, 'package.json'), path.join(directory, 'package.json'));
fs.symlinkSync(path.join(evalRoot, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify({
  extends: path.join(root, 'tsconfig.base.json'),
  compilerOptions: { rootDir: '.', noEmit: true },
  include: ['src/**/*.ts', 'test/**/*.ts'],
}));
const run = () => {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(directory, 'tsconfig.json')],
    { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  return { exit: result.status, error: result.error?.message ?? null, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
const clean = run();
if (clean.exit !== 0) throw Error(`unmutated_type_fixture_failed:${clean.output}`);
const source = path.join(directory, 'src/types.ts');
const original = fs.readFileSync(source, 'utf8');
const from = "{ expectedOutcome?: 'parse'; goldSem: LunumSem }";
if (original.split(from).length !== 2) throw Error('type_mutation_site_missing_or_ambiguous');
fs.writeFileSync(source, original.replace(from, "{ expectedOutcome?: 'parse'; goldSem: LunumSem | null }"));
const weakened = run();
const detectedNegativeAssignments = weakened.output.split('\n').filter(line =>
  /dataset-item-contract\.test\.ts\(\d+,\d+\): error TS2578: Unused '@ts-expect-error' directive/u.test(line));
const caught = weakened.exit === 1 && !weakened.error && detectedNegativeAssignments.length === 2
  && !/Cannot find module|SyntaxError|ENOENT/u.test(weakened.output);
for (const [name, result] of [['unmutated', clean], ['weakened', weakened]]) {
  fs.writeFileSync(path.join(directory, `${name}.log`), result.output, { flag: 'wx' });
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const report = {
  format: 'openlunum-dataset-outcome-type-mutation/1',
  codeCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
  workingTreeClean: spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim() === '',
  providerCalls: 0,
  typescriptVersion: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/typescript/package.json'), 'utf8')).version,
  evidence: 'Compile-time regression sensitivity only, not model/source correctness.',
  sourceSha256: hash(original),
  testSha256: hash(fs.readFileSync(path.join(directory, 'test/dataset-item-contract.test.ts'))),
  unmutatedExit: clean.exit,
  weakenedExit: weakened.exit,
  negativeAssignmentsCaught: detectedNegativeAssignments.length,
  unmutatedLogSha256: hash(clean.output),
  weakenedLogSha256: hash(weakened.output),
  caught,
};
fs.writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...report, localArtifacts: path.relative(root, directory) }, null, 2));
if (!caught) process.exitCode = 1;
