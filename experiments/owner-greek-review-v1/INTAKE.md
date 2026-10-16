# Owner review v1: intake

**Returned 2026-10-16** as [`WORKSHEET.filled.md`](WORKSHEET.filled.md) (SHA-256 `80b9dda4…ce45`), committed unchanged. The intake was written by a Claude Code session and is self-reviewed. The meanings are the reviewer's; the implications drawn below are the session's.

## Provenance

| | |
|---|---|
| Reviewer | Antonis Fragkos (Φράγκος Αντώνης), project owner, native Greek speaker. English level not self-rated. |
| Parts A and B | The file says: *"A/B are AI-assisted proposed answers … not his independently confirmed judgments."* On 2026-10-16, when returning it, the owner said he **checked all of it**. They are therefore labelled **AI-assisted drafts, checked by a native speaker**. They are not independently authored human judgments. |
| Part C | The file says the pairs are existing, credited translations, AI-selected, and not owner-authored. The translations themselves are by humans: Tatoeba volunteers, Wikivoyage contributors and EU translators. **None was written by the model under test**, which is what the convergence test needs. Their original authoring methods are not verified. |
| Extra | The full Tatoeba EN–EL export (17,599 pairs) is now in [`datasets/third-party/tatoeba-eng-ell-2026-10/`](../../datasets/third-party/tatoeba-eng-ell-2026-10/README.md). |

The reviewer is the project owner, so this is a native-speaker check, not independent review.

## Part B: are the AI-written Greek sentences natural?

**18 of 19 are ok, and 1 is awkward.** The 10 round-2 Greek sentences and 8 of the 9 V8 Greek sentences are natural Greek.

- **B14 (V8 `v8-g4-el`), awkward:** «Ο συντάκτης E-61 δημοσιεύει την αναφορά R-61 στο κοινό A-61». Suggested wording: «…δημοσιεύει την αναφορά R-61, θέτοντάς την στη διάθεση του κοινού A-61».

**Finding: V8 merges two meanings that the reviewer separates.** V8 gives one `audience` role to all of these:
- "publishes … **for** audience";
- "made available … **to** audience";
- «**στο** κοινό» (groups 61 and 62);
- «**για** το κοινό».

The reviewer reads them as two different meanings:
- «στο κοινό» means *made available to* (B14);
- «για το κοινό» means *intended for*, and "replacing it with «για» would weaken that distinction" (B15).

So two V8 semantic groups count as convergence over sentences that a native speaker reads differently. V8 is frozen and is not edited. Any successor V8 target set must either split this role or document the merge as a deliberate coarsening.

Also flagged:
- **B16 (Rhea, "exactly seven times"):** the word order allows the count to scope over the attempts or over the intended executions. The main reading is seven more attempts.
- **B6 «Ανακάλεσε.»** is acceptable only as an ellipsis in context; what is revoked must come from the context.

## Part A: the 14 sources the meaning scorer could not resolve

| Item | The reviewer's main reading | What it implies for the scorer and contract |
|---|---|---|
| e06 Grant Priya access … until 30 November 2026 | An order to grant access. The date is **when the access ends**, not a deadline for granting it. | A parse must attach the date to the access, not to the act of granting. |
| e09 Nobody except the auditor may delete audit logs | A prohibition for everyone else. **The exemption does not by itself grant the auditor permission** to delete. | `allow(auditor, delete)` overstates the meaning. Prohibition plus exception has no frame slot, so the expected outcome is abstain. |
| e10 Run the backup script every night at 02:00 | A recurring order: every night at 02:00. The time zone is unstated. | No recurrence slot exists, so abstain (contract 0.11 rule). |
| e11 Send three reminders before the deadline on 15 March | Exactly three, before a deadline that falls on 15 March. The year is missing. | The date belongs to the deadline. Exactly 3. No year should be invented. |
| e13 Jonas should polish the onboarding slides before Friday | **Should** is a recommendation, weaker than must. Which Friday is unclear. | `should` must not be encoded as obligation. |
| e14 Do not restart the cluster during business hours | A prohibition (must not), limited to business hours. It does **not** grant permission outside them. | Obligation plus negated, with a time restriction. |
| e15 If more than 5 login attempts fail, lock the account | Conditional must. **More than 5 means at least 6** (strict). | Strict `above 5`, not `at_least 5`. |
| e19 Ahmed can view the incident report | **Ambiguous: permission or ability.** | The existing expectation (parse as permission) picks one reading. Under "abstain when ambiguous", the expectation should be abstain or both readings. |
| g01 Η Ελένη μπορεί να διαβάσει … | **Ambiguous three ways: permission, ability, or epistemic "may/might".** | As for e19. Greek «μπορεί» also carries the epistemic reading. |
| g02 … επιτρέπει … δαπάνες έως 2.000 ευρώ | Permission. **«Έως 2.000» is inclusive (≤ 2,000).** Per-expense or total is unspecified; per-expense is the usual reading. | Agrees with ADR 0022 (`at_most`). Per-expense vs total is an open ambiguity. |
| g04 Επανεκκίνησε τον διακομιστή αλληλογραφίας | Mainly an imperative. **The same form is also 3rd-person singular aorist** ("someone restarted it"). | See the finding below. |
| g05 Ειδοποίησε την ομάδα αν … ξεπεράσει τους 40 βαθμούς | An imperative, strongly favoured by the «αν» clause. **The threshold is strict (> 40).** The unit (Celsius or Fahrenheit) is unstated. | Strict `above 40`, with no invented unit. |
| g07 Αρχειοθέτησε τα 12 παλιά έργα μέχρι τις 31 Δεκεμβρίου | Mainly an imperative, with an aorist alternative. **Exactly these 12**, and the deadline is inclusive. The year is missing. | Count 12 exact; no invented year. |
| g08 Ο Πέτρος δεν πρέπει να εκτελεί σενάρια στην παραγωγή | **Must not, or should not, depending on context.** Never "need not". | The strength of the modality depends on context. |

**Finding: Greek imperative/aorist homography.** «Επανεκκίνησε», «Ειδοποίησε», «Αρχειοθέτησε» and «Ανακάλεσε» are each both 2nd-person singular imperative and 3rd-person singular aorist indicative. The contract and every recorded run treat them as orders. A delegated model review ([meaning-delegated-model-review-v1](../meaning-delegated-model-review-v1/README.md), 2026-10-06) had already raised this. This is the first confirmation by a native speaker. In instruction-like contexts the reviewer favours the imperative, but a memory system storing Greek chat or logs will meet the narrative reading. A context-free sentence like these is genuinely ambiguous. This is a language-specific risk for any identity that encodes the act as a command.

**Finding: modal "can / μπορεί".** e19 and g01 have two or three readings. Contract 0.19 has no way to keep a modal reading open, so a parse silently picks one.

## What this changes

1. **The meaning reference for the 14 items now exists.** It is native-checked, AI-assisted drafting. Turning it into target Sem is a separate technical mapping step, done by an agent and labelled as such, against the frozen contract (ADR 0025). That step is not done here. It is the next offline task, and it re-scores both runs over 30 items instead of 16.
2. **The Greek in round 2 and V8 is natural**, apart from one awkward sentence. The audience-role merge is a target-design issue, not a wording issue.
3. **Two new ambiguity classes**, imperative/aorist and modal "can", go to the evaluation protocol. Future probe sets must label them.
4. **Part C and the Tatoeba export feed the [cross-language convergence test](../cross-language-convergence-v1/PREREGISTRATION.md)**, which is pre-registered before any model sees the sentences.
