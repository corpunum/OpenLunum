# OpenClaw adoption profile

**Status:** Design.

Preferred split:

- A `SKILL.md` can teach an OpenClaw agent how to inspect or invoke Lunum tools.
- A native extension, service, or product-level memory adapter is required for real persistence/context integration.
- A text skill alone must not be described as full Lunum adoption.

Because OpenClaw is persistent, tool-capable, and highly privileged, treat imported skills, source memories, and any Lunum sidecar service as untrusted boundaries. Use strict allowlists and retain original evidence.

Official references:
- https://github.com/openclaw/openclaw
- https://docs.openclaw.ai/tools/skills
