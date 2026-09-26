#!/usr/bin/env node
// Evidence tests resolve historical commits (baselines, prompt-fix ancestry).
// Cloud sessions and CI caches often start from a shallow clone, where those
// lookups fail for reasons unrelated to the code under test. Unshallow first.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

let shallow;
try {
  shallow = git('rev-parse', '--is-shallow-repository') === 'true';
} catch {
  console.error('ensure-git-history: not a git checkout; evidence tests need repository history.');
  process.exit(1);
}
if (!shallow) process.exit(0);

console.error('ensure-git-history: shallow clone detected; fetching full history...');
try {
  git('fetch', '--unshallow', '--quiet', 'origin');
} catch {
  console.error('ensure-git-history: `git fetch --unshallow origin` failed. Fetch full history, then re-run.');
  process.exit(1);
}
