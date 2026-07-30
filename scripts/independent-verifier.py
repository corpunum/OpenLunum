#!/usr/bin/env python3
"""
Independent Python verifier for Lunum semantic canonicalization and fingerprinting.
Uses only stdlib (hashlib, json, struct, unicodedata).

Validates that canonical bytes and fingerprints are computed identically to the
TypeScript implementation in packages/core/src/canonicalize.ts and fingerprint.ts.
"""

import sys
import json
import hashlib
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional


# Constants matching TypeScript
SEM_SCHEMA = "lunum-sem/0.1-draft"
FP_VERSION = "0.1"


def normalize_identifier(value: Any) -> str:
    """
    Normalize an identifier following TypeScript normalizeIdentifier:
    - Convert to string (empty string if null/None)
    - Normalize NFKC Unicode form
    - Trim whitespace
    - Replace multiple spaces with single underscore
    - Convert to lowercase (und locale, but Python lowercase is close enough)
    """
    s = str(value or "")
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    # Replace sequences of whitespace with underscore
    import re
    s = re.sub(r"\s+", "_", s)
    s = s.lower()
    return s


def normalize_text(value: Any) -> str:
    """
    Normalize text following TypeScript normalizeText:
    - Convert to string (empty string if null/None)
    - Normalize NFKC Unicode form
    - Trim whitespace
    - Replace multiple spaces with single space
    """
    s = str(value or "")
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    import re
    s = re.sub(r"\s+", " ", s)
    return s


def is_object(value: Any) -> bool:
    """Check if value is a dict (but not a list)."""
    return isinstance(value, dict) and not isinstance(value, list)


def canonical_unknown(value: Any) -> Any:
    """
    Recursively canonicalize an unknown value following TypeScript logic.
    """
    if value is None or isinstance(value, bool) or isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return normalize_text(value)
    if isinstance(value, list):
        return [canonical_unknown(item) for item in value]
    if not is_object(value):
        return str(value)

    # Process object: sort keys and canonicalize values
    out = {}
    for key in sorted(value.keys()):
        item = value[key]
        if item is None:  # Skip undefined (None in Python)
            continue
        if key in ("id", "type", "ref", "language"):
            out[key] = normalize_identifier(item)
        elif key == "value" and isinstance(item, str):
            out[key] = normalize_text(item)
        else:
            out[key] = canonical_unknown(item)
    return out


def canonical_term(term: Any) -> Any:
    """Canonicalize a term (can be primitive, object, or array)."""
    return canonical_unknown(term)


def canonical_clause(clause: Dict[str, Any]) -> Dict[str, Any]:
    """Canonicalize a clause following TypeScript logic."""
    # Process roles with sorted keys
    roles = {}
    clause_roles = clause.get("roles") or {}
    for key in sorted(clause_roles.keys()):
        item = clause_roles[key]
        if item is not None:
            roles[normalize_identifier(key)] = canonical_term(item)

    # Build clause object with fields added in an order that will be sorted correctly
    out = {}

    # Add fields in a way that stableStringify will output them sorted
    if clause.get("annotations") and len(clause.get("annotations", {})) > 0:
        out["annotations"] = canonical_unknown(clause.get("annotations"))
    if clause.get("conditions"):
        out["conditions"] = [canonical_clause(c) for c in clause.get("conditions", [])]
    if clause.get("consequences"):
        out["consequences"] = [canonical_clause(c) for c in clause.get("consequences", [])]

    out["modality"] = normalize_identifier(clause.get("modality")) if clause.get("modality") is not None else None
    out["negated"] = clause.get("negated") is True
    out["predicate"] = normalize_identifier(clause.get("predicate", ""))
    out["roles"] = roles

    if clause.get("time") is not None:
        out["time"] = canonical_term(clause.get("time"))

    # Remove None values for modality
    if out.get("modality") is None:
        del out["modality"]

    return out


def canonicalize_sem(value: Any) -> Dict[str, Any]:
    """
    Canonicalize a Lunum semantic structure following TypeScript validation
    and canonicalization logic.
    """
    if not is_object(value):
        raise TypeError("sem must be an object")

    if value.get("schema") != SEM_SCHEMA:
        raise TypeError(f"schema must equal {SEM_SCHEMA}")
    if not str(value.get("world", "")).strip():
        raise TypeError("world is required")
    if not str(value.get("kind", "")).strip():
        raise TypeError("kind is required")

    clauses = value.get("clauses", [])
    if not isinstance(clauses, list) or len(clauses) == 0:
        raise TypeError("clauses must be a non-empty array")

    out = {
        "schema": SEM_SCHEMA,
        "world": normalize_identifier(value.get("world")),
        "kind": normalize_identifier(value.get("kind")),
        "clauses": [canonical_clause(c) for c in clauses]
    }

    references = value.get("references")
    if references and len(references) > 0:
        out["references"] = [canonical_term(ref) for ref in references]

    provenance = value.get("provenance")
    if provenance and len(provenance) > 0:
        out["provenance"] = canonical_unknown(provenance)

    annotations = value.get("annotations")
    if annotations and len(annotations) > 0:
        out["annotations"] = canonical_unknown(annotations)

    return out


def stable_stringify(value: Any) -> str:
    """
    Serialize to a stable JSON string with sorted object keys.
    Matches TypeScript stableStringify implementation.
    """
    if value is None or not isinstance(value, dict):
        return json.dumps(value, separators=(',', ':'), ensure_ascii=False)

    if isinstance(value, list):
        items = [stable_stringify(v) for v in value]
        return "[" + ",".join(items) + "]"

    # Process dict with sorted keys
    entries = []
    for key in sorted(value.keys()):
        key_json = json.dumps(key, ensure_ascii=False)
        val_json = stable_stringify(value[key])
        entries.append(f"{key_json}:{val_json}")

    return "{" + ",".join(entries) + "}"


def fingerprint_sem(sem: Any, length: Optional[int] = None) -> str:
    """
    Compute fingerprint of a semantic structure.
    Returns format: lfp:0.1:sha256:<digest>
    """
    canonical = canonicalize_sem(sem)
    stringified = stable_stringify(canonical)

    # Hash with SHA256
    digest_hex = hashlib.sha256(stringified.encode("utf-8")).hexdigest()

    # Bound the length
    if length is None:
        length = 32
    length = max(16, min(64, int(length)))

    return f"lfp:{FP_VERSION}:sha256:{digest_hex[:length]}"


def verify_vector(vector: Dict[str, Any], index: int) -> tuple[bool, Optional[str]]:
    """
    Verify a single golden vector.
    Returns (success: bool, error_message: Optional[str])
    """
    try:
        sem = vector.get("sem")
        expected_canonical_json = vector.get("canonicalJson")
        expected_fingerprint = vector.get("fingerprint")
        expected_digest = vector.get("digest")

        # Compute canonical
        canonical = canonicalize_sem(sem)
        canonical_json = stable_stringify(canonical)

        # Check canonical JSON if provided
        if expected_canonical_json:
            if canonical_json != expected_canonical_json:
                return False, f"Vector {index}: canonical JSON mismatch\nExpected: {expected_canonical_json[:200]}...\nGot: {canonical_json[:200]}..."

        # Check digest (SHA256 hex)
        if expected_digest:
            digest = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
            if digest != expected_digest:
                return False, f"Vector {index}: digest mismatch (expected {expected_digest[:16]}..., got {digest[:16]}...)"

        # Compute and check fingerprint
        if expected_fingerprint:
            computed_fp = fingerprint_sem(sem)
            if computed_fp != expected_fingerprint:
                return False, f"Vector {index}: fingerprint mismatch\nExpected: {expected_fingerprint}\nGot: {computed_fp}"

        return True, None

    except Exception as e:
        return False, f"Vector {index}: exception during verification: {str(e)}"


def main():
    """Load golden vectors and verify each one."""
    # Determine the path to golden vectors
    script_dir = Path(__file__).parent.parent
    golden_path = script_dir / "packages" / "core" / "test" / "fixtures" / "canonical-golden-vectors.json"

    if not golden_path.exists():
        print(f"Error: Golden vectors file not found at {golden_path}")
        return 1

    try:
        with open(golden_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading golden vectors: {e}")
        return 1

    vectors = data.get("vectors", [])
    if not vectors:
        print("Error: No vectors found in golden vectors file")
        return 1

    failed = []
    for i, vector in enumerate(vectors):
        success, error = verify_vector(vector, i)
        if not success:
            failed.append(error)
            print(f"FAIL: {error}")
        else:
            print(f"PASS: Vector {i} ({vector.get('description', 'no description')})")

    if failed:
        print(f"\n{len(failed)} vector(s) failed verification")
        return 1

    print(f"\nAll {len(vectors)} vectors passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
