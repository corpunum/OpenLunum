/**
 * Lunum Extension for Pi/Agy
 *
 * Registers 4 Lunum tools via Pi's native defineTool API.
 * Imports @corpunum/lunum directly (no MCP roundtrip).
 *
 * Install: symlink or copy to ~/.pi/agent/extensions/openlunum-lunum.ts
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
// Absolute path import — Pi extensions load outside the pnpm workspace,
// so the @corpunum/lunum package alias doesn't resolve. This path points
// to the built dist of the core package in the OpenLunum repo.
const LUNUM_CORE = "/home/corpunum/OpenLunum/packages/core/dist/src/index.js";
const lunum = await import(LUNUM_CORE);
const {
  deriveLunumSidecar,
  compileContext,
  fingerprintSem,
  validateSem,
  renderSem,
  compareSem,
  classifyByCategory,
} = lunum;
type LunumSem = any;
type ContextMode = "natural" | "lunum" | "mixed" | "shadow_mixed";

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

const lunumDerive = defineTool({
  name: "lunum_derive",
  label: "Lunum Derive",
  description:
    "Derive a Lunum sidecar (semantic representation + fingerprint + compact code) from input text. " +
    "Without a pre-parsed Sem, uses surface telegraph (heuristic, no LLM, ~22% char savings).",
  parameters: Type.Object({
    text: Type.String({ description: "Source text to derive from" }),
    role: Type.Optional(Type.String({ description: "Message role: user, assistant, system" })),
    category: Type.Optional(Type.String({ description: "Content category for policy classification" })),
  }),
  async execute(_id, params) {
    try {
      const sidecar = deriveLunumSidecar({
        content: params.text,
        role: params.role ?? "user",
        category: params.category ?? undefined,
      });
      return ok(JSON.stringify({ success: true, sidecar }, null, 2));
    } catch (e: any) {
      return err(`lunum_derive failed: ${e.message}`);
    }
  },
});

const lunumCompileContext = defineTool({
  name: "lunum_compile_context",
  label: "Lunum Compile Context",
  description:
    "Compile conversation messages into compacted context with token counts and savings estimate. " +
    "Modes: natural, lunum, mixed, shadow_mixed.",
  parameters: Type.Object({
    messages: Type.Array(
      Type.Object({
        role: Type.String(),
        content: Type.String(),
        lunum_code: Type.Optional(Type.String()),
      }),
      { description: "Array of message objects" },
    ),
    mode: Type.Optional(
      Type.Union([
        Type.Literal("natural"),
        Type.Literal("lunum"),
        Type.Literal("mixed"),
        Type.Literal("shadow_mixed"),
      ]),
    ),
  }),
  async execute(_id, params) {
    try {
      const result = compileContext(params.messages as any[], { mode: (params.mode as ContextMode) ?? "mixed" });
      return ok(
        JSON.stringify(
          {
            success: true,
            mode: result.mode,
            naturalTokens: result.naturalTokens,
            mixedTokens: result.mixedTokens,
            ratio: result.ratio,
            estimatedSavings: `${(result.estimatedSavings * 100).toFixed(1)}%`,
            messageCount: result.selectedMessages.length,
          },
          null,
          2,
        ),
      );
    } catch (e: any) {
      return err(`lunum_compile_context failed: ${e.message}`);
    }
  },
});

const lunumFingerprint = defineTool({
  name: "lunum_fingerprint",
  label: "Lunum Fingerprint",
  description:
    "Generate a deterministic semantic fingerprint (lfp:VERSION:sha256:DIGEST) for a Lunum-Sem object.",
  parameters: Type.Object({
    sem: Type.Any({ description: "Lunum-Sem object to fingerprint" }),
  }),
  async execute(_id, params) {
    try {
      const fp = fingerprintSem(params.sem);
      return ok(JSON.stringify({ success: true, fingerprint: fp }, null, 2));
    } catch (e: any) {
      return err(`lunum_fingerprint failed: ${e.message}`);
    }
  },
});

const lunumValidate = defineTool({
  name: "lunum_validate",
  label: "Lunum Validate",
  description: "Validate a Lunum-Sem object against the frozen schema. Returns ok/errors.",
  parameters: Type.Object({
    sem: Type.Any({ description: "Lunum-Sem object to validate" }),
  }),
  async execute(_id, params) {
    try {
      const result = validateSem(params.sem);
      return ok(JSON.stringify({ success: true, valid: result.ok, errors: result.errors }, null, 2));
    } catch (e: any) {
      return err(`lunum_validate failed: ${e.message}`);
    }
  },
});

const lunumRender = defineTool({
  name: "lunum_render",
  label: "Lunum Render",
  description: "Render a Lunum-Sem to a compact code string using the default renderer profile.",
  parameters: Type.Object({
    sem: Type.Any({ description: "Lunum-Sem object to render" }),
  }),
  async execute(_id, params) {
    try {
      const result = renderSem(params.sem as LunumSem);
      return ok(JSON.stringify({ success: true, profile: result.profile, code: result.code, semantic: result.semantic }, null, 2));
    } catch (e: any) {
      return err(`lunum_render failed: ${e.message}`);
    }
  },
});

const lunumCompare = defineTool({
  name: "lunum_compare",
  label: "Lunum Compare",
  description:
    "Compare two Lunum-Sem objects: feature recall, precision, missing/extra features, hard-mismatch detection.",
  parameters: Type.Object({
    expected: Type.Any({ description: "Reference Lunum-Sem" }),
    actual: Type.Any({ description: "Lunum-Sem to compare" }),
    explain: Type.Optional(Type.Boolean({ description: "Include detailed explanation" })),
  }),
  async execute(_id, params) {
    try {
      const result = compareSem(params.expected as LunumSem, params.actual as LunumSem, {
        explain: params.explain ?? false,
      });
      return ok(JSON.stringify({ success: true, comparison: result }, null, 2));
    } catch (e: any) {
      return err(`lunum_compare failed: ${e.message}`);
    }
  },
});

const lunumClassify = defineTool({
  name: "lunum_classify",
  label: "Lunum Classify",
  description:
    "Classify content by category and return eligibility decision for Lunum compact representation.",
  parameters: Type.Object({
    category: Type.String({ description: "Content category (factual_claim, instruction, opinion, etc.)" }),
    confidence: Type.Optional(Type.Number({ description: "Parse confidence 0-1" })),
    sourceText: Type.Optional(Type.String({ description: "Original source text" })),
    semantic: Type.Optional(Type.Boolean({ description: "Whether input was semantically parsed" })),
  }),
  async execute(_id, params) {
    try {
      const result = classifyByCategory(
        params.category,
        params.confidence ?? 0.5,
        params.sourceText,
        params.semantic,
      );
      return ok(JSON.stringify({ success: true, decision: result }, null, 2));
    } catch (e: any) {
      return err(`lunum_classify failed: ${e.message}`);
    }
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(lunumDerive);
  pi.registerTool(lunumCompileContext);
  pi.registerTool(lunumFingerprint);
  pi.registerTool(lunumValidate);
  pi.registerTool(lunumRender);
  pi.registerTool(lunumCompare);
  pi.registerTool(lunumClassify);
}
