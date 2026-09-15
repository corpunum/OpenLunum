# Diagnostic development comparison — corrected frozen run

This is `DIAGNOSTIC DEVELOPMENT COMPARISON — NOT #685 QUALIFICATION`.
It is a two-client run: Codex and Claude completed native MCP calls. AGY and
Gemini CLI were blocked before model execution by authentication/permission
boundaries recorded in the freeze manifest; no fallback model was used.

The first captured run is retained in `../client-run/` but excluded because
V8's persisted contract was `lunum-agent/0.2` while the tested MCP build
returned `lunum-agent/0.3`. The v2 run used that exact contract, but its freeze
record was not committed before extraction; it is therefore retained as
post-hoc diagnostic evidence, not claimed as chronologically proven. The
committed v3 freeze in `../client-run-v3/freeze-manifest.json` is the valid
checkpoint for the final rerun.

Native streams are under `../raw-v2/{codex,claude}/`. `*-call-evidence.json`,
the candidate ledgers, and `usage-summary.json` are derived mechanically from
those streams. `*-results.json` is produced by the existing source-relative
scorer; it is not a second semantic engine.

The results are intentionally diagnostic. Neither client produced a
source-relative full match on the six parse targets. Codex had four explicit
abstentions, one correct on the two abstention targets; Claude parsed all
eight items, so both abstentions were false parses. Exact identity was not
comparable for Codex and had a denominator of one for Claude, with zero exact
matches. The scorer reports no missing or malformed ledger entries. These
numbers do not certify target meaning because English human/native review is
still unavailable; the Greek review remains wording-only and exact-string
scoped.

Isolation was fresh per item and prompt-level only. The client startup
environment and tool schemas are visible in the native streams; no OS-level
sandbox or complete prevention of provider/client memory access is claimed.
No repair pass was run. The earlier exploratory/rejected attempts are not
pooled into these first-pass results.
