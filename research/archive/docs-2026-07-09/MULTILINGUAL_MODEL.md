# Multilingual architecture

## Three distinct layers

1. **Source and evidence** — original natural text, source language, provenance, exact spans, and ambiguity.
2. **Lunum-Sem** — language-neutral structured meaning using versioned controlled identifiers.
3. **Representations** — model-facing Lunum-Code renderings and human-facing natural-language realizations.

Readable identifiers such as `prefer`, `experiencer`, and `theme` are protocol symbols, not an English sentence. They may later receive numeric or namespaced registry identities without changing meaning.

## Initial English-pivot renderer

The first generic renderer uses short English-like tokens because many current general models handle them well. Its profile ID is `generic-en-pivot/0.1`. It is measured per model/tokenizer and may be replaced by model-specific profiles. No renderer defines semantic identity.

## Parsing

```text
natural text + source language + provenance -> ParseResult
```

A parse result includes candidate Sem, confidence, warnings, protected spans, and explicit abstention when the model cannot safely decide.

## Realization

```text
Lunum-Sem + target language + language/model profile -> RealizationResult
```

A realization retains protected names, numbers, units, dates, quotations, and required register. Translation between languages is parse followed by realization, while the source remains preserved for audit and recovery.

## Support levels

- **Design**: interface and fixtures only.
- **Experimental**: development data run; no protected gate.
- **Prototype**: protected gate passed on a named profile.
- **Verified**: independently reproduced and versioned for a product/model environment.

Support is directional. English parsing may be Verified while English realization remains Prototype.
