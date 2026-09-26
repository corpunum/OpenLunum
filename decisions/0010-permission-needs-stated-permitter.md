# ADR 0010 — `allow`/`prohibit` with an action need a distinct, stated recipient

**Status:** Implemented 2026-09-26. Self-reviewed. `lunum-frame/0.3`, contract `lunum-agent/0.7`. `lfp:2.1` is unchanged.

## Context

"System S-22 **is permitted to** activate F-22" (and the Greek `επιτρέπεται`) states a permission but no permitter. Extractors encoded it as `allow` with the *permitted* party in the permitter slot:
- Sep 15 (Codex/Claude): `allow(agent: S-22, recipient: S-22, theme: "enable F-22 and send N-22 to O-22")`
- frame 0.2 runs: `allow(agent: S-22, action: enable, theme: F-22)`

Both passed core. The correct encoding, `enable(S-22, F-22)` with modality `permission`, also passed, with a different identity. Checked live through the MCP server:

| Encoding | Result |
|---|---|
| `allow(agent: S-22, action: enable, theme: F-22)` | accepted, `lfp:2.1:…3d4226…` |
| `enable(agent: S-22, theme: F-22)`, modality `permission` | accepted, `lfp:2.1:…8d9f4e…` |

One meaning with two identities breaks convergence: 2 V8 rows failed in every frame-0.2 repetition. The frame-0.2 report attributed this to the `action` role. The Sep 15 outputs show the error predates it; the role changed its shape.

## Decision

Two generic frame constraints, applied to `allow` and `prohibit`:
- `requiredWith: { action: [recipient] }`: when an action is permitted or forbidden, the party it applies to must be stated. Otherwise `dependent_role_missing`.
- `distinctRoles: [[agent, recipient]]`: the permitter and the permitted party must differ. Otherwise `identical_roles`.

With no stated permitter, the `allow` encoding cannot be completed. What remains is modality `permission` on the action's own predicate, or abstention. The frame descriptions, the prompt block and the builder schema (`dependentRequired`) state this.

Theme-only permissions (`allow(agent, theme)`) are unaffected.

## Identity and data

- The whole repository was fingerprinted with the build of `main` at `af5fd54` and with the new build:
  - 2,464 identities are byte-identical, and none changed.
  - 49 lost identity: 27 `dependent_role_missing` and 22 `identical_roles`. Every one is an extractor output of the S-22 permission sentence, from Sep 15 and from the frame-0.2 runs.
  - There were no hits in datasets, targets, fixtures or protected data.
- No target changes: the V8 frame-0.2 successor targets already encode these rows with modality `permission`.
