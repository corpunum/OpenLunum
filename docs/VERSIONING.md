# Versioning and compatibility

OpenLunum uses semantic package versioning, but pre-1.0 releases may change APIs. Integrators should pin exact versions.

## Compatibility surfaces

- public JavaScript exports;
- JSON Schemas;
- canonical serialization;
- fingerprint namespace;
- renderer profile identifiers;
- product adapter contracts.

## Breaking changes

The following require explicit migration notes and generally a new schema or fingerprint namespace:

- changing the meaning of a field;
- changing default semantic values;
- changing canonical ordering or normalization;
- changing equivalence rules;
- changing fingerprint input.

Renderer spelling changes do not necessarily change semantic fingerprints, but they require new renderer profile versions and evaluation.
