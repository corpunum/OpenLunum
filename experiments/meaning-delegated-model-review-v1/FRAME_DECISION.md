# Frame decision: `allow`/`prohibit` take an `action` role; `theme` is the object

**Status:** confirmed 2026-10-06 by the owner-delegated model reviewer
(Claude, `claude-opus-5-5`). Not a human review. No code or contract change:
this confirms the decision already implemented in
[ADR 0008](../../decisions/0008-allow-prohibit-action-role.md) (`lunum-frame/0.2`
onwards, now `0.5`) and closes the question left open in #685
("is theme the object, or does the frame gain an `action` role?").

## Choice

Keep the `action` role. `theme` is the object or resource; `action` is the
permitted or forbidden act, given as a registered predicate. `allow` needs at
least one of them, an `action` needs a stated recipient (ADR 0010), and a
permission with no stated permitter is modality `permission` on the act's own
predicate.

## Why

1. **The sources carry both parts.** In g02, "Ο διευθυντής επιτρέπει στον Νίκο
   να εγκρίνει δαπάνες έως 2.000 ευρώ", the permitted act (*approve*) and its
   object (*expenses*) are distinct meaning atoms. With a single `theme`, one
   of them is lost or the two are fused into free text that cannot converge
   across languages.
2. **Cross-language convergence.** A closed predicate vocabulary for `action`
   (`approve`, `read`, `access`, …) lets "allows X to approve expenses" and
   "επιτρέπει στον X να εγκρίνει δαπάνες" reach the same identity. A verb
   stored as free-text `theme` ("approve" vs "εγκρίνει") never would.
3. **Abstention stays meaningful.** "Lena allows Tomas." has neither an act
   nor an object and still abstains (`missing_required_role`). "Dana allows
   Mira to access." states an act (`access`) and is answerable. Making `theme`
   carry verbs would instead let a placeholder pass (decisions/0007).
4. **Identity is unchanged.** ADR 0008 measured all pre-existing identities
   as byte-identical. The cost is that older Sem with a verb in `theme` does
   not match the new form and needs re-extraction.

## Consequences for this packet

- g02 maps to `allow(agent: διευθυντής, recipient: Νίκος, action: approve,
  theme: expenses)`. The limit `έως 2.000 ευρώ` has no role in the frame, so an
  extractor must abstain or keep natural text rather than drop it (ADR 0015
  rule 3).
- e19 and g01 are **not** `allow`: there is no stated permitter, and the
  modal is ambiguous. They are not exact permission targets.
- e09 and g08 are prohibitions without a stated authority: obligation +
  negated (ADR 0015), not `prohibit`. e09's exception has no role and must
  not be dropped.
