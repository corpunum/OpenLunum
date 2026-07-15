# Generic Node agent reference

**Status:** Reference architecture.

```js
import { createRecord, compileContext } from '@corpunum/lunum';

const record = createRecord({
  sourceText: 'The user prefers concise answers.',
  sourceLanguage: 'en',
  sem,
  category: 'preference',
  risk: 'low',
  confidence: 0.98
});

const context = compileContext([{
  role: 'system',
  content: record.source.text,
  record
}], { mode: 'shadow_mixed' });
```

The product stores the record, owns authorization, and decides when to serve mixed context.

## Evidence

A bounded local-model smoke test for this reference path is preserved in
[`../../eval/runs/2026-07-15-generic-node-local-model.md`](../../eval/runs/2026-07-15-generic-node-local-model.md)
with raw JSON at
[`../../eval/runs/2026-07-15-generic-node-local-model.json`](../../eval/runs/2026-07-15-generic-node-local-model.json).
