// judge-calibration-v1: the judge prompts, endpoints and call rules. Also used by experiments/coverage-a3-v2 (bar 2),
// so the prompt a judge was calibrated with is byte-for-byte the prompt it scores the bar with.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** English level (b) on generic-en-pivot/0.3: R4's prompt (../roundtrip-en-v1/judge.mjs) plus the mood notation and mood in the question. */
export const englishPrompt = (sentence, code) => [
  'A system turned an English sentence into a compact meaning code. Format: a world marker (R real, F fiction, T tool, D dream, B belief, M metaphor),',
  'then an optional mood ("question:" a question; "imperative:" an order or request; "imperative to you:" an order or request to the person spoken to; no mood word: a statement),',
  'then one clause per " ; ": an optional "not", an optional modality, the predicate, then role=value pairs in brackets. "speaker" is the person speaking, "addressee" the person spoken to.',
  'Question: does the code state the content of the sentence (who does what to whom, negation, modality, and whether it is a statement, a question or an order), whatever the words? Small wording differences do not matter; a missing or wrong participant, action, negation, modality or mood does.',
  '',
  `Sentence: "${sentence}"`,
  `Code: ${code}`,
  '',
  'Reply with one line of JSON only: {"states": true} or {"states": false}',
].join('\n');

/** Greek level (b): the owner's worksheet question, asked of a model. */
export const greekPrompt = (original, after) => [
  'Two Greek sentences: an original, and a version that went through translation into English and back.',
  'Question: does the second sentence have the same meaning as the first? Judge only who does what to whom, negation, possibility or obligation (may / must), tense, numbers and names. Ignore style, word choice and grammar.',
  '',
  `Original: «${original}»`,
  `After: «${after}»`,
  '',
  'Reply with one line of JSON only: {"same": true} or {"same": false}',
].join('\n');

const nimKey = () => JSON.parse(fs.readFileSync(`${os.homedir()}/.openunum/secrets.json`, 'utf8')).secrets.nvidiaApiKey;
const nim = (model, vendor) => ({ url: 'https://integrate.api.nvidia.com/v1/chat/completions', model, vendor, label: `${model} (NVIDIA NIM free tier, temperature 0)`, max: 6000, key: nimKey, gapMs: 3000 });
/** Candidates, in the pre-registered order (PREREGISTRATION.md). */
export const JUDGES = {
  gemma: { url: 'http://127.0.0.1:28084/v1/chat/completions', model: 'supergemma4-Q5_K_M', vendor: 'google', label: 'supergemma4-Q5_K_M (ROG Ally via ssh tunnel, temperature 0)', max: 6000 },
  nemotron: nim('nvidia/nemotron-3-ultra-550b-a55b', 'nvidia'),
  deepseek: nim('deepseek-ai/deepseek-v4.1-flash', 'deepseek'),
  kimi: nim('moonshotai/kimi-k2.6', 'moonshot'),
  glm: nim('z-ai/glm-5.3', 'zhipu'),
  mistral: nim('mistralai/mistral-large-2-instruct', 'mistral'),
  // Owner 2026-10-23: NIM DeepSeek unreachable for hours; the same model through opencode's free tier
  // (temperature is the host's default, not 0). Must re-pass calibration before it judges anything.
  // Owner 2026-10-23 fallback order after NIM and opencode free went quiet: Luna at low effort (OpenAI family).
  luna: { cli: ['codex', 'exec', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=low', '--skip-git-repo-check', '-s', 'read-only'], dirArg: '-C', model: 'gpt-6-luna', vendor: 'openai', label: 'gpt-6-luna, low reasoning effort (Codex CLI)', gapMs: 1000 },
  'deepseek-oc': { cli: ['opencode', 'run', '-m', 'opencode/deepseek-v4.1-flash-free'], model: 'deepseek-v4.1-flash-free', vendor: 'deepseek', label: 'deepseek-v4.1-flash (opencode free tier, host default temperature)', gapMs: 2000 },
  qwen: { url: 'http://127.0.0.1:8080/v1/chat/completions', model: 'openai/qwen3.8-flash-next-uncensored-lean', vendor: 'alibaba', label: 'qwen3.8-flash (Halogen, temperature 0, rig protocol)', max: 2000, rig: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const halogenIdle = async () => { try { const h = await (await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(5000) })).json(); return (h.in_flight ?? 0) <= 1 && (h.queued ?? 0) === 0; } catch { return false; } };
const rigBusyWindow = () => { const m = new Date().getUTCMinutes(); return m < 10 || (m >= 30 && m < 40); };

/** One verdict: true / false, or null for a reply that does not parse (counted as "no" by every scorer). */
import { spawn } from 'node:child_process';
const OC_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-judge-'));
// stdin must be closed: opencode run reads a piped stdin as part of the prompt and waits for EOF.
const runCli = (cmd, prompt, dirArg = '--dir') => new Promise((resolve) => {
  const child = spawn(cmd[0], [...cmd.slice(1), dirArg, OC_DIR, prompt], { cwd: OC_DIR, env: { ...process.env, PWD: OC_DIR }, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  const timer = setTimeout(() => child.kill('SIGTERM'), 300000);
  child.stdout.on('data', (d) => { out += d; });
  child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? out : null); });
});

export async function ask(j, prompt, field) {
  if (j.cli) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const out = await runCli(j.cli, prompt, j.dirArg);
      if (out === null) { await sleep(30000); continue; }
      const c = out.replace(/\x1b\[[0-9;]*m/g, '');
      try { const v = JSON.parse(c.slice(c.lastIndexOf('{'), c.lastIndexOf('}') + 1)); return { verdict: typeof v[field] === 'boolean' ? v[field] : null, reply: c.slice(-200) }; }
      catch { return { verdict: null, reply: c.slice(-200) }; }
    }
    throw new Error('judge_unreachable');
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Rig protocol (Halogen is shared with live trading): never in :00-:10 / :30-:40 UTC, only when at most one other request is in flight and none is queued (as in coverage-a3-v1).
    while (j.rig && (rigBusyWindow() || !(await halogenIdle()))) await sleep(30000);
    try {
      const headers = { 'content-type': 'application/json', ...(j.key ? { authorization: `Bearer ${j.key()}` } : {}) };
      const res = await fetch(j.url, { method: 'POST', headers, signal: AbortSignal.timeout(600000),
        body: JSON.stringify({ model: j.model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: j.max }) });
      if (res.status === 429 || res.status >= 500) { await sleep(60000); continue; } // no reply: re-ask later
      const body = await res.json();
      const c = body.choices?.[0]?.message?.content ?? '';
      try { const v = JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); return { verdict: typeof v[field] === 'boolean' ? v[field] : null, reply: c.slice(0, 200) }; }
      catch { return { verdict: null, reply: c.slice(0, 200) }; }
    } catch { await sleep(60000); } // network failure: no reply, re-ask later
  }
  throw new Error('judge_unreachable');
}
export { sleep };
