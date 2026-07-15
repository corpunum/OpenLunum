# Pi adoption profile

**Status:** Design, based on the current Pi Agent Harness repository and its extensible TypeScript packages.

Preferred options:

- TypeScript extension importing `@corpunum/lunum`.
- Agent-loop integration at message/context boundaries.
- Optional MCP or CLI bridge if package coupling is undesirable.

Pi runs with the launching user's permissions unless separately sandboxed. A Lunum extension must not expand its privileges and should be tested in a container or other isolation where appropriate.

Official project:
- https://github.com/earendil-works/pi
