# Optional grounding providers

OpenLunum providers supply reproducible evidence; they do not define the
semantic protocol or directly generate `lfp:2.1`. The core interface is
provider-neutral and returns `resolved_exact`, `ambiguous`, `unresolved`, or
`provider_error`. Only one stable external candidate with a pinned provider
version and snapshot may be converted to a Lunum namespace ID.

## OMW/CILI

The intended lexical provider is an offline record set derived from a pinned
Open Multilingual Wordnet release and its Collaborative Interlingual Index.
`createOmwProvider()` accepts normalized records containing language, lemma,
part of speech, and an ILI identifier. It performs exact lemma lookup only.
Polysemy is ambiguous; missing language or sense is unresolved; modified
compositions are unresolved because a head synset does not prove the modifier.
`importOmwTab()` imports the standard three-field tab records when the caller
also supplies an explicit synset-to-CILI map; unmapped synsets are reported,
never guessed.

The provider deliberately does not download data or call a network service.
An application supplies a locally cached, hashed snapshot and must retain the
source wordnet license metadata. OMW is an aggregation: licenses are not
uniform across constituent wordnets, so redistribution requires per-resource
review. German may come from a separately licensed aligned wordnet rather than
being silently treated as an OMW language.

## Wikidata-style entities

`createStableEntityProvider()` is an adapter boundary for a prevalidated,
revision- or dump-pinned entity snapshot. Labels, aliases, and search results
are candidate generation only. The adapter accepts only exact stable-ID
assertions supplied by the application and returns ambiguity when multiple IDs
survive context checks. A QID or similar ID becomes `urn:<provider>:<id>` only
through `toGroundingResolution()` and the existing materialization gates.

## Cascade policy

`resolveGroundingCascade()` can combine providers, but it never majority-votes.
If a later provider returns a conflicting exact ID or ambiguity, the result is
ambiguous. Provider errors do not invent an identity. When no exact result is
available, the caller retains the proposal and evidence without exact LFP.

ConceptNet and fuzzy label similarity are intentionally not exact providers.
They may be used by an application as diagnostic candidate evidence, but they
must be followed by an independently verified stable-ID assertion.

## Reproducibility requirements

An application using a provider should record provider name, provider version,
snapshot or revision SHA-256, normalized query, language, POS/context hints,
candidate IDs, returned evidence, license/source metadata, and retrieval time.
Live network responses must be cached before they can support a reproducible
evaluation. Provider upgrades do not rewrite historical Lunum identities.
