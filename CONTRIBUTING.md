# Contributing and reporting problems

OpenLunum is a public, pre-1.0 research repository whose original code is licensed under **Apache-2.0**. See [LICENSE](LICENSE) and [LICENSE.md](LICENSE.md) for the terms and third-party scope. No separate permission is required for uses the license permits.

## Contribution terms

Contributions intentionally submitted for inclusion are governed by section 5 of Apache-2.0 unless explicitly stated otherwise or covered by a separate agreement. This is a license grant, not a copyright assignment. Submit only material you have the right to contribute; identify third-party sources, licenses and attribution. Do not assume public datasets or model weights share the code license. Flag unclear rights before inclusion.

## Questions, bug reports and small suggestions

Open a GitHub issue. Include the command/input, expected behavior, observed output, Node version and commit when relevant. A minimal example is more useful than a readiness score. Do not include secrets or personal source data.

No `WORKER_ASSIGNMENT.md`, agent dispatcher, prescribed eight-document reading order, or maintainer assignment is needed to read the project or report a problem.

## An agreed code or documentation change

1. Keep one focused change and link the relevant discussion. A typo or broken link does not need a research campaign.
2. Read the affected module and its tests; follow [START_HERE.md](START_HERE.md) for setup.
3. Run relevant tests and `git diff --check`. Before a merge candidate, run `pnpm verify` and report any failure honestly.
4. Explain what changed, what was tested and what remains unproven.

External contributors open a pull request from a fork or a short-lived branch; a maintainer lands it on `main`. The maintainers themselves work trunk-based on `main` ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)). Never force-push over published history.

## Semantic and evidence-sensitive changes

Schema, fingerprint/canonicalization, parser scoring, protected data and safety changes need explicit review (labelled as self-review when the author is the only reviewer) and appropriate compatibility tests. Preserve source evidence, version meaning-changing contracts, and keep implementation changes separate from protected evaluation data.

A faster renderer is not a compression success unless a named tokenizer and downstream task evaluation support it. A schema-valid candidate is not automatically a correct interpretation. An agent review is not a human/native-speaker review.

## Maintainer-run automation

Agents follow [AGENTS.md](AGENTS.md) and the trunk-based [operating model](docs/REPOSITORY_OPERATING_MODEL.md). External contributors can still open issues and pull requests; CI requirements apply to everyone.
