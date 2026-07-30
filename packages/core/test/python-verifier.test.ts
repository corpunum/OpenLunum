import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

test('python independent verifier validates canonical bytes and fingerprints', async () => {
  const verifierPath = resolve(process.cwd(), '..', '..', 'scripts', 'independent-verifier.py');

  // Run the Python verifier as subprocess
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve_promise) => {
    const proc = spawn('python3', [verifierPath], {
      cwd: resolve(process.cwd(), '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve_promise({ code: code ?? 1, stdout, stderr });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve_promise({ code: 1, stdout, stderr: 'timeout' });
    }, 30000);
  });

  // Verify exit code is 0 (success)
  assert.equal(
    result.code,
    0,
    `Python verifier exited with code ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );

  // Verify all vectors passed
  assert.match(result.stdout, /All \d+ vectors passed/, `Expected 'All N vectors passed' in output\nstdout: ${result.stdout}`);
});
