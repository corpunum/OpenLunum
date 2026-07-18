# Agent-State Protocol

## Purpose

Encode plans, steps, tool calls, results, constraints, evidence, and inter-agent
handoffs in a format that can be validated, versioned, inspected, and rendered.

## Types

### Roles

| Role | Description |
|------|-------------|
| `orchestrator` | Coordinates agents, assigns steps, resolves conflicts |
| `worker` | Executes steps, makes tool calls, reports results |
| `reviewer` | Validates outputs, flags issues, requests revisions |
| `auditor` | Reads state for compliance, does not modify |

### Step Status

`pending` → `running` → `completed` | `failed` | `abandoned`

### Tool Call Kinds

`function` | `http` | `rpc` | `local` | `unknown`

### Constraint Kinds

`budget` | `deadline` | `precedence` | `auth` | `custom`

### Handoff Direction

`outbound` | `inbound`

## Schema

```typescript
interface AgentState {
  stateVersion: string;      // e.g., 'agent-state/0.1'
  planId: string;
  planName: string;
  agentId: string;
  role: AgentRole;
  steps: AgentPlanStep[];
  constraints: AgentConstraint[];
  evidence: AgentEvidence[];
  handoffs: AgentHandoff[];
  updatedAt: string;         // ISO 8601
}

interface AgentPlanStep {
  id: string;
  description: string;
  status: StepStatus;
  toolCalls: AgentToolCall[];
  results: AgentToolResult[];
  constraints: AgentConstraint[];
  startedAt?: string;
  completedAt?: string;
  agentId: string;
}

interface AgentToolCall {
  kind: ToolCallKind;
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
  agentId: string;
}

interface AgentToolResult {
  callId: string;
  success: boolean;
  value: unknown;
  error?: string;
  timestamp: string;
}

interface AgentEvidence {
  type: string;
  source: string;
  content: unknown;
  timestamp: string;
  agentId: string;
}

interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  direction: HandoffDirection;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface AgentConstraint {
  kind: ConstraintKind;
  description: string;
  value: unknown;
}
```

## Validation

All `AgentState` snapshots must pass `validateAgentState()` before being persisted
or handed off. Required fields: `stateVersion`, `planId`, `agentId`, `role`,
`updatedAt`. Steps require `id`, `description`, `status`, `agentId`.

## Integration with Lunum-Sem

Agent state is a product-layer concern, not part of `Lunum-Sem` itself. It can be
stored alongside `LunumRecord` objects using the same fingerprinting and provenance
mechanisms. Handoffs may carry `LunumSem` payloads embedded in their `payload` field.

## Implementation

See `packages/core/src/agent-state.ts` for the TypeScript types and validator.

## References

- VISION.md: "Agent-state protocol" long-term capability
- AGENTS.md: Worker agents may select scoped work and publish evidence
