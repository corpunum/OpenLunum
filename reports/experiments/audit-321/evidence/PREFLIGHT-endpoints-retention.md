# Endpoint Identity Verification Report

Generated: 2026-07-25T10:20:30.250761

## Summary

This report verifies that model profiles reference endpoints that are actually present,
correctly configured, and responding as expected.


### qwen36-35b-live.json

- **Model ID**: `openai/qwen3.6-35b-a3b`
- **Base URL**: `http://127.0.0.1:8080/v1`
- **Model Present**: ✓
- **Version Info**: `N/A`
- **Build Info**: `N/A`
- **Probe Latency**: 177ms

#### Model Weights

- **Model Path**: `/home/corpunum/models/Qwen3.6-35B-A3B-uncensored-heretic-MTP-Q6_K.gguf`
- **File Size**: 29208734880 bytes
- **File mtime**: 1782483040 (unix epoch)
- **File SHA-256**: `N/A (not requested)`

- **Status**: ✓ PASS

#### Preset Configuration
```ini
[openai/qwen3.6-35b-a3b]
model = /home/corpunum/models/Qwen3.6-35B-A3B-uncensored-heretic-MTP-Q6_K.gguf
mmproj = /home/corpunum/models/mmproj-BF16.gguf
gpu-layers = 999
ctx-size = 98304
flash-attn = on
cache-type-k = q4_0
cache-type-v = q4_0
parallel = 1
```


### qwen3-coder-30b-live.json

- **Model ID**: `openai/qwen3-coder-30b-a3b`
- **Base URL**: `http://127.0.0.1:8080/v1`
- **Model Present**: ✓
- **Version Info**: `N/A`
- **Build Info**: `N/A`
- **Probe Latency**: 135ms

#### Model Weights

- **Model Path**: `/home/corpunum/models/Qwen3-Coder-30B-A3B-Instruct-Q6_K.gguf`
- **File Size**: 25092535456 bytes
- **File mtime**: 1784219257 (unix epoch)
- **File SHA-256**: `N/A (not requested)`

- **Status**: ✓ PASS

#### Preset Configuration
```ini
[openai/qwen3-coder-30b-a3b]
model = /home/corpunum/models/Qwen3-Coder-30B-A3B-Instruct-Q6_K.gguf
gpu-layers = 999
ctx-size = 262144
flash-attn = on
cache-type-k = q8_0
cache-type-v = q8_0
parallel = 1
```


## Overall Status

**Profiles verified**: 2 passed, 0 failed

**OVERALL: PASS** - All profiles verified successfully. Endpoint identity is confirmed.

### Caveat: Probe Success is Liveness Only

The probe completion test confirms endpoint liveness and measures request latency,
but **does not establish model identity**. Model identity depends solely on:

- Model ID presence in `/v1/models` endpoint response, AND
- Weights file path, file size, and (if requested) SHA-256 hash verification.

A successful probe on a model that `/v1/models` claims absent (e.g., due to a typo
or misconfigured model id) proves the endpoint answered, not that the correct weights
were loaded. Trust the `/v1/models` assertion and weights facts.
