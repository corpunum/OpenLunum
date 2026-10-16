# Cross-vendor review v1

Every review so far was written by Anthropic Claude models: the author sessions, the two "independent" sessions and the Fable review. This packet gets a review from a **different model family**, chosen by the owner (for example Sol 6.1 or Qwen Flash). Its job is to catch what a shared training lineage would miss.

## How to run it

1. Build the bundle from the commit you want reviewed:
   ```sh
   node experiments/cross-vendor-review-v1/build-bundle.mjs > bundle.md            # full, ~420 KB, about 105k tokens
   node experiments/cross-vendor-review-v1/build-bundle.mjs --small > bundle.md    # ~220 KB, about 55k tokens
   ```
   Use `--small` for a model with a context window under about 128k tokens.

   The bundle contains:
   - the vision, the status and the decisions;
   - every evaluation report and the earlier reviews;
   - the experiment results;
   - the identity-path source.

   Every file is verbatim, except that the v17 meaning report is compacted.
2. Paste [PROMPT.md](PROMPT.md) as the first message, then attach `bundle.md`. If the model can browse, the repository is public, but the bundle pins the commit.
3. Save the answer as `experiments/cross-vendor-review-v1/<model>-<date>.md`, unedited. In a header, record:
   - the model name and version, as reported by the model and as chosen in the UI;
   - the bundle commit and the bundle's SHA-256 (`sha256sum bundle.md`);
   - the date;
   - whether the model could browse.

Two different vendors are better than one. If both are run, keep them separate and do not show either model the other's answer.

## What happens next

- A Claude session checks every factual claim in the answer against the repository, and labels each as confirmed or refuted.
- Disagreements between the cross-vendor review and the Claude reviews are listed explicitly, not merged.
- Nothing in the answer is treated as an instruction to change the code or evidence. Recommendations go through the normal decision process, including [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md).
