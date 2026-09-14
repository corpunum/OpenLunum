# Contributing and reporting problems

OpenLunum is a public, pre-1.0 research repository. Its current terms are **all rights reserved**, not an open-source license. See [LICENSE.md](LICENSE.md). Discuss permission and contribution terms with the maintainer before substantial code contributions or downstream reuse; this page does not grant a license or assign anybody's copyright.

## Questions, bug reports and small suggestions

Open a GitHub issue. Include the command/input, expected behavior, observed output, Node version and commit when relevant. A minimal example is more useful than a readiness score. Do not include secrets or personal source data.

No `WORKER_ASSIGNMENT.md`, agent dispatcher, prescribed eight-document reading order, or maintainer assignment is needed to read the project or report a problem.

## An agreed code or documentation change

1. Keep one focused change and link the relevant discussion. A typo or broken link does not need a research campaign.
2. Read the affected module and its tests; follow [START_HERE.md](START_HERE.md) for setup.
3. Run relevant tests and `git diff --check`. Before a merge candidate, run `pnpm verify` and report any failure honestly.
4. Explain what changed, what was tested and what remains unproven. Maintainers handle required CI and protected-main merging.

Use a short-lived PR branch (or the agreed fork workflow), not a persistent agent/campaign branch. Delete the branch after merge. Never bypass protection or force-push over a reviewed SHA.

## Semantic and evidence-sensitive changes

Schema, fingerprint/canonicalization, parser scoring, protected data and safety changes need an independently reviewed candidate and appropriate compatibility tests. Preserve source evidence, version meaning-changing contracts, and keep implementation changes separate from protected evaluation data.

A faster renderer is not a compression success unless a named tokenizer and downstream task evaluation support it. A schema-valid candidate is not automatically a correct interpretation. An agent review is not a human/native-speaker review.

## Maintainer-run automation

Only managed agents and orchestration processes need the full [operating model](docs/REPOSITORY_OPERATING_MODEL.md) and [AGENTS.md](AGENTS.md). Assignment files, worker budgets and dispatcher locks govern that automation; they are not a barrier to public feedback. Core review and CI requirements still apply to everyone proposing changes.
