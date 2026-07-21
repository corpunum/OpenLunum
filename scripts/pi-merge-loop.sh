#!/usr/bin/env bash
set -euo pipefail

# Autonomous merge loop is disabled under Issue #276.
# Merges must be performed via explicit, one-shot maintainer/orchestrator action.
echo "DISABLED: Autonomous merge loop retired under Issue #276." >&2
exit 0

