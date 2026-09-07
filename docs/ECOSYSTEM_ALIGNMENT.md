# OpenLunum ecosystem alignment

Status: standards audit and experimental interoperability guidance. This
document does not change `lfp:2.1`, the transport schema, or the canonical
frame registry.

## Boundary

OpenLunum is a product-neutral semantic interchange and validation layer:

```text
source evidence -> untrusted candidate -> deterministic Sem -> identity
```

Existing ecosystems should be used for the problems they already solve. An
adapter may import evidence or export a view, but an external label, role set,
graph serialization, agent transport, or memory index cannot grant Lunum exact
identity by itself.

## Alignment matrix

| Ecosystem | Solves | Overlap | Reuse / adapter opportunity | Decision |
| --- | --- | --- | --- | --- |
| UMR | Document-level multilingual meaning, concepts, roles, negation, modality, time, coreference, discourse relations | High semantic-IR overlap | Optional loss-aware UMR-like import/export and auxiliary supervision; retain Lunum identity/provenance gates | INTEROPERATE; OPTIONAL SUPERVISION |
| PropBank / Universal PropBank | Predicate frames and shallow semantic roles across languages | Predicate/argument extraction | Auxiliary predicate and argument detection only; A0/A1 are not Lunum roles without roleset-specific mapping | OPTIONAL SUPERVISION |
| UCCA | Cross-linguistic scenes, participants, states, and structural semantic graphs | Event/participant decomposition | Evaluation and decomposition supervision; do not flatten UCCA graphs into Lunum frames automatically | BENCHMARK AGAINST; OPTIONAL SUPERVISION |
| SemType / type registries | Reusable typed entities/properties and stable references | Open concepts and grounding | Optional external type references with provider/version provenance | INTEROPERATE |
| RDF / RDFC-1.0 | Graph data model and canonical dataset serialization/hashing | Deterministic serialization and identity | Borrow explicit algorithm/version/hash-agility discipline; optional RDF/JSON-LD export | ADOPT PRINCIPLE; INTEROPERATE |
| SHACL | Machine-readable graph shapes and validation reports | Frames, constraints, result paths, severities | Borrow stable constraint IDs and structured paths in reports; no RDF dependency in core | ADOPT PRINCIPLE |
| PROV-O | Interchange vocabulary for entities, activities, agents, and derivation | Source, extractor, candidate, provider, promotion | Optional provenance export/import; Lunum evidence policy remains authoritative | INTEROPERATE |
| Graphiti | Temporal knowledge graph construction and hybrid graph/full-text/vector search | Temporal facts, provenance, retrieval augmentation | Consuming product can index Lunum records; do not rebuild graph storage in core | INTEROPERATE |
| Hindsight | Memory retain/recall, temporal and belief-oriented retrieval | Evidence-aware memory and hybrid retrieval | Compare retrieval methodology; Lunum supplies exact identity as an additional signal | BENCHMARK AGAINST |
| Mem0 | Product memory extraction, update, and retrieval | Source-to-memory derivation | Product adapter only; not a semantic protocol substitute | NO ACTION IN CORE |
| Cognee | Document-to-graph/vector memory pipelines | Ingestion and graph retrieval | Product adapter and benchmark candidate | NO ACTION IN CORE |
| Letta | Stateful agent runtime and memory lifecycle | Agent state/provenance adjacency | Agent product may carry Lunum records; no runtime responsibilities in core | NO ACTION IN CORE |
| MCP | Agent-to-tool/resource/prompt transport | Current Lunum MCP adoption surface | Keep MCP thin and expose Lunum as typed tools/resources | INTEROPERATE |
| A2A | Agent discovery, task/message lifecycle, and agent-to-agent artifacts | Inter-agent semantic payloads | Carry Lunum Sem as structured data/artifact; A2A remains transport/lifecycle | INTEROPERATE |
| LLMLingua | Model-facing prompt/context compression | Renderer/compaction concerns | Compare tokenizer/task/safety methodology later; compaction remains parked | BENCHMARK AGAINST |
| OMW/CILI | Multilingual lexical synsets and interlingual IDs | Open-concept grounding evidence | Optional versioned provider; ambiguity remains unresolved | INTEROPERATE |
| Wikidata | Stable entity/concept IDs and multilingual labels | Grounded references | Optional stable-ID provider with cached evidence and context disambiguation | INTEROPERATE |

## Findings

UMR and UCCA validate a structured, language-neutral semantic intermediate
representation. PropBank and Universal PropBank validate learning
predicate/argument detection, but numbered roles are roleset-relative; they
must not be substituted for Lunum frame-specific roles. These resources are
therefore optional supervision or adapter inputs, not trusted Lunum gold
without a reviewed lossless mapping.

Universal PropBank 1.0 inherits its Universal Dependency Treebank licenses and
lists CC BY-NC-SA restrictions for several languages. Greek is not listed in
its UP1 inventory. No PropBank data is bundled or used for training; any future
use needs per-resource legal review and a license manifest.

RDFC-1.0 is a useful precedent for named canonicalization algorithms,
canonical bytes, and hash agility, but it canonicalizes graph isomorphism and
does not establish semantic equivalence. SHACL motivates stable constraint IDs,
result paths, and structured validation reports. PROV-O is a useful export
vocabulary for source, extractor, provider, and derived-record relationships;
it does not determine whether a candidate is semantically justified.

Graphiti and Hindsight demonstrate that temporal, graph, lexical, and vector
retrieval complement one another. Mem0, Cognee, and Letta are product/runtime
systems with lifecycle and memory policies. Lunum should expose exact identity,
predicate/role filters, provenance, and uncertainty as retrieval signals while
leaving indexing, retention, reranking, and agent lifecycle to consumers.

MCP is the tool/resource boundary; A2A is the agent discovery/task/message
boundary. Lunum is structured meaning carried through either, not a replacement
for either.

## Lunum differentiators

The audit supports these as Lunum design differentiators: source evidence
remains authoritative; candidate and promoted semantics are separated; exact
semantic-content identity is versioned; ambiguity and unsupported meaning fail
closed; the core is provider-independent; renderers vary without changing
identity; and the submission/validation surface is product-neutral. Hybrid
retrieval is a shared integration principle, not a unique invention.

## Controlled vocabulary hierarchy

1. **Controlled protocol symbol** — registered world, kind, predicate, role,
   term type, or modality; canonical and frame-validated.
2. **Open concept** — arbitrary source-preserved concept or instance label;
   spelling alone never grants identity.
3. **Groundable external concept** — an open concept with versioned provider
   evidence such as a CILI synset or Wikidata QID; ambiguity fails closed.
4. **Compositional concept** — explicit head plus typed modifiers/properties;
   never blind token sorting.
5. **Unresolved concept** — evidence retained, exact identity unavailable.

This addresses `blue_folder` versus `folder_blue` without a giant ontology,
while keeping `production`/`staging`, `public`/`private`, role swaps, and
changed quantities distinct.

## Training decision

The learned boundary remains a semantic-IR/frame-slot compiler. The first
pilot should use reviewed Lunum-specific IR targets. PropBank/UPB, UCCA, and
UMR may be auxiliary pretraining only after license review, explicit lossy
mappings, and held-out Lunum evaluation. The cheapest meaningful experiment
remains a small multilingual encoder with structured heads followed by the
deterministic IR-to-Sem compiler. No paid or authorized training backend is
currently available in this environment.

## Sources

- [UMR guidelines](https://umr4nlp.github.io/web/guidelines.html)
- [PropBank](https://propbank.github.io/)
- [Universal PropBank 1.0](https://github.com/UniversalPropositions/UP-1.0)
- [UCCA documentation](https://ucca.readthedocs.io/en/latest/)
- [RDF Dataset Canonicalization 1.0](https://www.w3.org/TR/rdf-canon/)
- [PROV-O](https://www.w3.org/TR/prov-o/)
- [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [Graphiti hybrid search](https://www.mintlify.com/getzep/graphiti/guides/searching)
