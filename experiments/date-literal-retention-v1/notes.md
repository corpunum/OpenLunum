# Vision Guardrails, before coding

Source evidence stays authoritative, recoverable and unchanged. Normalize only
mechanically justified full-date spelling; never infer locale, referent identity
or omitted meaning. Keep dates separate from quantities. Source surface tokens,
metadata and provenance remain evidence, not proposition content. The Sem wire
schema, protocol registry, frames, renderer and durable fingerprint projection
are unchanged. Date retention cannot grant semantic confidence or promotion.
Version the submission contract and new runtime freeze; retain old artifacts.
Compaction and external OpenUnum remain out of scope.

Baseline eace760 falsely rejects ISO 2026-11-30 for source 30.11.2026 by treating
30.11 as a decimal. The previous milestone preserved that raw counterexample.
This repair also must prevent numeric components and evidence-only date text
from bypassing actual date/quantity retention. Unambiguous date recognition is
calendar-valid ISO or strict dotted day>12 with a four-digit year; other formats
are not guessed. NumbersInText remains a legacy digit utility; the source gate
uses separate date and non-date pools.
