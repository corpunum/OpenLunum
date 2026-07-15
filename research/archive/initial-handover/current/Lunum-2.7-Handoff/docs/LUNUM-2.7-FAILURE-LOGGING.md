# Lunum-2.7 Failure Logging

Every Lunum-related miss should log:

```json
{
  "memory_ids": ["m011"],
  "category": "conditional_instruction",
  "mode": "lunum",
  "natural_answer": "Leave the bridge and call Theo",
  "lunum_answer": "Call Theo",
  "failure_type": "dropped_conjoined_action",
  "predicate": "if_then",
  "resolution": "mark conditional_instruction ineligible for Lunum context"
}
```

## Failure types

- dropped_conjoined_action
- negation_loss
- condition_loss
- subject_loss
- wrong_entity
- Lunum_echo
- style_loss
- exact_wording_loss
- safety_constraint_loss

## Feedback loop

If a category fails repeatedly, mark it ineligible for Lunum-Code context until grammar/rendering improves.
