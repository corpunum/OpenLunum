#!/usr/bin/env node
// lunum-handoff-appendix: transcript -> facts appendix (<= 3.5k tokens, hard cap). Dependency-free ESM, no model, no network.
// Kept outside packages/*/dist so it is not part of the frozen served runtime (SERVED_RUNTIME_ROOTS).
//   node scripts/lunum-handoff-appendix.mjs --in session.jsonl --out appendix.md [--max-tokens 3500] [--index INDEX.md]
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// Deterministic "facts appendix" builder: transcript -> bullet facts under a hard character cap.
// No LLM, no network. Pure functions; the CLI wrapper is bin/lunum-handoff-appendix.ts.
const SECTIONS = ['Decisions', 'Open items', 'Numbers and ids', 'Paths', 'Pending', 'Tool facts'];
const QUOTA = { Decisions: 0.24, 'Open items': 0.18, 'Numbers and ids': 0.16, Paths: 0.08, Pending: 0.14, 'Tool facts': 0.20 };
const SECRET_PATTERNS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
    /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    /\bAIza[0-9A-Za-z_-]{30,}/g,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    /\b(?:api[_-]?key|token|secret|passw(?:or)?d|authorization)\s*[=:]\s*\S+/gi,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi,
];
const LONG_OPAQUE = /\b[A-Za-z0-9_-]{32,}\b/g;
export function redact(input) {
    let count = 0;
    let text = input;
    const sub = () => { count++; return '[REDACTED]'; };
    for (const re of SECRET_PATTERNS)
        text = text.replace(re, sub);
    text = text.replace(LONG_OPAQUE, (m) => {
        if (/^[0-9a-f-]+$/i.test(m))
            return m; // uuid / git sha / hex digest
        return /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m) ? sub() : m;
    });
    return { text, count };
}
const TOOL_RESULT_MAX = 400;
function blockText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content.map((b) => (b && typeof b === 'object' && b.type === 'text' ? String(b.text ?? '') : '')).filter(Boolean).join('\n');
}
/** Bodies of short tool_result blocks (<= 400 chars); longer ones are dropped. */
function toolResultBodies(content) {
    if (!Array.isArray(content))
        return [];
    const out = [];
    for (const b of content) {
        if (!b || typeof b !== 'object' || b.type !== 'tool_result')
            continue;
        const body = blockText(b.content).trim();
        if (body && body.length <= TOOL_RESULT_MAX)
            out.push(body);
    }
    return out;
}
/** Parse Claude Code jsonl or a JSON messages array (or {messages:[...]}). */
export function parseTranscript(raw) {
    const trimmed = raw.trim();
    const out = [];
    let rows = null;
    if (trimmed.startsWith('['))
        rows = JSON.parse(trimmed);
    else if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
        const one = JSON.parse(trimmed);
        rows = Array.isArray(one.messages) ? one.messages : [one];
    }
    else {
        rows = [];
        for (const line of trimmed.split('\n')) {
            if (!line.trim())
                continue;
            try {
                rows.push(JSON.parse(line));
            }
            catch { /* skip malformed line */ }
        }
        const first = rows[0];
        if (rows.length === 1 && first && Array.isArray(first.messages))
            rows = first.messages;
    }
    for (const r of rows) {
        const o = (r ?? {});
        if (o.isMeta === true || o.isSidechain === true)
            continue;
        const m = (o.message && typeof o.message === 'object' ? o.message : o);
        if (typeof o.type === 'string' && o.type !== 'user' && o.type !== 'assistant')
            continue; // skip attachments, api-request-blob, etc.
        const role = String(m.role ?? o.type ?? '');
        if (role !== 'user' && role !== 'assistant')
            continue;
        const ts = typeof o.timestamp === 'string' ? o.timestamp : undefined;
        let text = blockText(m.content)
            .replace(/<system-reminder[^>]*>[\s\S]*?<\/system-reminder>/g, '')
            .replace(/<(command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g, '');
        text = text.trim();
        if (text)
            out.push(ts ? { role, content: text, ts } : { role, content: text });
        if (role === 'user')
            for (const body of toolResultBodies(m.content))
                out.push(ts ? { role: 'tool', content: body, ts } : { role: 'tool', content: body });
    }
    return out;
}
const PENDING = /\b(cancel(?:l?ed|l?ing)?|scheduled?|reminder|deadline|due (?:on|by|at)|paused|resume[sd]? (?:on|at)|until \d|will (?:run|fire|start|resume)|cron|postponed|deferred|on hold|waiting (?:for|on)|blocked (?:on|by))\b/i;
const DECISION = /\b(decided|decision|agreed|approved|chose|chosen|going with|we(?:'ll| will) (?:use|go|ship|keep|drop|use)|switch(?:ed|ing)? to|settled on|confirmed|owner (?:said|wants|asked|confirmed|approved)|rule:|policy:|root cause|fixed by|resolved|approved|rejected|dropped|keep|owner (?:rule|order))\b/i;
const OPEN = /\b(todo|to-do|open (?:question|item|issue)|still (?:need|to|open|missing)|need(?:s)? to|next step|follow[- ]?up|remaining|not yet|unresolved|please (?:do|check|send|confirm|make|add|run|fix|write|review)|can you|could you|should we|action item|must be done)\b/i;
const ID_RE = /\b(?:[a-z][a-z0-9]{1,}-\d{1,6}|\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?|\d{1,2}:\d{2}(?::\d{2})?\s?(?:Z|UTC|EET|EEST)?|#\d{1,6}|v\d+\.\d+(?:\.\d+)?|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d[\d,.]*\s?(?:%|ms|s|min|mins|h|hours?|k|M|MB|GB|KB|tokens?|chars?|files?|tests?|msgs?|messages?|workers?|sessions?|commits?|lines?|bytes))\b/gi;
// High-value facts inside short tool results: cron/job/queue ids, tmux, pids, scripts, rules, deploy shas, ports.
const TOOL_FACT_PATTERNS = [
    /\b(?:cron|scheduled (?:one-shot |recurring )?(?:task|job)|next run|wake)\b/i,
    /\b\d{1,2}(?:,\d{1,2})?(?:\/\d+)? [\d*/,]+ [\d*/,]+ [\d*/,]+ [\d*/,]+\b/,
    /\btmux\b/i,
    /\bpids?\b[ =:#]*\d+|\b\d{3,7}\s+(?:claude|node|bash|sh|python3?)\b/i,
    /[\w~./-]+\.(?:sh|mjs|py)\b/,
    /\b(?:report after|apply now|apply immediately|report only|apply after|do not apply)\b/i,
    /\b(?:commit|deploy(?:ed)?|sha|revision|rev|tip|head)\b.*\b[0-9a-f]{7,40}\b|\b[0-9a-f]{7,40}\b.*\b(?:commit|deploy(?:ed)?|sha|revision)\b/i,
    /\bport\b[ =:]*\d{2,5}|(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}|\blistening on\b/i,
    /\b(?:job|queue[d]?|task|worker|run|chain|card|mission)[ _-]?(?:id)?[ =:#]*[0-9a-f]{6,}\b|\b[A-Z]{1,3}-[0-9a-f]{6,}\b/i,
];
const HASH_RE = /\b[0-9a-f]{7,40}\b/g;
const PATH_RE = /(?<![\w:/.-])(?:~|\.{1,2})?(?:\/[\w.@+=-]+){2,}\/?/g;
const HAS_PATH = /(?<![\w:/.-])(?:~|\.{1,2})?(?:\/[\w.@+=-]+){2,}/;
const bytes = (s) => Buffer.byteLength(s, 'utf8');
function hasHash(s) {
    for (const m of s.match(HASH_RE) ?? [])
        if (/\d/.test(m) && /[a-f]/.test(m))
            return true;
    return false;
}
function cleanLine(l) {
    return l.replace(/^[\s>*#\-+•]+(\[[ xX]\]\s*)?/, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
}
// Repeated facts of the same kind: the LAST value wins and is marked "(latest of N, was: <previous>)".
// Slots are keyed so that concurrent distinct things stay apart (cron by schedule, percentages by the words before them).
function detectSlot(text, idToSched) {
    let m;
    if ((m = /\b(?:cancel(?:l?ed|l?ing)?|deleted?|removed?)\s+(?:cron\s+|job\s+|task\s+|one-shot\s+)*([0-9a-f]{8})\b/i.exec(text))) {
        const sched = idToSched.get(m[1]);
        return { key: sched ? `cron:${sched}` : `cron:id:${m[1]}`, value: `cancelled ${m[1]}`, id: m[1], text: sched ? `Cancelled job ${m[1]} (${sched})` : undefined };
    }
    if ((m = /\b(?:scheduled|created)\b.*?\b(?:job|task|cron)\s+([0-9a-f]{8})\s*\(([^)]{3,60})\)/i.exec(text))) {
        idToSched.set(m[1], m[2]);
        return { key: `cron:${m[2]}`, value: `${m[1]} (${m[2]})`, id: m[1] };
    }
    if (/\btmux\b/i.test(text) && (m = /(?:-s|-t|session(?: named)?)\s+['"]?([A-Za-z][\w.]*[-_\d][\w.-]*)/.exec(text)))
        return { key: 'tmux', value: m[1], id: m[1] };
    if ((m = /\b(?:unpause[sd]?|paused|resume[sd]?|throttle[d]?)\b.*?\b(?:until|at|to)\s+(\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})/i.exec(text)))
        return { key: 'pause', value: m[1], id: m[1] };
    if (/\b(?:deploy(?:ed)?|shipped|live revision|tip)\b/i.test(text) && (m = text.match(HASH_RE)?.find((h) => /\d/.test(h) && /[a-f]/.test(h))))
        return { key: 'sha:deploy', value: m, id: m };
    if ((m = /\bpids?\b[ =:#]*(\d{2,7})/i.exec(text)))
        return { key: 'pid', value: m[1], id: m[1] };
    if ((m = /\bport\b[ =:]*(\d{2,5})|(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i.exec(text)))
        return { key: 'port', value: m[1] ?? m[2], id: m[1] ?? m[2] };
    if ((m = /((?:[A-Za-z][\w-]*\s+){1,2})(?:at |is |was |now |of )?(\d{1,3}(?:\.\d+)?)%/.exec(text)))
        return { key: `pct:${m[1].toLowerCase().replace(/[^a-z]+/g, ' ').trim()}`, value: `${m[2]}%`, id: `${m[2]}%` };
    return null;
}
const ASK_RE = /\b(?:waiting (?:for|on)|awaiting|asked|asking|which|whether|choose|pick|decide|should we|can you|could you)\b|\?\s*$/i;
const STOP = new Set('that this with from have been will would should could which whether there their them then than into onto about after before still when what your yours only also just more most some such very were does done'.split(' '));
function sigTokens(s) {
    return new Set((s.toLowerCase().replace(/\[m\d+\]/g, " ").match(/[a-z0-9][a-z0-9_.-]*[a-z0-9]|[a-z0-9]/g) ?? []).filter((t) => t.length >= 4 && !STOP.has(t) || (/\d/.test(t) && t.length >= 3)));
}
/** A later decision answers an ask when they share an id-like token (has a digit) or >= 2 words covering >= 40% of the shorter side. */
function answers(ask, decision) {
    const a = sigTokens(ask);
    const d = sigTokens(decision);
    const shared = [...a].filter((t) => d.has(t));
    if (shared.some((t) => /\d/.test(t) && t.length >= 5))
        return true;
    return shared.length >= 2 && shared.length / Math.min(a.size, d.size) >= 0.4;
}
// --index rule: conservative, deterministic. A Pending/Open items line is contradicted when (a) an id token (R-/U- id, hex commit, named job)
// also occurs in an INDEX line with a completion word, or (b) it is a 'quiet hold'/'park' line whose date is earlier than the INDEX's own date/time.
const STALE = 'Stale (contradicted by INDEX)';
const DONE_RE = /\b(?:done|deployed|shipped|ended|closed|completed?|merged|released)\b/i;
const NOT_DONE = /(?:[+/]|\b(?:to|will|not|then|and))\s*complete\b/gi; // imperative 'claim+complete X' is not a completion
const ID_TOKEN = /\b[RU]-[0-9a-f]{4,}\b|\b[0-9a-f]{7,40}\b/gi;
const JOB_TOKEN = /\b[a-z][a-z]+(?:-[a-z]+)+-\d{3,}\b/gi;
function parseIndex(text) {
    const done = text.split('\n').filter((l) => DONE_RE.test(l.replace(NOT_DONE, ' ')));
    const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(text);
    return { done: done.map((l) => l.toLowerCase()), when: m ? { date: `${m[1]}-${m[2]}-${m[3]}`, min: Number(m[4]) * 60 + Number(m[5]), year: m[1] } : null };
}
function stale(c, ix) {
    const t = c.text.toLowerCase();
    const ids = (t.match(ID_TOKEN) ?? []).filter((x) => /^[ru]-/.test(x) || (/\d/.test(x) && /[a-f]/.test(x)));
    if (ids.some((id) => ix.done.some((l) => l.includes(id))))
        return true;
    for (const job of t.match(JOB_TOKEN) ?? []) {
        const stems = job.split('-').slice(0, -1).filter((p) => p.length >= 3);
        if (stems.length >= 2 && ix.done.some((l) => stems.every((st) => new RegExp(`\\b${st}`).test(l))))
            return true;
    }
    if (ix.when && /\b(?:quiet[- ]hold|park)/.test(t)) {
        let date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t)?.[1];
        if (!date) {
            const md = /\b(\d{2})-(\d{2})\b/.exec(t);
            if (md)
                date = `${ix.when.year}-${md[1]}-${md[2]}`;
        }
        const times = [...t.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((x) => Number(x[1]) * 60 + Number(x[2]));
        if (!date && (/\btoday\b/.test(t) || times.length) && c.ts)
            date = c.ts.slice(0, 10);
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            if (date < ix.when.date)
                return true;
            if (date === ix.when.date && times.length && Math.max(...times) < ix.when.min)
                return true;
        }
    }
    return false;
}
function clip(s, n) { return s.length <= n ? s : s.slice(0, n - 3).trimEnd() + '...'; }
function key(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90); }
export function buildAppendix(messages, opts) {
    const maxTokens = opts.maxTokens ?? 3500;
    const maxChars = maxTokens * 4; // enforced on UTF-8 bytes (never smaller than chars)
    let redactions = 0;
    const cands = [];
    const pathCount = new Map();
    const seen = new Set();
    let lineCount = 0;
    let toolCount = 0;
    const convoCount = messages.filter((m) => m.role !== 'tool').length;
    let order = 0;
    // Message index (1-based, in the user/assistant sequence the header counts); a tool result takes the index of the message it follows.
    const msgIdx = [];
    { let c = 0; for (const m of messages) { if (m.role !== 'tool') c++; msgIdx.push(Math.max(c, 1)); } }
    const idToSched = new Map();
    messages.forEach((msg, mi) => {
        const red = redact(msg.content);
        redactions += red.count;
        const recency = messages.length > 1 ? mi / (messages.length - 1) : 1;
        let fence = false;
        if (msg.role === 'tool') {
            toolCount++;
            for (const raw of red.text.split('\n')) {
                const t = cleanLine(raw);
                if (t.length < 8 || !(TOOL_FACT_PATTERNS.some((re) => re.test(t)) || (hasHash(t) && /\b(?:commit|deploy|sha)/i.test(t))))
                    continue;
                const slot = detectSlot(t, idToSched);
                const k = key(t);
                if (!k || (!slot && seen.has(k)))
                    continue;
                seen.add(k);
                cands.push({ section: 'Tool facts', text: slot?.text ?? clip(t, 200), score: 3 + recency * 2 - t.length / 400, order: order++, msg: msgIdx[mi], slot, ts: msg.ts });
            }
            return;
        }
        for (const rawLine of red.text.split('\n')) {
            if (/^\s*```/.test(rawLine)) {
                fence = !fence;
                continue;
            }
            if (fence)
                continue;
            const line = cleanLine(rawLine);
            if (line.length < 12)
                continue;
            const alnum = (line.match(/[A-Za-z0-9]/g) ?? []).length;
            if (alnum / line.length < 0.55)
                continue;
            lineCount++;
            for (const p of line.match(PATH_RE) ?? []) {
                const pp = p.replace(/[.,;:)]+$/, '');
                if (pp.length < 6 || pp.length > 160 || /^\/(?:tmp|proc|dev|usr|var|etc)\b/.test(pp) || /\/\d+\.\d+/.test(pp))
                    continue;
                const e = pathCount.get(pp) ?? { n: 0, last: 0 };
                e.n++;
                e.last = msgIdx[mi];
                pathCount.set(pp, e);
            }
            for (const sentence of line.length > 260 ? line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/) : [line]) {
                const s = sentence.trim();
                if (s.length < 12)
                    continue;
                const idHits = (s.match(ID_RE) ?? []).length + (hasHash(s) ? 1 : 0);
                let section = null;
                let w = 0;
                if (PENDING.test(s)) {
                    section = 'Pending';
                    w = 3;
                }
                else if (DECISION.test(s)) {
                    section = 'Decisions';
                    w = 3;
                }
                else if (OPEN.test(s) || (msg.role === 'user' && s.endsWith('?'))) {
                    section = 'Open items';
                    w = 2.5;
                }
                else if (idHits >= 1) {
                    section = 'Numbers and ids';
                    w = 1;
                }
                if (!section)
                    continue;
                const slot = detectSlot(s, idToSched);
                const k = key(s);
                if (!k || (!slot && seen.has(k)))
                    continue;
                seen.add(k);
                const score = w + (section === 'Decisions' && idHits === 0 && !HAS_PATH.test(s) ? -1.5 : 0) + Math.min(idHits, 4) * 0.6 + recency * 2 + (msg.role === 'user' ? 1 : 0) - s.length / 400;
                cands.push({ section, text: slot?.text ?? clip(s, 220), score, order: order++, msg: msgIdx[mi], slot, ts: msg.ts });
            }
        }
    });
    // Collapse repeated slots to the last value; keep one 'was:' hint.
    const lastBySlot = new Map();
    const countBySlot = new Map();
    for (const c of cands) {
        if (!c.slot)
            continue;
        const prev = lastBySlot.get(c.slot.key);
        countBySlot.set(c.slot.key, (countBySlot.get(c.slot.key) ?? 0) + 1);
        if (prev && prev.slot.id !== c.slot.id)
            c.slot.was = prev.slot.was && prev.slot.wasId === prev.slot.id ? prev.slot.was : prev.slot.value;
        else if (prev && prev.slot.was)
            c.slot.was = prev.slot.was;
        lastBySlot.set(c.slot.key, c);
    }
    const collapsed = cands.filter((c) => !c.slot || lastBySlot.get(c.slot.key) === c);
    cands.length = 0;
    for (const c of collapsed) {
        const n = c.slot ? countBySlot.get(c.slot.key) : 1;
        if (c.slot && n > 1 && (c.slot.was || !c.slot.value.startsWith('cancelled')))
            c.text += ` (latest of ${n}${c.slot.was ? `, was: ${c.slot.was}` : ''})`;
        c.text += ` [m${c.msg}]`;
        c.score += c.slot && n > 1 ? 1 : 0;
        cands.push(c);
    }
    // Supersede: an ask (Pending / Open items) that a LATER Decisions bullet answers is dropped; the decision stays.
    {
        const decisions = cands.filter((c) => c.section === 'Decisions');
        const keep = cands.filter((c) => !((c.section === 'Pending' || c.section === 'Open items') && !c.slot && ASK_RE.test(c.text) && decisions.some((d) => d.msg > c.msg && answers(c.text, d.text))));
        cands.length = 0;
        cands.push(...keep);
    }
    const SECS = opts.index === undefined ? SECTIONS : [...SECTIONS, STALE];
    if (opts.index !== undefined) {
        const ix = parseIndex(opts.index);
        for (const c of cands)
            if ((c.section === 'Pending' || c.section === 'Open items') && stale(c, ix))
            {
                c.section = STALE; // shortened so stale lines stay cheap under the cap
                const tag = /\s\[m\d+\]$/.exec(c.text)?.[0] ?? '';
                c.text = clip(tag ? c.text.slice(0, -tag.length) : c.text, 110) + tag;
            }
    }
    const allPaths = [...pathCount.keys()];
    for (const [p, e] of pathCount) {
        if (allPaths.some((q) => q !== p && q.endsWith(p)))
            continue; // suffix of a longer path
        cands.push({ section: 'Paths', text: (e.n > 1 ? `${p} (x${e.n})` : p) + ` [m${e.last}]`, score: Math.min(e.n, 5) * 0.8 + (e.last / Math.max(convoCount, 1)) * 2, order: e.last * 1e4 + order++ });
    }
    const render = (picked, tokens) => {
        const head = [`source: ${opts.source} (${convoCount} messages)`, `generated: ${(opts.now ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')}`, `tokens: ~${tokens} (cap ${maxTokens})`];
        const body = [];
        for (const s of SECS) {
            const items = picked.filter((c) => c.section === s).sort((a, b) => a.order - b.order);
            if (!items.length)
                continue;
            body.push('', `## ${s}`, ...items.map((c) => `- ${c.text}`));
        }
        return head.concat(body).join('\n') + '\n';
    };
    // Budget: reserve the header (generous token digits) plus section titles, then fill per quota, then spill.
    const reserve = bytes(render([], 99999)) + SECS.reduce((n, s) => n + s.length + 5, 0);
    const budget = Math.max(0, maxChars - reserve);
    const picked = [];
    const bySection = new Map();
    for (const s of SECS)
        bySection.set(s, cands.filter((c) => c.section === s).sort((a, b) => b.score - a.score));
    const used = {};
    let total = 0;
    const cost = (c) => bytes(c.text) + 3;
    const leftovers = [];
    for (const s of opts.index === undefined ? SECS : [STALE, ...SECTIONS]) { // stale lines are picked first so the cap cannot silently lose them
        const cap = budget * (QUOTA[s] ?? 0.1);
        used[s] = 0;
        for (const c of bySection.get(s)) {
            if (used[s] + cost(c) <= cap && total + cost(c) <= budget) {
                picked.push(c);
                used[s] += cost(c);
                total += cost(c);
            }
            else
                leftovers.push(c);
        }
    }
    for (const c of leftovers.sort((a, b) => b.score - a.score)) {
        if (total + cost(c) <= budget) {
            picked.push(c);
            total += cost(c);
        }
    }
    let text = render(picked, 0);
    text = render(picked, Math.ceil(bytes(text) / 4));
    while (bytes(text) > maxChars && picked.length) { // hard cap, defensive
        picked.sort((a, b) => a.score - b.score).shift();
        text = render(picked, Math.ceil(bytes(text) / 4));
    }
    while (bytes(text) > maxChars)
        text = text.slice(0, -1);
    const bullets = {};
    for (const s of SECS)
        bullets[s] = picked.filter((c) => c.section === s).length;
    return { text, stats: { source: opts.source, messages: convoCount, toolResults: toolCount, lines: lineCount, bullets, chars: bytes(text), tokens: Math.ceil(bytes(text) / 4), maxTokens, redactions } };
}

function main() {
  // Headless: file in, file out, one stats JSON line on stdout. Exit 0 ok, 1 on any error. No prompts, no network.
  function fail(msg) {
      process.stderr.write(`lunum-handoff-appendix: ${msg}\n`);
      process.exit(1);
  }
  let values;
  try {
      values = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string' }, 'max-tokens': { type: 'string' }, index: { type: 'string' } }, strict: true }).values;
  }
  catch (e) {
      fail(`${e.message}\nusage: lunum-handoff-appendix --in <transcript.jsonl|messages.json> --out <appendix.md> [--max-tokens 3500] [--index <INDEX.md>]`);
  }
  if (!values.in || !values.out)
      fail('usage: lunum-handoff-appendix --in <transcript.jsonl|messages.json> --out <appendix.md> [--max-tokens 3500] [--index <INDEX.md>]');
  const maxTokens = values['max-tokens'] === undefined ? 3500 : Number(values['max-tokens']);
  if (!Number.isInteger(maxTokens) || maxTokens < 200)
      fail('--max-tokens must be an integer >= 200');
  try {
      const messages = parseTranscript(readFileSync(values.in, 'utf8'));
      if (messages.length === 0)
          fail('no user/assistant messages found in input');
      const { text, stats } = buildAppendix(messages, { source: basename(values.in), maxTokens, index: values.index === undefined ? undefined : readFileSync(values.index, 'utf8') });
      writeFileSync(values.out, text);
      process.stdout.write(JSON.stringify({ ok: true, out: values.out, ...stats }) + '\n');
  }
  catch (e) {
      fail(e.message);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
