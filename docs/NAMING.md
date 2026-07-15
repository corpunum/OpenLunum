# Naming and versioning language

## Names

- **OpenLunum**: repository, governance umbrella, SDK/evaluation project.
- **Lunum**: protocol and technology family.
- **Lunum-I**: “Lunum Interlingua,” the first independent specification line in OpenLunum.
- **Lunum-Sem**: canonical semantic representation.
- **Lunum-FP**: deterministic semantic fingerprint.
- **Lunum-Code**: compact model-facing rendering.
- **Lunum-Bin**: optional future storage/transport encoding, never assumed model-readable.

`Lunum-I` is not a historical version reset. Prior Lunum 1 through 2.7 work is preserved under `research/archive/`.

## Versions

Three versions may differ:

1. package version, such as `@corpunum/lunum@0.1.0`;
2. semantic schema, such as `lunum-sem/0.1-draft`;
3. renderer profile, such as `safe/generic/0.1`.

A package release can add a renderer without changing the semantic schema. A canonicalization change that alters fingerprints must change the canonicalization/fingerprint version.
