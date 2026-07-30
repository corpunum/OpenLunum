/**
 * Agent-State Frozen Schema (v1.0)
 *
 * Defines the canonical frozen schema for agent-state/1.0.
 * This schema captures the structure as of the initial freeze and
 * provides validation and migration capabilities.
 */

import type {
  AgentState,
  AgentRole,
  StepStatus,
  ToolCallKind,
  ConstraintKind,
  HandoffDirection,
  AgentPlanStep,
  AgentToolCall,
  AgentToolResult,
  AgentConstraint,
  AgentEvidence,
  AgentHandoff,
} from './agent-state.js';

export const AGENT_STATE_FROZEN_VERSION = 'agent-state/1.0' as const;

/**
 * JSON Schema for agent-state/1.0.
 * Defines the canonical structure, required fields, and constraints.
 */
export const AGENT_STATE_FROZEN_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Agent State v1.0',
  description: 'Frozen schema for agent-state/1.0',
  type: 'object',
  required: [
    'stateVersion',
    'planId',
    'planName',
    'agentId',
    'role',
    'steps',
    'constraints',
    'evidence',
    'handoffs',
    'updatedAt',
  ],
  properties: {
    stateVersion: {
      type: 'string',
      enum: ['agent-state/1.0', 'agent-state/0.1'],
      description: 'Version of the agent-state schema',
    },
    planId: {
      type: 'string',
      minLength: 1,
      description: 'Unique identifier for the plan',
    },
    planName: {
      type: 'string',
      description: 'Human-readable name for the plan',
    },
    agentId: {
      type: 'string',
      minLength: 1,
      description: 'Identifier of the owning agent',
    },
    role: {
      type: 'string',
      enum: ['orchestrator', 'worker', 'reviewer', 'auditor'],
      description: 'Role of the agent',
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'status', 'toolCalls', 'results', 'constraints', 'agentId'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'Step identifier',
          },
          description: {
            type: 'string',
            description: 'Step description',
          },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'abandoned'],
            description: 'Current status of the step',
          },
          toolCalls: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'id', 'name', 'arguments', 'timestamp', 'agentId'],
              properties: {
                kind: {
                  type: 'string',
                  enum: ['function', 'http', 'rpc', 'local', 'unknown'],
                  description: 'Kind of tool call',
                },
                id: {
                  type: 'string',
                  minLength: 1,
                  description: 'Tool call identifier',
                },
                name: {
                  type: 'string',
                  minLength: 1,
                  description: 'Tool/function name',
                },
                arguments: {
                  type: 'object',
                  description: 'Arguments passed to the tool',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of the call',
                },
                agentId: {
                  type: 'string',
                  minLength: 1,
                  description: 'ID of the agent making the call',
                },
              },
              additionalProperties: false,
            },
            description: 'Tool calls made during this step',
          },
          results: {
            type: 'array',
            items: {
              type: 'object',
              required: ['callId', 'success', 'value', 'timestamp'],
              properties: {
                callId: {
                  type: 'string',
                  minLength: 1,
                  description: 'ID of the corresponding tool call',
                },
                success: {
                  type: 'boolean',
                  description: 'Whether the call succeeded',
                },
                value: {
                  description: 'Result value',
                },
                error: {
                  type: 'string',
                  description: 'Error message if unsuccessful',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of the result',
                },
              },
              additionalProperties: false,
            },
            description: 'Results from tool calls',
          },
          constraints: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'description', 'value'],
              properties: {
                kind: {
                  type: 'string',
                  enum: ['budget', 'deadline', 'precedence', 'auth', 'custom'],
                  description: 'Constraint kind',
                },
                description: {
                  type: 'string',
                  description: 'Constraint description',
                },
                value: {
                  description: 'Constraint value',
                },
              },
              additionalProperties: false,
            },
            description: 'Constraints on this step',
          },
          startedAt: {
            type: 'string',
            format: 'date-time',
            description: 'When the step started',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
            description: 'When the step completed',
          },
          agentId: {
            type: 'string',
            minLength: 1,
            description: 'ID of the agent executing this step',
          },
        },
        additionalProperties: false,
      },
      description: 'Steps in the plan',
    },
    constraints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'description', 'value'],
        properties: {
          kind: {
            type: 'string',
            enum: ['budget', 'deadline', 'precedence', 'auth', 'custom'],
            description: 'Constraint kind',
          },
          description: {
            type: 'string',
            description: 'Constraint description',
          },
          value: {
            description: 'Constraint value',
          },
        },
        additionalProperties: false,
      },
      description: 'Plan-level constraints',
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'source', 'content', 'timestamp', 'agentId'],
        properties: {
          type: {
            type: 'string',
            description: 'Evidence type',
          },
          source: {
            type: 'string',
            description: 'Evidence source',
          },
          content: {
            description: 'Evidence content',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When evidence was collected',
          },
          agentId: {
            type: 'string',
            minLength: 1,
            description: 'ID of the agent that collected evidence',
          },
        },
        additionalProperties: false,
      },
      description: 'Evidence attached to the plan',
    },
    handoffs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fromAgent', 'toAgent', 'direction', 'payload', 'timestamp'],
        properties: {
          fromAgent: {
            type: 'string',
            minLength: 1,
            description: 'Source agent ID',
          },
          toAgent: {
            type: 'string',
            minLength: 1,
            description: 'Target agent ID',
          },
          direction: {
            type: 'string',
            enum: ['outbound', 'inbound'],
            description: 'Direction of the handoff',
          },
          payload: {
            type: 'object',
            description: 'Handoff payload',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When the handoff occurred',
          },
        },
        additionalProperties: false,
      },
      description: 'Inter-agent handoffs',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'When this state was last updated',
    },
  },
  additionalProperties: false,
} as const;

/**
 * Validates an AgentState against the frozen schema.
 * Returns validation result with any errors found.
 */
export function validateAgentStateSchema(state: unknown): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!state || typeof state !== 'object') {
    errors.push('state must be an object');
    return { ok: false, errors };
  }

  const s = state as Record<string, unknown>;

  // Required fields
  if (!s.stateVersion || typeof s.stateVersion !== 'string') {
    errors.push('missing or invalid stateVersion');
  } else if (s.stateVersion !== 'agent-state/1.0' && s.stateVersion !== 'agent-state/0.1') {
    errors.push(`invalid stateVersion: ${s.stateVersion}`);
  }

  if (!s.planId || typeof s.planId !== 'string' || s.planId.length === 0) {
    errors.push('missing or invalid planId');
  }

  if (!s.planName || typeof s.planName !== 'string') {
    errors.push('missing or invalid planName');
  }

  if (!s.agentId || typeof s.agentId !== 'string' || s.agentId.length === 0) {
    errors.push('missing or invalid agentId');
  }

  if (!s.role || typeof s.role !== 'string') {
    errors.push('missing or invalid role');
  } else {
    const validRoles = new Set(['orchestrator', 'worker', 'reviewer', 'auditor']);
    if (!validRoles.has(s.role)) {
      errors.push(`invalid role: ${s.role}`);
    }
  }

  if (!s.updatedAt || typeof s.updatedAt !== 'string') {
    errors.push('missing or invalid updatedAt');
  }

  // Arrays
  if (!Array.isArray(s.steps)) {
    errors.push('steps must be an array');
  } else {
    const validStatuses = new Set(['pending', 'running', 'completed', 'failed', 'abandoned']);
    const validToolKinds = new Set(['function', 'http', 'rpc', 'local', 'unknown']);

    for (let i = 0; i < s.steps.length; i++) {
      const step = s.steps[i];
      if (!step || typeof step !== 'object') {
        errors.push(`step[${i}] must be an object`);
        continue;
      }

      const st = step as Record<string, unknown>;

      if (!st.id || typeof st.id !== 'string' || (st.id as string).length === 0) {
        errors.push(`step[${i}] missing or invalid id`);
      }

      if (!st.description || typeof st.description !== 'string') {
        errors.push(`step[${i}] missing or invalid description`);
      }

      if (!st.status || typeof st.status !== 'string') {
        errors.push(`step[${i}] missing or invalid status`);
      } else if (!validStatuses.has(st.status)) {
        errors.push(`step[${i}] invalid status: ${st.status}`);
      }

      if (!st.agentId || typeof st.agentId !== 'string' || (st.agentId as string).length === 0) {
        errors.push(`step[${i}] missing or invalid agentId`);
      }

      if (!Array.isArray(st.toolCalls)) {
        errors.push(`step[${i}] toolCalls must be an array`);
      } else {
        for (let j = 0; j < st.toolCalls.length; j++) {
          const tc = st.toolCalls[j];
          if (!tc || typeof tc !== 'object') {
            errors.push(`step[${i}].toolCalls[${j}] must be an object`);
            continue;
          }

          const t = tc as Record<string, unknown>;

          if (!t.kind || typeof t.kind !== 'string' || !validToolKinds.has(t.kind)) {
            errors.push(`step[${i}].toolCalls[${j}] invalid kind`);
          }

          if (!t.id || typeof t.id !== 'string' || (t.id as string).length === 0) {
            errors.push(`step[${i}].toolCalls[${j}] missing or invalid id`);
          }

          if (!t.name || typeof t.name !== 'string' || (t.name as string).length === 0) {
            errors.push(`step[${i}].toolCalls[${j}] missing or invalid name`);
          }

          if (typeof t.arguments !== 'object' || t.arguments === null) {
            errors.push(`step[${i}].toolCalls[${j}] invalid arguments`);
          }

          if (!t.timestamp || typeof t.timestamp !== 'string') {
            errors.push(`step[${i}].toolCalls[${j}] missing or invalid timestamp`);
          }

          if (!t.agentId || typeof t.agentId !== 'string' || (t.agentId as string).length === 0) {
            errors.push(`step[${i}].toolCalls[${j}] missing or invalid agentId`);
          }
        }
      }

      if (!Array.isArray(st.results)) {
        errors.push(`step[${i}] results must be an array`);
      } else {
        for (let j = 0; j < st.results.length; j++) {
          const r = st.results[j];
          if (!r || typeof r !== 'object') {
            errors.push(`step[${i}].results[${j}] must be an object`);
            continue;
          }

          const res = r as Record<string, unknown>;

          if (!res.callId || typeof res.callId !== 'string' || (res.callId as string).length === 0) {
            errors.push(`step[${i}].results[${j}] missing or invalid callId`);
          }

          if (typeof res.success !== 'boolean') {
            errors.push(`step[${i}].results[${j}] missing or invalid success`);
          }

          if (!res.timestamp || typeof res.timestamp !== 'string') {
            errors.push(`step[${i}].results[${j}] missing or invalid timestamp`);
          }
        }
      }

      if (!Array.isArray(st.constraints)) {
        errors.push(`step[${i}] constraints must be an array`);
      } else {
        const validKinds = new Set(['budget', 'deadline', 'precedence', 'auth', 'custom']);
        for (let j = 0; j < st.constraints.length; j++) {
          const c = st.constraints[j];
          if (!c || typeof c !== 'object') {
            errors.push(`step[${i}].constraints[${j}] must be an object`);
            continue;
          }

          const con = c as Record<string, unknown>;

          if (!con.kind || typeof con.kind !== 'string' || !validKinds.has(con.kind)) {
            errors.push(`step[${i}].constraints[${j}] invalid kind`);
          }

          if (!con.description || typeof con.description !== 'string') {
            errors.push(`step[${i}].constraints[${j}] missing or invalid description`);
          }
        }
      }
    }
  }

  if (!Array.isArray(s.constraints)) {
    errors.push('constraints must be an array');
  }

  if (!Array.isArray(s.evidence)) {
    errors.push('evidence must be an array');
  } else {
    for (let i = 0; i < s.evidence.length; i++) {
      const e = s.evidence[i];
      if (!e || typeof e !== 'object') {
        errors.push(`evidence[${i}] must be an object`);
        continue;
      }

      const ev = e as Record<string, unknown>;

      if (!ev.type || typeof ev.type !== 'string') {
        errors.push(`evidence[${i}] missing or invalid type`);
      }

      if (!ev.source || typeof ev.source !== 'string') {
        errors.push(`evidence[${i}] missing or invalid source`);
      }

      if (!ev.timestamp || typeof ev.timestamp !== 'string') {
        errors.push(`evidence[${i}] missing or invalid timestamp`);
      }

      if (!ev.agentId || typeof ev.agentId !== 'string' || (ev.agentId as string).length === 0) {
        errors.push(`evidence[${i}] missing or invalid agentId`);
      }
    }
  }

  if (!Array.isArray(s.handoffs)) {
    errors.push('handoffs must be an array');
  } else {
    const validDirections = new Set(['outbound', 'inbound']);
    for (let i = 0; i < s.handoffs.length; i++) {
      const h = s.handoffs[i];
      if (!h || typeof h !== 'object') {
        errors.push(`handoffs[${i}] must be an object`);
        continue;
      }

      const hoff = h as Record<string, unknown>;

      if (!hoff.fromAgent || typeof hoff.fromAgent !== 'string' || (hoff.fromAgent as string).length === 0) {
        errors.push(`handoffs[${i}] missing or invalid fromAgent`);
      }

      if (!hoff.toAgent || typeof hoff.toAgent !== 'string' || (hoff.toAgent as string).length === 0) {
        errors.push(`handoffs[${i}] missing or invalid toAgent`);
      }

      if (!hoff.direction || typeof hoff.direction !== 'string' || !validDirections.has(hoff.direction)) {
        errors.push(`handoffs[${i}] invalid direction`);
      }

      if (typeof hoff.payload !== 'object' || hoff.payload === null) {
        errors.push(`handoffs[${i}] invalid payload`);
      }

      if (!hoff.timestamp || typeof hoff.timestamp !== 'string') {
        errors.push(`handoffs[${i}] missing or invalid timestamp`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Migrates an agent state from version 0.1 to 1.0.
 * In this initial freeze, no structural changes are needed,
 * so we simply update the version.
 */
export function migrateAgentState01to10(state: AgentState): AgentState {
  return {
    ...state,
    stateVersion: AGENT_STATE_FROZEN_VERSION,
  };
}

// Re-export all types from agent-state
export type {
  AgentState,
  AgentRole,
  StepStatus,
  ToolCallKind,
  ConstraintKind,
  HandoffDirection,
  AgentPlanStep,
  AgentToolCall,
  AgentToolResult,
  AgentConstraint,
  AgentEvidence,
  AgentHandoff,
} from './agent-state.js';
