# Worker Assignment Protocol

Per the `scripts/pi-task-prompt.md` protocol:

- `reports/orchestrator/WORKER_ASSIGNMENT.md` does NOT exist
- `reports/orchestrator/WORKER_ASSIGNMENT.md` is missing
- `reports/pi-loop-ally/claims.txt` lists already claimed tasks (do NOT work on those)

Per the Assignment gate rule:
> If the file is missing, incomplete, already consumed, or does not identify one open ready issue, print exactly: `IDLE: no explicit worker assignment`

**Result: IDLE**

The worker will remain idle until an explicit assignment is provided at:
`reports/orchestrator/WORKER_ASSIGNMENT.md`
