#!/usr/bin/env bash
# schema-drift-check.sh — CI integration for schema-to-TypeScript drift checking.
#
# This script is called from CI (and locally) to ensure that:
# 1. Generated types are in sync with schemas/
# 2. The generated types compile
# 3. Positive and negative conformance fixtures pass/fail as expected
#
# Exit 0 = no drift, everything clean.
# Exit 1 = drift detected or compilation failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Schema-to-TypeScript Drift Check ==="

# Step 1: Generate types in dry-run mode
echo "[1/3] Generating types and checking for drift..."
cd "$ROOT_DIR"
if ! npx ts-node scripts/schema-to-ts.ts --dry-run 2>&1; then
  echo "[FAIL] Drift detected. Run 'ts-node scripts/schema-to-ts.ts' to regenerate."
  exit 1
fi

# Step 2: Verify generated types compile
echo "[2/3] Verifying generated types compile..."
cd "$ROOT_DIR"
if ! npx tsc --noEmit --skipLibCheck packages/core/src/types-schema.ts 2>&1; then
  echo "[FAIL] Generated types do not compile."
  exit 1
fi

# Step 3: Run conformance fixtures
echo "[3/3] Running conformance fixtures..."
cd "$ROOT_DIR"
if ! node --test packages/core/test/schema-conformance.test.js 2>&1; then
  echo "[FAIL] Conformance fixtures failed."
  exit 1
fi

echo "=== Drift check PASSED ==="
exit 0
