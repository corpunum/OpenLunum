#!/usr/bin/env bash
set -euo pipefail

# verify-audit-endpoints.sh — fail-closed endpoint identity verification
# Issue #322: Probes model endpoints, verifies model availability, captures server version,
# confirms preset configuration, and records latency for audit trail.
#
# Usage: verify-audit-endpoints.sh --out <report-path> <profile1.json> [profile2.json] ...

REPO="${REPO:-/home/corpunum/OpenLunum}"
MODELS_PRESET="${MODELS_PRESET:-/home/corpunum/models-preset.ini}"
OUT_PATH=""
HASH_WEIGHTS=false
PROFILES=()
EXIT_CODE=0

# ---- Logging and output helpers -------------------------------------------
log_error() {
  echo "[ERROR] $*" >&2
}

log_info() {
  echo "[INFO] $*" >&2
}

# ---- Argument parsing -----------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --out)
        OUT_PATH="$2"
        shift 2
        ;;
      --hash-weights)
        HASH_WEIGHTS=true
        shift
        ;;
      *)
        PROFILES+=("$1")
        shift
        ;;
    esac
  done

  if [[ -z "$OUT_PATH" ]]; then
    log_error "Missing required --out flag"
    exit 1
  fi

  if [[ ${#PROFILES[@]} -eq 0 ]]; then
    log_error "No profile paths provided"
    exit 1
  fi
}

# ---- JSON parsing helper --------------------------------------------------
# Extract a field from JSON using python3
json_get() {
  local json="$1" field="$2" default="${3:-}"
  python3 -c "
import json, sys
try:
  data = json.loads('''$json''')
  value = data.get('$field', '$default')
  print(value if value else '$default')
except:
  print('$default')
" 2>/dev/null || echo "$default"
}

# ---- INI file parsing helper ----------------------------------------------
# Extract a section from models-preset.ini
get_ini_section() {
  local ini_file="$1" section="$2"
  local in_section=0
  local section_content=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Check for section header (matches [anything])
    if [[ "$line" =~ ^\[.+\] ]]; then
      # Extract section name without brackets
      section_name="${line#[}"
      section_name="${section_name%]}"
      if [[ "$section_name" == "$section" ]]; then
        in_section=1
        continue
      elif [[ $in_section -eq 1 ]]; then
        # End of our section, stop processing
        break
      fi
    fi

    # Collect lines from our section
    if [[ $in_section -eq 1 ]]; then
      section_content+="$line"$'\n'
    fi
  done < "$ini_file"

  echo -n "$section_content"
}

# ---- Model weight verification helpers -----------------------------------
# Extract model gguf path from models-preset.ini section
get_model_path() {
  local ini_file="$1" model_id="$2"
  local section_content=$(get_ini_section "$ini_file" "$model_id")

  if [[ -z "$section_content" ]]; then
    echo ""
    return
  fi

  # Extract the first 'model = /path' line
  echo "$section_content" | grep "^model = " | head -1 | cut -d' ' -f3-
}

# Get file size in bytes
get_file_size() {
  local path="$1"
  if [[ -f "$path" ]]; then
    stat -c%s "$path" 2>/dev/null || echo ""
  fi
}

# Get file modification time as unix epoch
get_file_mtime() {
  local path="$1"
  if [[ -f "$path" ]]; then
    stat -c%Y "$path" 2>/dev/null || echo ""
  fi
}

# Hash a file with SHA256 (only call once per file to minimize I/O)
hash_file_sha256() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  sha256sum "$path" 2>/dev/null | cut -d' ' -f1 || echo ""
}

# Verify model weights exist and get their info
verify_model_weights() {
  local model_id="$1" hash_requested="$2"
  local model_path file_size file_mtime file_hash

  # Resolve the model path from preset
  model_path=$(get_model_path "$MODELS_PRESET" "$model_id")

  if [[ -z "$model_path" ]]; then
    log_error "Model path not found in preset for: $model_id"
    return 1
  fi

  # Hard fail if model file doesn't exist
  if [[ ! -f "$model_path" ]]; then
    log_error "Model weights file not found: $model_path"
    return 1
  fi

  log_info "  Model path: $model_path"

  # Get file metadata
  file_size=$(get_file_size "$model_path")
  file_mtime=$(get_file_mtime "$model_path")

  if [[ -z "$file_size" ]] || [[ -z "$file_mtime" ]]; then
    log_error "Failed to read file metadata for: $model_path"
    return 1
  fi

  log_info "  File size: $file_size bytes"
  log_info "  File mtime: $file_mtime"

  # Hash if requested
  if [[ "$hash_requested" == "true" ]]; then
    log_info "  Computing SHA-256 (this may take several minutes)..."
    file_hash=$(hash_file_sha256 "$model_path")
    if [[ -z "$file_hash" ]]; then
      log_error "Failed to compute file hash for: $model_path"
      return 1
    fi
    log_info "  SHA-256: $file_hash"
  else
    file_hash="N/A (not requested)"
  fi

  # Return results as JSON object
  cat <<EOF
{
  "model_path": $(echo -n "$model_path" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))"),
  "file_size_bytes": $file_size,
  "file_mtime": $file_mtime,
  "file_sha256": $(echo -n "$file_hash" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
}
EOF
}

# ---- API request helpers --------------------------------------------------
# Make a curl request and return response or N/A on failure
api_call() {
  local url="$1" timeout="${2:-10}"
  local response
  response=$(curl -s -m "$timeout" "$url" 2>/dev/null || echo "")
  if [[ -z "$response" ]]; then
    echo "N/A"
  else
    echo "$response"
  fi
}

# ---- Verify a single profile -----------------------------------------------
verify_profile() {
  local profile_path="$1"
  local hash_requested="$2"
  local profile_json=""
  local base_url="N/A"
  local model_id="N/A"
  local models_response="N/A"
  local version_info="N/A"
  local build_info="N/A"
  local preset_section="N/A"
  local probe_request=""
  local probe_response=""
  local probe_latency="N/A"
  local model_path="N/A"
  local file_size_bytes="N/A"
  local file_mtime="N/A"
  local file_sha256="N/A (not requested)"
  local model_present=false
  local profile_ok=true

  log_info "Verifying profile: $profile_path"

  # Read profile JSON
  if [[ ! -f "$profile_path" ]]; then
    log_error "Profile not found: $profile_path"
    profile_ok=false
  elif [[ ! -r "$profile_path" ]]; then
    log_error "Profile not readable: $profile_path"
    profile_ok=false
  else
    profile_json=$(cat "$profile_path" 2>/dev/null || echo "")
    if [[ -z "$profile_json" ]]; then
      log_error "Failed to read profile: $profile_path"
      profile_ok=false
    else
      # Extract baseUrl and model
      base_url=$(json_get "$profile_json" "baseUrl" "" 2>/dev/null || echo "N/A")
      model_id=$(json_get "$profile_json" "model" "" 2>/dev/null || echo "N/A")

      if [[ "$base_url" == "N/A" ]] || [[ "$model_id" == "N/A" ]] || [[ -z "$base_url" ]] || [[ -z "$model_id" ]]; then
        log_error "Invalid profile: missing or invalid baseUrl or model"
        profile_ok=false
      else
        log_info "  baseUrl: $base_url"
        log_info "  model: $model_id"

        # Step 1: Check /v1/models endpoint for model presence
        local models_url="$base_url/models"
        log_info "  Probing /v1/models endpoint..."
        models_response=$(api_call "$models_url" 10)

        if [[ "$models_response" == "N/A" ]]; then
          log_error "Failed to connect to /v1/models"
          profile_ok=false
        else
          # Check if model id is present in the response
          if echo "$models_response" | grep -q "\"id\".*\"$model_id\""; then
            log_info "  Model ID found in endpoint"
            model_present=true
          else
            log_error "Model ID not found in /v1/models response"
            profile_ok=false
          fi
        fi

        # Step 2: Extract version info
        if [[ "$models_response" != "N/A" ]]; then
          # Try to get build version from the response
          version_info=$(echo "$models_response" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  if 'build' in data:
    print(data.get('build', 'N/A'))
  elif 'version' in data:
    print(data.get('version', 'N/A'))
  else:
    print('N/A')
except:
  print('N/A')
" 2>/dev/null || echo "N/A")
        fi

        # Try /props endpoint if available
        local props_url="$base_url/props"
        local props_response=$(api_call "$props_url" 5)
        if [[ "$props_response" != "N/A" ]]; then
          build_info=$(echo "$props_response" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  if 'build' in data:
    print(data.get('build', 'N/A'))
  elif 'version' in data:
    print(data.get('version', 'N/A'))
  elif 'build_commit' in data:
    print(data.get('build_commit', 'N/A'))
  else:
    print('N/A')
except:
  print('N/A')
" 2>/dev/null || echo "N/A")
        fi

        # Step 3: Read preset configuration
        preset_section=$(get_ini_section "$MODELS_PRESET" "$model_id")
        if [[ -z "$preset_section" ]]; then
          log_error "Preset section not found for model: $model_id"
          profile_ok=false
        else
          # preset_section already has content, keep it
          :
        fi

        # Step 3a: Verify model weights and get file metadata
        if [[ "$profile_ok" == "true" ]]; then
          local weights_info=$(verify_model_weights "$model_id" "$hash_requested" || true)
          if [[ -z "$weights_info" ]] || ! echo "$weights_info" | python3 -c "import json, sys; json.load(sys.stdin)" 2>/dev/null; then
            log_error "Model weights verification failed for: $model_id"
            profile_ok=false
          else
            # Extract weight info from JSON
            model_path=$(echo "$weights_info" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.get('model_path', 'N/A'))" 2>/dev/null || echo "N/A")
            file_size_bytes=$(echo "$weights_info" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.get('file_size_bytes', 'N/A'))" 2>/dev/null || echo "N/A")
            file_mtime=$(echo "$weights_info" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.get('file_mtime', 'N/A'))" 2>/dev/null || echo "N/A")
            file_sha256=$(echo "$weights_info" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.get('file_sha256', 'N/A'))" 2>/dev/null || echo "N/A")
          fi
        fi

        # Step 4: Send minimal probe completion (max 8 tokens)
        # GATE: Only send probe if model was actually present on the endpoint
        # AND if all previous checks (preset, weights) passed
        if [[ "$model_present" == "true" ]] && [[ "$profile_ok" == "true" ]]; then
          local probe_start probe_end
          probe_start=$(date +%s%N)

          probe_request=$(cat <<'PROBE_EOF'
{
  "model": "PROBE_MODEL",
  "messages": [
    {
      "role": "user",
      "content": "OK"
    }
  ],
  "max_tokens": 8,
  "temperature": 0
}
PROBE_EOF
)
          # Replace placeholder with actual model id
          probe_request="${probe_request//PROBE_MODEL/$model_id}"

          local completion_url="$base_url/chat/completions"
          probe_response=$(curl -s -m 30 \
            -H "Content-Type: application/json" \
            -d "$probe_request" \
            "$completion_url" 2>/dev/null || echo "")

          probe_end=$(date +%s%N)
          probe_latency=$(( (probe_end - probe_start) / 1000000 ))  # Convert to milliseconds

          if [[ -z "$probe_response" ]]; then
            log_error "Probe request failed or timed out"
            profile_ok=false
            probe_latency="N/A"
          else
            # Check if response contains choices/content (basic validation)
            if echo "$probe_response" | grep -q "\"content\"" || echo "$probe_response" | grep -q "\"choices\""; then
              log_info "  Probe request successful (${probe_latency}ms)"
            else
              log_error "Probe response invalid"
              profile_ok=false
            fi
          fi
        else
          # Model not present on endpoint, skip probe
          probe_latency="N/A (skipped: model not present)"
          probe_response=""
          log_info "  Probe skipped (model not present on endpoint)"
        fi
      fi
    fi
  fi

  # Escape values for JSON output
  local version_escaped build_escaped preset_escaped probe_latency_escaped
  local file_size_escaped file_mtime_escaped
  version_escaped=$(echo -n "$version_info" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  build_escaped=$(echo -n "$build_info" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  preset_escaped=$(echo -n "$preset_section" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  base_url_escaped=$(echo -n "$base_url" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  model_escaped=$(echo -n "$model_id" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  model_path_escaped=$(echo -n "$model_path" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  file_size_escaped=$(echo -n "$file_size_bytes" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  file_mtime_escaped=$(echo -n "$file_mtime" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  file_sha256_escaped=$(echo -n "$file_sha256" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")
  probe_latency_escaped=$(echo -n "$probe_latency" | python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))")

  # Return results as JSON for aggregation
  cat <<EOF
{
  "profile": "$(basename "$profile_path")",
  "baseUrl": $base_url_escaped,
  "model": $model_escaped,
  "model_present": $model_present,
  "version_info": $version_escaped,
  "build_info": $build_escaped,
  "preset_section": $preset_escaped,
  "model_path": $model_path_escaped,
  "file_size_bytes": $file_size_escaped,
  "file_mtime": $file_mtime_escaped,
  "file_sha256": $file_sha256_escaped,
  "probe_latency_ms": $probe_latency_escaped,
  "probe_response_valid": $(if [[ "$probe_response" != "" ]]; then echo "true"; else echo "false"; fi),
  "ok": $profile_ok
}
EOF

  if [[ "$profile_ok" != "true" ]]; then
    return 1
  fi
}

# ---- Generate markdown report ----------------------------------------------
generate_report() {
  local results_json="$1" out_file="$2"
  local all_ok=true
  local tmp_json="/tmp/verify_audit_data_$$.json"
  local tmp_py="/tmp/verify_audit_script_$$.py"

  # Check if all profiles passed
  if echo "$results_json" | grep -q '"ok": false'; then
    all_ok=false
  fi

  # Write JSON to temp file
  echo "$results_json" > "$tmp_json"

  # Write Python script to temp file
  cat > "$tmp_py" << 'EOF'
import json
import sys
from datetime import datetime

with open(sys.argv[1]) as f:
    profiles = json.load(f)

print("# Endpoint Identity Verification Report\n")
print("Generated: " + datetime.now().isoformat() + "\n")
print("## Summary\n")
print("This report verifies that model profiles reference endpoints that are actually present,")
print("correctly configured, and responding as expected.\n")

passed_count = 0
failed_count = 0

for p in profiles:
    print("\n### " + p.get("profile", "N/A") + "\n")
    print("- **Model ID**: `" + p.get("model", "N/A") + "`")
    print("- **Base URL**: `" + p.get("baseUrl", "N/A") + "`")
    print("- **Model Present**: " + ("✓" if p.get("model_present") else "✗"))
    print("- **Version Info**: `" + p.get("version_info", "N/A") + "`")
    print("- **Build Info**: `" + p.get("build_info", "N/A") + "`")
    lat = p.get("probe_latency_ms", "N/A")
    lat_str = str(lat)
    if lat_str.startswith("N/A"):
        print("- **Probe Latency**: " + lat_str)
    else:
        print("- **Probe Latency**: " + lat_str + "ms")
    print("\n#### Model Weights\n")
    print("- **Model Path**: `" + p.get("model_path", "N/A") + "`")
    fs = p.get("file_size_bytes", "N/A")
    if fs != "N/A":
        print("- **File Size**: " + str(fs) + " bytes")
    else:
        print("- **File Size**: N/A")
    fm = p.get("file_mtime", "N/A")
    if fm != "N/A":
        print("- **File mtime**: " + str(fm) + " (unix epoch)")
    else:
        print("- **File mtime**: N/A")
    print("- **File SHA-256**: `" + p.get("file_sha256", "N/A") + "`\n")
    status = "✓ PASS" if p.get("ok") else "✗ FAIL"
    print("- **Status**: " + status + "\n")
    if p.get("ok"):
        passed_count += 1
    else:
        failed_count += 1
    preset = p.get("preset_section", "")
    if preset:
        print("#### Preset Configuration\n```ini\n[" + p.get("model", "N/A") + "]\n" + preset.strip() + "\n```\n")

print("\n## Overall Status\n")
print("**Profiles verified**: " + str(passed_count) + " passed, " + str(failed_count) + " failed\n")
if failed_count == 0:
    print("**OVERALL: PASS** - All profiles verified successfully. Endpoint identity is confirmed.")
else:
    print("**OVERALL: FAIL** - One or more profiles failed verification. Audit is blocked.")
print("\n### Caveat: Probe Success is Liveness Only\n")
print("The probe completion test confirms endpoint liveness and measures request latency,")
print("but **does not establish model identity**. Model identity depends solely on:\n")
print("- Model ID presence in `/v1/models` endpoint response, AND")
print("- Weights file path, file size, and (if requested) SHA-256 hash verification.\n")
print("A successful probe on a model that `/v1/models` claims absent (e.g., due to a typo")
print("or misconfigured model id) proves the endpoint answered, not that the correct weights")
print("were loaded. Trust the `/v1/models` assertion and weights facts.")
EOF

  # Run the Python script and redirect output to the report file
  if ! python3 "$tmp_py" "$tmp_json" > "$out_file" 2>/dev/null; then
    log_error "Failed to generate report"
    # Keep temp files for debugging
  else
    # Clean up temp files only on success
    rm -f "$tmp_json" "$tmp_py"
  fi

  if [[ "$all_ok" == "true" ]]; then
    return 0
  else
    return 1
  fi
}

# ---- Main execution -------------------------------------------------------
main() {
  parse_args "$@"

  log_info "Starting endpoint verification"
  log_info "Output: $OUT_PATH"

  local results_json="["
  local first=true

  for profile_path in "${PROFILES[@]}"; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      results_json+=","
    fi

    profile_result=$(verify_profile "$profile_path" "$HASH_WEIGHTS" || true)
    results_json+="$profile_result"
  done

  results_json+="]"

  # Generate report
  if ! generate_report "$results_json" "$OUT_PATH"; then
    log_error "One or more profiles failed verification"
    EXIT_CODE=1
  fi

  log_info "Report written to: $OUT_PATH"
  exit "$EXIT_CODE"
}

main "$@"
