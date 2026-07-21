# Local Endpoint Stability Report (Issue #272)

## 1. Infrastructure Specifications

The local model infrastructure runs a multi-model `llama-server` router instance on EEST timezone. 

### Server Version and Source Build
* **Server binary**: `llama.cpp` built locally at `/home/corpunum/llama.cpp/build/bin/llama-server`
* **Version/Commit**: `commit 2084434`

### systemd Service Configuration (`llama-qwen36.service`)
The router is managed via systemd user slice and launched with the following command:
```bash
/home/corpunum/llama.cpp/build/bin/llama-server \
  --models-preset /home/corpunum/models-preset.ini \
  --models-max 5 \
  --port 8080 \
  --host 0.0.0.0 \
  -np 3 \
  --sleep-idle-seconds -1 \
  --metrics
```

* `--models-max 5`: Prevents model eviction. Up to 5 models are allowed in memory concurrently (e.g. Coder-30B, Qwen3.6-35B, supergemma4-e4b, and two small brain/skills 1.7B models).
* `-np 3`: Allocates 3 parallel context processing slots to allow concurrent request decoding.
* `--sleep-idle-seconds -1`: Disables idle unloading. Pre-cached prompts stay resident in VRAM.

### Preset Configurations (`models-preset.ini`)

#### 1. Qwen 3 Coder 30B (direct model endpoint at port `48127`)
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

#### 2. Qwen 3.6 35B (routed endpoint via port `8080` / direct at port `42181`)
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

---

## 2. Request Schema and Test Payload

All client-to-model requests use standard OpenAI Chat Completion schema. Below is a representative JSON test payload used to verify the endpoints:

```json
{
  "model": "openai/qwen3.6-35b-a3b",
  "temperature": 0,
  "seed": 42,
  "max_tokens": 4096,
  "messages": [
    {
      "role": "system",
      "content": "/no_think\nConvert the input into Lunum-Sem JSON.\nReturn one JSON object only; no markdown."
    },
    {
      "role": "user",
      "content": "{\"sourceLanguage\": \"en\", \"sourceText\": \"I prefer concise answers.\"}"
    }
  ]
}
```

---

## 3. Separate Failure Mode Classification

During stability investigations and evaluation runs, failures are categorized into two mutually exclusive types to isolate infrastructure bugs from model parsing capability:

### A. Transport & Infrastructure Failures
These reflect low-level TCP, proxy, or server-residency errors. They are **always treated as blockers** that invalidate the benchmark:
* **HTTP 500 Proxy Error**: Occurs under GPU slot/VRAM contention (LRU model eviction). Resolved by raising `--models-max` from 1 to 5.
* **HTTP 503 Service Unavailable / Connection Refused**: Indicates a model server crash. Resolved by configuring systemd user services to auto-restart.
* **HTTP 400 Bad Request**: Caused by missing or placeholder model identifiers (e.g. `replace-with-server-model-id`). Resolved by committing correct model profile configurations.

### B. Output & Parser Failures
These reflect successful model generations that failed semantic parsing constraints. They are **benchmark metrics**, not operational blockers:
* **Empty Output / Truncated JSON**: Occurs when prompt context exceeds context boundaries or `maxTokens` is too low to fit both the `<think>` block and target JSON. Resolved by raising `maxTokens` to `4096`.
* **Invalid JSON Structure**: The model outputs invalid JSON or includes raw conversational wrapping (e.g. markdown code fences or trailing text). Handled gracefully by the eval parser.

---

## 4. Live Sanitized Logs

Below is a segment of the router's execution logs confirming successful context loading and decoding:
```text
Jul 21 12:11:57 corpunumRig llama-server[2443689]: [42181] I srv        update:    - prompt 0x6220869b8c00:    2348 tokens, checkpoints:  1,   138.569 MiB
Jul 21 12:11:57 corpunumRig llama-server[2443689]: [42181] I srv  get_availabl: prompt cache update took 57.60 ms
Jul 21 12:11:57 corpunumRig llama-server[2443689]: [42181] I slot launch_slot_: id  2 | task 148388 | processing task, is_child = 0
Jul 21 12:11:57 corpunumRig llama-server[2443689]: [42181] I slot update_slots: id  2 | task 148388 | Checking checkpoint with [678, 678] against 715...
Jul 21 12:11:57 corpunumRig llama-server[2443689]: [42181] W slot update_slots: id  2 | task 148388 | restored context checkpoint (pos_min = 678, pos_max = 678, n_tokens = 679, n_past = 679, size = 62.813 MiB)
Jul 21 12:12:00 corpunumRig llama-server[2443689]: [42181] I slot print_timing: id  2 | task 148388 | n_decoded =    119, tg =  58.49 t/s
Jul 21 12:12:08 corpunumRig llama-server[2443689]: [42181] I slot print_timing: id  2 | task 148388 | prompt eval time =     234.20 ms /    37 tokens (    6.33 ms per token,   157.98 tokens per second)
Jul 21 12:12:08 corpunumRig llama-server[2443689]: [42181] I slot print_timing: id  2 | task 148388 |        eval time =   10731.61 ms /   628 tokens (   17.09 ms per token,    58.52 tokens per second)
Jul 21 12:12:08 corpunumRig llama-server[2443689]: [42181] I slot print_timing: id  2 | task 148388 |       total time =   10965.82 ms /   665 tokens
Jul 21 12:12:08 corpunumRig llama-server[2443689]: [42181] I slot      release: id  2 | task 148388 | stop processing: n_tokens = 1343, truncated = 0
Jul 21 12:12:08 corpunumRig llama-server[2443689]: [42181] I srv  update_slots: all slots are idle
```
