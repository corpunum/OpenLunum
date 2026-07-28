"""
Independent Python verifier for Lunum-Sem canonicalization and fingerprinting.

Reimplements the canonical form and fingerprint algorithms from scratch
(no shared code with the TypeScript implementation) to cross-check
golden vectors produced by the primary implementation.
"""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any


SEM_SCHEMA = "lunum-sem/0.1-draft"
FP_VERSION = "0.1"


def normalize_identifier(value: Any) -> str:
    s = str(value) if value is not None else ""
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    s = re.sub(r"\s+", "_", s)
    # toLocaleLowerCase('und') in JS = locale-independent lowercase
    # Python's casefold() is the closest equivalent for locale-independent lowering
    # but JS uses toLocaleLowerCase('und') which maps to ICU's undetermined locale
    # For ASCII + common Unicode, str.lower() matches JS behavior
    s = s.lower()
    return s


def normalize_text(value: Any) -> str:
    s = str(value) if value is not None else ""
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s


def is_object(value: Any) -> bool:
    return isinstance(value, dict)


def canonical_unknown(value: Any) -> Any:
    if value is None or isinstance(value, bool) or isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return normalize_text(value)
    if isinstance(value, list):
        return [canonical_unknown(item) for item in value]
    if not is_object(value):
        return str(value)

    out: dict[str, Any] = {}
    for key in sorted(value.keys()):
        item = value[key]
        # JS skips `undefined` but keeps `null`. In Python dicts, all present
        # keys are kept (there's no undefined). So we keep everything including None.
        if key in ("id", "type", "ref", "language"):
            out[key] = normalize_identifier(item)
        elif key == "value" and isinstance(item, str):
            out[key] = normalize_text(item)
        else:
            out[key] = canonical_unknown(item)
    return out


def canonical_term(term: Any) -> Any:
    return canonical_unknown(term)


def canonical_clause(clause: dict[str, Any]) -> dict[str, Any]:
    roles: dict[str, Any] = {}
    raw_roles = clause.get("roles", {}) or {}
    for key in sorted(raw_roles.keys()):
        item = raw_roles[key]
        # JS skips undefined roles but keeps null — Python dicts have no
        # undefined, so all present keys (including None values) are kept.
        roles[normalize_identifier(key)] = canonical_term(item)

    out: dict[str, Any] = {
        "predicate": normalize_identifier(clause["predicate"]),
        "roles": roles,
        "negated": clause.get("negated") is True,
    }

    modality = clause.get("modality")
    if modality is not None:
        out["modality"] = normalize_identifier(modality)

    time_val = clause.get("time")
    if time_val is not None:
        out["time"] = canonical_term(time_val)

    conditions = clause.get("conditions")
    if conditions and len(conditions) > 0:
        out["conditions"] = [canonical_clause(c) for c in conditions]

    consequences = clause.get("consequences")
    if consequences and len(consequences) > 0:
        out["consequences"] = [canonical_clause(c) for c in consequences]

    annotations = clause.get("annotations")
    if annotations and isinstance(annotations, dict) and len(annotations) > 0:
        out["annotations"] = canonical_unknown(annotations)

    return out


def canonicalize_sem(value: Any) -> dict[str, Any]:
    if not is_object(value):
        raise ValueError("sem must be an object")
    if value.get("schema") != SEM_SCHEMA:
        raise ValueError(f"schema must equal {SEM_SCHEMA}")

    out: dict[str, Any] = {
        "schema": SEM_SCHEMA,
        "world": normalize_identifier(value["world"]),
        "kind": normalize_identifier(value["kind"]),
        "clauses": [canonical_clause(c) for c in value["clauses"]],
    }

    references = value.get("references")
    if references and len(references) > 0:
        out["references"] = [canonical_term(r) for r in references]

    provenance = value.get("provenance")
    if provenance and isinstance(provenance, dict) and len(provenance) > 0:
        out["provenance"] = canonical_unknown(provenance)

    annotations = value.get("annotations")
    if annotations and isinstance(annotations, dict) and len(annotations) > 0:
        out["annotations"] = canonical_unknown(annotations)

    return out


def stable_stringify(value: Any) -> str:
    """Produce deterministic JSON with sorted keys and no whitespace.

    Must exactly match the TypeScript stableStringify:
    - null → "null"
    - bool → "true"/"false"
    - number → JSON number (no trailing .0 for integers)
    - string → JSON-escaped string
    - array → [elem,elem,...] (no spaces)
    - object → {"key":value,...} with sorted keys (no spaces)
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if isinstance(value, dict):
        entries = []
        for key in sorted(value.keys()):
            entries.append(json.dumps(key, ensure_ascii=False) + ":" + stable_stringify(value[key]))
        return "{" + ",".join(entries) + "}"
    return json.dumps(str(value))


def fingerprint_sem(sem: Any, length: int = 32) -> str:
    canonical = canonicalize_sem(sem)
    canonical_bytes = stable_stringify(canonical)
    digest = hashlib.sha256(canonical_bytes.encode("utf-8")).hexdigest()
    bounded = max(16, min(64, length))
    return f"lfp:{FP_VERSION}:sha256:{digest[:bounded]}"


def surface_fingerprint(text: Any, length: int = 24) -> str:
    s = str(text) if text is not None else ""
    s = unicodedata.normalize("NFKC", s)
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    s = s.lower()
    digest = hashlib.sha256(s.encode("utf-8")).hexdigest()
    bounded = max(16, min(64, length))
    return f"lsf:{FP_VERSION}:sha256:{digest[:bounded]}"


def verify_golden_vectors(bundle_path: str) -> dict[str, Any]:
    with open(bundle_path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    vectors = bundle["vectors"]
    discrepancies: list[dict[str, str]] = []
    pass_count = 0
    fail_ids: set[str] = set()

    for v in vectors:
        vec_id = v["id"]
        inp = v["input"]
        expected_bytes = v["canonicalBytes"]
        expected_sha = v["canonicalSha256"]
        expected_fp = v["fingerprint"]

        try:
            canonical = canonicalize_sem(inp)
            actual_bytes = stable_stringify(canonical)
            actual_sha = hashlib.sha256(actual_bytes.encode("utf-8")).hexdigest()
            actual_fp = fingerprint_sem(inp)

            if actual_bytes != expected_bytes:
                discrepancies.append({
                    "vectorId": vec_id,
                    "field": "canonicalBytes",
                    "expected": expected_bytes,
                    "actual": actual_bytes,
                })
                fail_ids.add(vec_id)

            if actual_sha != expected_sha:
                discrepancies.append({
                    "vectorId": vec_id,
                    "field": "canonicalSha256",
                    "expected": expected_sha,
                    "actual": actual_sha,
                })
                fail_ids.add(vec_id)

            if actual_fp != expected_fp:
                discrepancies.append({
                    "vectorId": vec_id,
                    "field": "fingerprint",
                    "expected": expected_fp,
                    "actual": actual_fp,
                })
                fail_ids.add(vec_id)

            # Surface fingerprint check
            if "surfaceText" in v and "surfaceFingerprint" in v:
                actual_sfp = surface_fingerprint(v["surfaceText"])
                if actual_sfp != v["surfaceFingerprint"]:
                    discrepancies.append({
                        "vectorId": vec_id,
                        "field": "surfaceFingerprint",
                        "expected": v["surfaceFingerprint"],
                        "actual": actual_sfp,
                    })
                    fail_ids.add(vec_id)

        except Exception as e:
            discrepancies.append({
                "vectorId": vec_id,
                "field": "canonicalBytes",
                "expected": expected_bytes,
                "actual": f"ERROR: {e}",
            })
            fail_ids.add(vec_id)

    pass_count = len(vectors) - len(fail_ids)

    result = {
        "schema": "openlunum-verifier-result/0.1",
        "version": "0.1.0",
        "verifiedAt": "",  # filled by caller if needed
        "totalVectors": len(vectors),
        "passCount": pass_count,
        "failCount": len(fail_ids),
        "discrepancies": discrepancies,
    }

    return result


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python lunum_verifier.py <golden-vectors.json>")
        sys.exit(1)

    bundle_path = sys.argv[1]
    result = verify_golden_vectors(bundle_path)

    print(f"Total vectors: {result['totalVectors']}")
    print(f"Pass: {result['passCount']}")
    print(f"Fail: {result['failCount']}")

    if result["discrepancies"]:
        print("\nDiscrepancies:")
        for d in result["discrepancies"]:
            print(f"  [{d['vectorId']}] {d['field']}:")
            print(f"    expected: {d['expected'][:100]}")
            print(f"    actual:   {d['actual'][:100]}")

    # Write result JSON
    out_path = Path(bundle_path).parent / "python-verifier-result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nResult written to {out_path}")

    sys.exit(0 if result["failCount"] == 0 else 1)


if __name__ == "__main__":
    main()
