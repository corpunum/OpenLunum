#!/usr/bin/env node
// Launch the Lunum MCP server from a checkout. `dist/` is gitignored, so a
// fresh clone has nothing to run, and a pulled checkout may hold a stale build
// that advertises outdated tool schemas. Install if needed, rebuild core+mcp
// (a few seconds), then hand stdio to the server.
//
// stdout is the MCP channel: every build/install message must go to stderr.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toStderr = { cwd: root, stdio: ['ignore', process.stderr, process.stderr] };

function run(cmd, args) {
  const result = spawnSync(cmd, args, toStderr);
  if (result.status !== 0) {
    console.error(`lunum-mcp-launch: \`${cmd} ${args.join(' ')}\` failed (${result.error?.message ?? `exit ${result.status}`}).`);
    process.exit(1);
  }
}

if (!existsSync(path.join(root, 'node_modules'))) run('pnpm', ['install', '--frozen-lockfile']);
if (process.env.LUNUM_MCP_SKIP_BUILD !== '1') run('pnpm', ['--silent', '--filter', '@corpunum/lunum-mcp...', 'build']);

await import(pathToFileURL(path.join(root, 'packages/mcp/dist/bin/lunum-mcp.js')).href);
