# Owner calibration labels — results (2026-10-22)

The owner labelled all 40 items (`WORKSHEET-owner-filled.md`).

- **Controls: 8 / 8 caught** (every injected change marked "different": 3 negation flips, 2 may→must, 2 must→may, 1 number 2:30→4:30). The owner's labels pass the attention bar in README.md (re-collect only if more than 2 of 8 are missed).
- **Natural Qwen round trips (32): 27 same, 2 mostly same, 1 can't tell, 2 different.**
  - #25 different: counterfactual obligation ("έπρεπε να είχε αγοράσει" → "πρέπει να αγόρασε", inference) — a modality/tense error the pivot guards did not catch.
  - #35 different: name changed (Μαίρη → Μαρία) — a name-carry failure the literal guard should catch for Greek names.
  - #1, #20 mostly same (preposition nuance; future "θα" dropped → habitual reading); #11 can't tell (gender of the referent changed).
- Next: judges (SuperGemma on the Ally + a free NIM/opencode model) label the same 40; keep a judge only if kappa ≥ 0.4 vs these labels and it misses ≤ 1 control (thresholds frozen in README.md before any judge run).
