import { execFile as execFileCb } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { compileContext, deriveLunumSidecar } from '../../packages/core/src/index.mjs';

const execFile = promisify(execFileCb);

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const runsDir = resolve(repoRoot, 'eval', 'runs');
const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const model = process.env.OPENLUNUM_LOCAL_MODEL || 'qwen2.5-coder:1.5b';

const cases = [
  {
    id: 'pi_task_context',
    label: 'task_context',
    role: 'agent',
    content: 'The agent is writing a TypeScript function to parse JSON arrays from user input.',
    category: 'task_context',
    risk: 'low',
    confidence: 1,
    question: 'Is the agent writing a function to parse JSON arrays? Reply only YES or NO.',
    expected: 'YES',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'task_context',
      clauses: [
        {
          predicate: 'write',
          roles: {
            agent: { type: 'actor', id: 'agent' },
            target: { type: 'concept', id: 'json_parser_function' }
          },
          negated: false,
          annotations: { language: 'TypeScript' }
        }
      ]
    }
  },
  {
    id: 'pi_sandbox_constraint',
    label: 'sandbox_constraint',
    role: 'system',
    content: 'The agent runs in a sandboxed environment and must not access the host filesystem outside /tmp.',
    category: 'safety_constraint',
    risk: 'high',
    confidence: 1,
    question: 'Can the agent access files outside /tmp? Reply only YES or NO.',
    expected: 'NO',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'safety_constraint',
      clauses: [
        {
          predicate: 'access',
          roles: {
            agent: { type: 'actor', id: 'agent' },
            target: { type: 'concept', id: 'host_filesystem' }
          },
          negated: true,
          modality: 'must',
          annotations: { exception: '/tmp' }
        }
      ]
    }
  },
  {
    id: 'pi_user_extension',
    label: 'user_extension',
    role: 'user',
    content: 'The user has a custom Pi extension that logs all tool invocations to a local file.',
    category: 'preference',
    risk: 'low',
    confidence: 1,
    question: 'Does the user have an extension that logs tool invocations? Reply only YES or NO.',
    expected: 'YES',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [
        {
          predicate: 'have',
          roles: {
            experiencer: { type: 'actor', id: 'user' },
            theme: { type: 'concept', id: 'tool_log_extension' }
          },
          negated: false,
          annotations: { detail: 'logs tool invocations to local file' }
        }
      ]
    }
  },
  {
    id: 'pi_memory_retention',
    label: 'memory_retention',
    role: 'system',
    content: 'Lunum memory records should persist across sessions but not beyond the user workspace directory.',
    category: 'policy',
    risk: 'medium',
    confidence: 0.9,
    question: 'Do Lunum records persist across sessions? Reply only YES or NO.',
    expected: 'YES',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'policy',
      clauses: [
        {
          predicate: 'persist',
          roles: {
            subject: { type: 'concept', id: 'lunum_records' },
            target: { type: 'concept', id: 'cross_session' }
          },
          negated: false,
          modality: 'should'
        },
        {
          predicate: 'persist',
          roles: {
            subject: { type: 'concept', id: 'lunum_records' },
            target: { type: 'concept', id: 'beyond_workspace' }
          },
          negated: true,
          modality: 'must'
        }
      ]
    }
  },
  {
    id: 'pi_concurrent_tools',
    label: 'concurrent_tools',
    role: 'agent',
    content: 'The agent executed two read_file tools in parallel on unrelated files.',
    category: 'tool_event',
    risk: 'low',
    confidence: 1,
    question: 'Did the agent run file reads concurrently? Reply only YES or NO.',
    expected: 'YES',
    sem: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'tool_event',
      clauses: [
        {
          predicate: 'execute',
          roles: {
            agent: { type: 'actor', id: 'agent' },
            target: { type: 'concept', id: 'read_file' }
          },
          negated: false,
          annotations: { concurrency: 'parallel', count: 2 }
        }
      ]
    }
  }
];

function normalizeAnswer(text) {
  const upper = String(text || '').trim().toUpperCase();
  const match = upper.match(/\b(YES|NO)\b/);
  return match ? match[1] : upper.split(/\s+/)[0] || '';
}

function selectedTokensForMode(compiled, mode) {
  if (mode === 'natural' || mode === 'shadow_mixed') return compiled.naturalTokens;
  if (mode === 'lunum') return compiled.lunumTokens;
  return compiled.mixedTokens;
}

async function runOllamaChat(messages) {
  const response = await fetch(new URL('/api/chat', host), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0, num_predict: 16 },
      messages
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`ollama chat failed (${response.status}): ${bodyText}`);
  }
  return JSON.parse(bodyText);
}

async function getOllamaCliVersion() {
  const { stdout } = await execFile('ollama', ['--version']);
  return stdout.trim();
}

const runtime = {
  node: process.version,
  ollama: await getOllamaCliVersion(),
  host,
  model
};

const results = [];
for (const testCase of cases) {
  const sidecar = deriveLunumSidecar({
    role: testCase.role,
    content: testCase.content,
    sem: testCase.sem,
    category: testCase.category,
    risk: testCase.risk,
    confidence: testCase.confidence
  });

  const message = {
    role: testCase.role,
    content: testCase.content,
    lunumCode: sidecar.lunumCode,
    lunumMeta: sidecar.lunumMeta
  };

  for (const mode of ['natural', 'mixed', 'lunum']) {
    const compiled = compileContext([message], { mode });
    const contextMessages = compiled.selectedMessages.map((row) => ({ role: row.role, content: row.content }));
    const chatMessages = [
      { role: 'system', content: 'Answer only with YES or NO. Do not explain.' },
      ...contextMessages,
      { role: 'user', content: testCase.question }
    ];

    try {
      const raw = await runOllamaChat(chatMessages);
      const actual = normalizeAnswer(raw?.message?.content ?? '');
      results.push({
        caseId: testCase.id,
        caseLabel: testCase.label,
        mode,
        expected: testCase.expected,
        actual,
        pass: actual === testCase.expected,
        rawResponse: raw?.message?.content ?? '',
        promptEvalCount: raw?.prompt_eval_count ?? null,
        evalCount: raw?.eval_count ?? null,
        selectedTokens: selectedTokensForMode(compiled, mode),
        naturalTokens: compiled.naturalTokens,
        lunumTokens: compiled.lunumTokens,
        mixedTokens: compiled.mixedTokens,
        selectedRatio: compiled.naturalTokens ? selectedTokensForMode(compiled, mode) / compiled.naturalTokens : 1,
        eligible: sidecar.lunumMeta?.eligible === true,
        error: null
      });
    } catch (error) {
      results.push({
        caseId: testCase.id,
        caseLabel: testCase.label,
        mode,
        expected: testCase.expected,
        actual: null,
        pass: false,
        rawResponse: null,
        promptEvalCount: null,
        evalCount: null,
        selectedTokens: selectedTokensForMode(compiled, mode),
        naturalTokens: compiled.naturalTokens,
        lunumTokens: compiled.lunumTokens,
        mixedTokens: compiled.mixedTokens,
        selectedRatio: compiled.naturalTokens ? selectedTokensForMode(compiled, mode) / compiled.naturalTokens : 1,
        eligible: sidecar.lunumMeta?.eligible === true,
        error: String(error?.message ?? error)
      });
    }
  }
}

const summary = results.reduce((acc, row) => {
  acc.total += 1;
  if (row.pass) acc.passed += 1;
  else acc.failed += 1;
  if (row.error) acc.errors += 1;
  return acc;
}, { total: 0, passed: 0, failed: 0, errors: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  workArea: 'integrations/pi',
  model: runtime.model,
  runtime,
  summary,
  cases,
  results
};

await mkdir(runsDir, { recursive: true });
const jsonPath = resolve(runsDir, '2026-07-15-pi-local-model.json');
const mdPath = resolve(runsDir, '2026-07-15-pi-local-model.md');
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = `# Pi integration local-model experiment

Bounded local-model smoke test for the \`integrations/pi\` work area.

Model: \`${runtime.model}\`

Runtime:

- Node: \`${runtime.node}\`
- Ollama: \`${runtime.ollama}\`
- Host: \`${runtime.host}\`

Summary:

- Total runs: ${summary.total}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Transport/model errors: ${summary.errors}

The raw report is preserved at [\`2026-07-15-pi-local-model.json\`](./2026-07-15-pi-local-model.json).

| case | mode | expected | actual | pass | selected tokens | prompt eval | eval | error |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
${results.map((row) => `| ${[
  row.caseId,
  row.mode,
  row.expected,
  row.actual ?? '',
  row.pass ? 'yes' : 'no',
  row.selectedTokens,
  row.promptEvalCount ?? '',
  row.evalCount ?? '',
  row.error ?? ''
].map((value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')}

Notes:

- \`natural\` uses the original message text.
- \`mixed\` uses the current eligibility gate.
- \`lunum\` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the Pi adoption profile (Design status) with Pi-specific test scenarios.
`;

await writeFile(mdPath, `${md}\n`);

console.log(JSON.stringify(report, null, 2));
