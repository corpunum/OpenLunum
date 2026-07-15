import { execFile as execFileCb } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, basename, dirname } from 'node:path';
import { promisify } from 'node:util';
import { compileContext, deriveLunumSidecar } from '../../packages/core/src/index.mjs';

const execFile = promisify(execFileCb);

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const runsDir = resolve(repoRoot, 'eval', 'runs');

// llama.cpp server (OpenAI-compatible API)
const host = process.env.LLAMACPP_HOST || 'http://127.0.0.1:8080';
const model = process.env.OPENLUNUM_LOCAL_MODEL || 'openai/qwen3.6-35b-a3b';
const maxTokens = parseInt(process.env.OPENLUNUM_MAX_TOKENS || '256', 10);

// ── Test case definitions ────────────────────────────────────────────
// Each work area gets 5 semantic scenarios × 3 modes = 15 runs.

const integrationCases = {
  'claude-code': [
    {
      id: 'cc_tool_use',
      label: 'tool_use',
      role: 'agent',
      content: 'Claude Code invoked the read_file tool to inspect package.json configuration in a Node.js project.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did Claude Code read a file? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'read',
          roles: { agent: { type: 'actor', id: 'claude_code' }, target: { type: 'concept', id: 'package_json' } },
          negated: false,
          annotations: { tool: 'read_file' }
        }]
      }
    },
    {
      id: 'cc_permission_model',
      label: 'permission_model',
      role: 'system',
      content: 'Claude Code operates under a permission model where it must ask before making changes to files outside the current project.',
      category: 'policy',
      risk: 'medium',
      confidence: 0.95,
      question: 'Must Claude Code ask before modifying files outside the project? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'policy',
        clauses: [{
          predicate: 'must_ask',
          roles: { agent: { type: 'actor', id: 'claude_code' }, target: { type: 'concept', id: 'outside_project' } },
          negated: false,
          modality: 'must'
        }]
      }
    },
    {
      id: 'cc_terminal_capability',
      label: 'terminal_capability',
      role: 'agent',
      content: 'Claude Code has terminal access and can run npm install commands in the project root.',
      category: 'capability',
      risk: 'low',
      confidence: 1,
      question: 'Does Claude Code have terminal access? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'capability',
        clauses: [{
          predicate: 'have',
          roles: { agent: { type: 'actor', id: 'claude_code' }, target: { type: 'concept', id: 'terminal' } },
          negated: false
        }]
      }
    },
    {
      id: 'cc_context_window',
      label: 'context_window',
      role: 'system',
      content: 'Claude Code maintains a rolling context window of the most recent 200K tokens of conversation.',
      category: 'memory',
      risk: 'low',
      confidence: 0.9,
      question: 'Does Claude Code use a rolling context window? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'memory',
        clauses: [{
          predicate: 'use',
          roles: { agent: { type: 'actor', id: 'claude_code' }, target: { type: 'concept', id: 'rolling_context' } },
          negated: false,
          annotations: { size: '200K tokens' }
        }]
      }
    },
    {
      id: 'cc_self_heal',
      label: 'self_heal',
      role: 'agent',
      content: 'Claude Code detected a failed command and automatically ran npm install to fix the missing dependency before retrying.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did Claude Code self-heal by running a fix command? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'execute',
          roles: { agent: { type: 'actor', id: 'claude_code' }, target: { type: 'concept', id: 'fix_command' } },
          negated: false,
          annotations: { trigger: 'failed_command' }
        }]
      }
    }
  ],
  'codex-cli': [
    {
      id: 'ccode_codebase',
      label: 'codebase_index',
      role: 'system',
      content: 'Codex CLI indexes the entire codebase for semantic search to help the agent navigate large projects.',
      category: 'capability',
      risk: 'low',
      confidence: 0.95,
      question: 'Does Codex CLI index the codebase for search? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'capability',
        clauses: [{
          predicate: 'index',
          roles: { agent: { type: 'actor', id: 'codex_cli' }, target: { type: 'concept', id: 'codebase' } },
          negated: false
        }]
      }
    },
    {
      id: 'ccode_edit_scope',
      label: 'edit_scope',
      role: 'agent',
      content: 'Codex CLI can only edit files that are within the currently tracked git repository.',
      category: 'safety_constraint',
      risk: 'medium',
      confidence: 0.9,
      question: 'Is Codex limited to editing files inside the git repo? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'safety_constraint',
        clauses: [{
          predicate: 'limit',
          roles: { agent: { type: 'actor', id: 'codex_cli' }, target: { type: 'concept', id: 'git_repo' } },
          negated: false,
          modality: 'only'
        }]
      }
    },
    {
      id: 'ccode_diff_review',
      label: 'diff_review',
      role: 'agent',
      content: 'Codex CLI presents a diff preview to the user before applying changes to files.',
      category: 'preference',
      risk: 'low',
      confidence: 1,
      question: 'Does Codex show diffs before applying changes? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'preference',
        clauses: [{
          predicate: 'show',
          roles: { agent: { type: 'actor', id: 'codex_cli' }, target: { type: 'concept', id: 'diff_preview' } },
          negated: false
        }]
      }
    },
    {
      id: 'ccode_batch_files',
      label: 'batch_files',
      role: 'agent',
      content: 'Codex CLI edited 3 files in a single batch operation: config.yaml, main.ts, and types.ts.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did Codex CLI edit 3 files in one batch? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'edit',
          roles: { agent: { type: 'actor', id: 'codex_cli' }, target: { type: 'concept', id: 'multi_file_batch' } },
          negated: false,
          annotations: { count: 3 }
        }]
      }
    },
    {
      id: 'ccode_explain',
      label: 'explain',
      role: 'user',
      content: 'The user asked Codex CLI to explain the authentication flow in the codebase.',
      category: 'task_context',
      risk: 'low',
      confidence: 1,
      question: 'Did the user ask for an explanation of the auth flow? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'task_context',
        clauses: [{
          predicate: 'ask',
          roles: { agent: { type: 'actor', id: 'user' }, target: { type: 'concept', id: 'auth_flow_explanation' } },
          negated: false
        }]
      }
    }
  ],
  'gemini-cli': [
    {
      id: 'gcli_google_kg',
      label: 'google_knowledge',
      role: 'system',
      content: 'Gemini CLI can leverage Google Knowledge Graph data to augment its responses with real-world facts.',
      category: 'capability',
      risk: 'low',
      confidence: 0.95,
      question: 'Can Gemini CLI use Google Knowledge Graph? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'capability',
        clauses: [{
          predicate: 'use',
          roles: { agent: { type: 'actor', id: 'gemini_cli' }, target: { type: 'concept', id: 'google_knowledge' } },
          negated: false
        }]
      }
    },
    {
      id: 'gcli_project_context',
      label: 'project_context',
      role: 'agent',
      content: 'Gemini CLI loaded the .gemini directory from the user project to maintain project-specific instructions.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did Gemini CLI read project instructions from .gemini? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'read',
          roles: { agent: { type: 'actor', id: 'gemini_cli' }, target: { type: 'concept', id: 'gemini_instructions' } },
          negated: false,
          annotations: { path: '.gemini' }
        }]
      }
    },
    {
      id: 'gcli_code_search',
      label: 'code_search',
      role: 'agent',
      content: 'Gemini CLI searched across 500 TypeScript files to find where a specific API function was defined.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did Gemini CLI search across many files for an API function? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'search',
          roles: { agent: { type: 'actor', id: 'gemini_cli' }, target: { type: 'concept', id: 'api_function_def' } },
          negated: false,
          annotations: { files_scanned: 500 }
        }]
      }
    },
    {
      id: 'gcli_multimodal',
      label: 'multimodal',
      role: 'user',
      content: 'The user attached a screenshot of a bug to Gemini CLI showing a UI layout issue.',
      category: 'task_context',
      risk: 'low',
      confidence: 1,
      question: 'Did the user send a screenshot to Gemini CLI? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'task_context',
        clauses: [{
          predicate: 'send',
          roles: { agent: { type: 'actor', id: 'user' }, target: { type: 'concept', id: 'bug_screenshot' } },
          negated: false,
          annotations: { modality: 'image' }
        }]
      }
    },
    {
      id: 'gcli_gcloud',
      label: 'gcloud_integration',
      role: 'agent',
      content: 'Gemini CLI ran gcloud deploy to push a new version of the app to Google Cloud Run.',
      category: 'tool_event',
      risk: 'medium',
      confidence: 1,
      question: 'Did Gemini CLI deploy to Google Cloud? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'deploy',
          roles: { agent: { type: 'actor', id: 'gemini_cli' }, target: { type: 'concept', id: 'google_cloud_run' } },
          negated: false,
          annotations: { tool: 'gcloud' }
        }]
      }
    }
  ],
  'openclaw': [
    {
      id: 'oc_plugin_arch',
      label: 'plugin_architecture',
      role: 'system',
      content: 'OpenClaw uses a plugin-based architecture where each capability is loaded as an independent npm package.',
      category: 'architecture',
      risk: 'low',
      confidence: 0.95,
      question: 'Does OpenClaw use plugins for capabilities? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'architecture',
        clauses: [{
          predicate: 'use',
          roles: { agent: { type: 'actor', id: 'openclaw' }, target: { type: 'concept', id: 'plugin_packages' } },
          negated: false
        }]
      }
    },
    {
      id: 'oc_config_schema',
      label: 'config_schema',
      role: 'system',
      content: 'OpenClaw validates all user configurations against a JSON Schema before loading any plugins.',
      category: 'safety_constraint',
      risk: 'medium',
      confidence: 0.9,
      question: 'Does OpenClaw validate config against JSON Schema? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'safety_constraint',
        clauses: [{
          predicate: 'validate',
          roles: { agent: { type: 'actor', id: 'openclaw' }, target: { type: 'concept', id: 'config_schema' } },
          negated: false,
          modality: 'always'
        }]
      }
    },
    {
      id: 'oc_event_bus',
      label: 'event_bus',
      role: 'agent',
      content: 'OpenClaw dispatched a file_change event through its internal event bus when the user saved a config file.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did OpenClaw dispatch an event when a file changed? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'dispatch',
          roles: { agent: { type: 'actor', id: 'openclaw' }, target: { type: 'concept', id: 'file_change_event' } },
          negated: false
        }]
      }
    },
    {
      id: 'oc_sandbox',
      label: 'sandbox_isolation',
      role: 'system',
      content: 'OpenClaw runs plugins in isolated child processes with configurable resource limits (CPU, memory, network).',
      category: 'safety_constraint',
      risk: 'high',
      confidence: 0.95,
      question: 'Does OpenClaw sandbox plugins in isolated processes? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'safety_constraint',
        clauses: [{
          predicate: 'sandbox',
          roles: { agent: { type: 'actor', id: 'openclaw' }, target: { type: 'concept', id: 'child_process' } },
          negated: false,
          annotations: { resource_limits: true }
        }]
      }
    },
    {
      id: 'oc_hot_reload',
      label: 'hot_reload',
      role: 'agent',
      content: 'OpenClaw automatically reloaded the auth plugin after detecting a version change in its npm package.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did OpenClaw hot-reload a plugin after a version change? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'reload',
          roles: { agent: { type: 'actor', id: 'openclaw' }, target: { type: 'concept', id: 'auth_plugin' } },
          negated: false,
          annotations: { trigger: 'version_change' }
        }]
      }
    }
  ],
  'opencode': [
    {
      id: 'ocd_project_mode',
      label: 'project_mode',
      role: 'system',
      content: 'OpenCode operates in project mode where it reads .opencode/config for per-project settings.',
      category: 'architecture',
      risk: 'low',
      confidence: 0.95,
      question: 'Does OpenCode read per-project configuration? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'architecture',
        clauses: [{
          predicate: 'read',
          roles: { agent: { type: 'actor', id: 'opencode' }, target: { type: 'concept', id: 'project_config' } },
          negated: false,
          annotations: { path: '.opencode/config' }
        }]
      }
    },
    {
      id: 'ocd_shell_integration',
      label: 'shell_integration',
      role: 'agent',
      content: 'OpenCode integrated with the terminal shell to run make build and capture the output inline.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did OpenCode run a build command in the terminal? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'run',
          roles: { agent: { type: 'actor', id: 'opencode' }, target: { type: 'concept', id: 'build_command' } },
          negated: false,
          annotations: { command: 'make build' }
        }]
      }
    },
    {
      id: 'ocd_web_fetch',
      label: 'web_fetch',
      role: 'agent',
      content: 'OpenCode fetched documentation from the React official website to help answer a user question about hooks.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did OpenCode fetch web documentation? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'fetch',
          roles: { agent: { type: 'actor', id: 'opencode' }, target: { type: 'concept', id: 'react_docs' } },
          negated: false,
          annotations: { url: 'react.dev' }
        }]
      }
    },
    {
      id: 'ocd_edit_suggestions',
      label: 'edit_suggestions',
      role: 'agent',
      content: 'OpenCode suggested 3 edits to fix TypeScript errors in the user codebase.',
      category: 'tool_event',
      risk: 'low',
      confidence: 1,
      question: 'Did OpenCode suggest edits to fix TypeScript errors? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'tool_event',
        clauses: [{
          predicate: 'suggest',
          roles: { agent: { type: 'actor', id: 'opencode' }, target: { type: 'concept', id: 'typescript_fixes' } },
          negated: false,
          annotations: { count: 3 }
        }]
      }
    },
    {
      id: 'ocd_session_save',
      label: 'session_save',
      role: 'system',
      content: 'OpenCode saves conversation history to a local SQLite database for session persistence.',
      category: 'memory',
      risk: 'low',
      confidence: 0.9,
      question: 'Does OpenCode save conversations locally for persistence? Reply only YES or NO.',
      expected: 'YES',
      sem: {
        schema: 'lunum-sem/0.1-draft',
        world: 'tool',
        kind: 'memory',
        clauses: [{
          predicate: 'save',
          roles: { agent: { type: 'actor', id: 'opencode' }, target: { type: 'concept', id: 'conversation_history' } },
          negated: false,
          annotations: { storage: 'SQLite' }
        }]
      }
    }
  ]
};

// ── Helper: normalize answer ─────────────────────────────────────────
function normalizeAnswer(text) {
  const upper = String(text || '').trim().toUpperCase();
  const match = upper.match(/\b(YES|NO)\b/);
  return match ? match[1] : upper.split(/\s+/)[0] || '';
}

// ── Helper: map roles for llama.cpp server (supports system/user only) ──
const ROLE_MAP = { agent: 'user', assistant: 'assistant', user: 'user', system: 'system' };
function mapRole(role) {
  // Some llama.cpp Jinja templates only support system + user
  if (role === 'agent') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'user' || role === 'system') return role;
  return 'user';
}

// ── Helper: llama.cpp chat (OpenAI-compatible API) ───────────────────
async function runLlamaCppChat(messages) {
  const mapped = messages.map((m) => ({ role: mapRole(m.role), content: m.content }));
  const response = await fetch(new URL('/v1/chat/completions', host), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: mapped,
      temperature: 0,
      max_tokens: maxTokens,
      stream: false
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`llama.cpp chat failed (${response.status}): ${bodyText}`);
  }
  const data = JSON.parse(bodyText);
  const msg = data?.choices?.[0]?.message ?? null;
  // MTP models put final answer in reasoning_content; use content if available, else reasoning
  return {
    content: msg?.content || msg?.reasoning_content || '',
    reasoning_content: msg?.reasoning_content || ''
  };
}

// ── Helper: get model alias for report ───────────────────────────────
async function getModelAlias() {
  try {
    const resp = await fetch(new URL('/v1/models', host));
    const data = await resp.json();
    const m = data?.data?.find(m => m.id === model);
    return m ? m.id : model;
  } catch {
    return model;
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function run() {
  const workArea = process.argv[2] || 'pi';
  const cases = integrationCases[workArea];

  if (!cases) {
    console.error(`Unknown work area: ${workArea}. Available: ${Object.keys(integrationCases).join(', ')}`);
    process.exit(1);
  }

  const modelAlias = await getModelAlias();
  const runtime = {
    node: process.version,
    host,
    model: modelAlias,
    api: 'llama.cpp OpenAI-compatible'
  };

  console.error(`\n=== Experiment: ${workArea} ===`);
  console.error(`Model: ${modelAlias}`);
  console.error(`Runs: ${cases.length * 3}\n`);

  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
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

    for (let j = 0; j < 3; j++) {
      const mode = ['natural', 'mixed', 'lunum'][j];
      const compiled = compileContext([message], { mode });

      const contextMessages = compiled.selectedMessages.map((row) => ({
        role: row.role,
        content: row.content
      }));

      const chatMessages = [
        { role: 'system', content: 'Answer only with YES or NO. Do not explain.' },
        ...contextMessages,
        { role: 'user', content: testCase.question }
      ];

      try {
        const raw = await runLlamaCppChat(chatMessages);
        const actual = normalizeAnswer(raw?.content ?? '');
        results.push({
          caseId: testCase.id,
          caseLabel: testCase.label,
          mode,
          expected: testCase.expected,
          actual,
          pass: actual === testCase.expected,
          rawResponse: raw?.content ?? '',
          promptEvalCount: null,
          evalCount: null,
          selectedTokens: compiled[mode === 'natural' ? 'naturalTokens' : mode === 'mixed' ? 'mixedTokens' : 'lunumTokens'],
          naturalTokens: compiled.naturalTokens,
          lunumTokens: compiled.lunumTokens,
          mixedTokens: compiled.mixedTokens,
          selectedRatio: compiled.naturalTokens
            ? (compiled[mode === 'natural' ? 'naturalTokens' : mode === 'mixed' ? 'mixedTokens' : 'lunumTokens'] / compiled.naturalTokens)
            : 1,
          eligible: sidecar.lunumMeta?.eligible === true,
          error: null
        });
        console.log(`  ✓ ${testCase.id} / ${mode}: ${actual} (expected ${testCase.expected}) ${actual === testCase.expected ? '✅' : '❌'}`);
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
          selectedTokens: compiled[mode === 'natural' ? 'naturalTokens' : mode === 'mixed' ? 'mixedTokens' : 'lunumTokens'],
          naturalTokens: compiled.naturalTokens,
          lunumTokens: compiled.lunumTokens,
          mixedTokens: compiled.mixedTokens,
          selectedRatio: compiled.naturalTokens
            ? (compiled[mode === 'natural' ? 'naturalTokens' : mode === 'mixed' ? 'mixedTokens' : 'lunumTokens'] / compiled.naturalTokens)
            : 1,
          eligible: sidecar.lunumMeta?.eligible === true,
          error: String(error?.message ?? error)
        });
        console.log(`  ✗ ${testCase.id} / ${mode}: ERROR — ${error.message}`);
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
    workArea,
    model: runtime.model,
    runtime,
    summary,
    cases,
    results
  };

  const date = new Date().toISOString().slice(0, 10);
  const slug = workArea.replace(/[^a-z0-9]/g, '-');
  await mkdir(runsDir, { recursive: true });
  const jsonPath = resolve(runsDir, `${date}-${slug}-local-model.json`);
  const mdPath = resolve(runsDir, `${date}-${slug}-local-model.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const md = `# ${workArea} integration local-model experiment

Bounded local-model smoke test for the \`integrations/${workArea}\` work area.

Model: \`${runtime.model}\`

Runtime:

- Node: \`${runtime.node}\`
- API: \`${runtime.api}\`
- Host: \`${runtime.host}\`

Summary:

- Total runs: ${summary.total}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Transport/model errors: ${summary.errors}

The raw report is preserved at [\`${date}-${slug}-local-model.json\`](./${date}-${slug}-local-model.json).

| case | mode | expected | actual | pass | selected tokens | error |
| --- | --- | --- | --- | --- | ---: | --- |
${results.map((row) => `| ${[
  row.caseId,
  row.mode,
  row.expected,
  row.actual ?? '',
  row.pass ? 'yes' : 'no',
  row.selectedTokens,
  row.error ?? ''
].map((v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')}

Notes:

- \`natural\` uses the original message text.
- \`mixed\` uses the current eligibility gate.
- \`lunum\` forces the compact rendering even when policy would not allow it.
- Failures are retained in the JSON report with the raw response or transport error.
- This experiment targets the ${workArea} adoption profile (Design status).
`;

  await writeFile(mdPath, `${md}\n`);

  console.error(`\n=== ${workArea}: ${summary.passed}/${summary.total} passed ===`);
  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
