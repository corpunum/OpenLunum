# Diagnostic development comparison — committed frozen run

This is `DIAGNOSTIC DEVELOPMENT COMPARISON — NOT #685 QUALIFICATION`.
The freeze manifest and bound inputs were committed in `731a110` before the
fresh extraction. Codex and Claude each processed the same eight source-only
items in fresh per-item contexts, with one first-pass attempt and no repair.

Native streams are under `../raw-v3/{codex,claude}/`. The client ledgers,
call evidence, usage summary, and scorer results are derived from those
streams. AGY and Gemini CLI were blocked before model execution; no fallback
model was used. Isolation is prompt-level with disposable working directories,
not an OS/provider-memory isolation claim.

The V8 target Sem remains independently validated but not human-certified;
English human/native review is unavailable, and the Greek review is limited
to exact approved wording. Results therefore remain diagnostic and do not
qualify or close issue #685.
