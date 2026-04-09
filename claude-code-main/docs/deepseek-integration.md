# DeepSeek Integration Architecture

## Overview

The dropshipping tool uses **claude-code-main** as the orchestration kernel with
**DeepSeek** as the AI engine. This document explains how DeepSeek is integrated
without rewriting the 500K+ line codebase.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    UIcontrol Dashboard                    │
│  React + @xyflow/react + Express + WebSocket + SQLite    │
│                     (Port 3001)                          │
└───────────────────────┬─────────────────────────────────┘
                        │ spawn + PIPELINE_EVENTs
                        ▼
┌─────────────────────────────────────────────────────────┐
│              claude-code-main (Orchestrator)              │
│  Bun + React/Ink + TypeScript + Coordinator Mode         │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │           Anthropic SDK (unchanged)                  ││
│  │  QueryEngine → Tools → Messages → client.create()   ││
│  └──────────────────────┬──────────────────────────────┘│
│                         │ fetch()                        │
│  ┌──────────────────────┴──────────────────────────────┐│
│  │        ★ DeepSeek Fetch Bridge ★                     ││
│  │  Intercepts HTTP calls at the fetch() boundary       ││
│  │  Translates: Anthropic Messages → OpenAI Chat        ││
│  │  Translates: OpenAI Response → Anthropic Response    ││
│  │  Handles SSE streaming translation                   ││
│  └──────────────────────┬──────────────────────────────┘│
│                         │ HTTP                           │
└─────────────────────────┼───────────────────────────────┘
                          ▼
              ┌────────────────────────┐
              │    DeepSeek API        │
              │  api.deepseek.com      │
              │  ┌──────────────────┐  │
              │  │ deepseek-chat    │  │
              │  │ (V3 - executor)  │  │
              │  ├──────────────────┤  │
              │  │ deepseek-reasoner│  │
              │  │ (R1 - reviewer)  │  │
              │  └──────────────────┘  │
              └────────────────────────┘
```

## Key Integration: Fetch Bridge

File: `src/providers/deepseek/fetch-bridge.ts`

The fetch bridge is a custom `fetch()` function passed to the Anthropic SDK
constructor. It intercepts all HTTP calls and:

1. **Detects** Anthropic Messages API calls (`/v1/messages`)
2. **Translates** the request body from Anthropic format to OpenAI format
3. **Sends** to DeepSeek's OpenAI-compatible API
4. **Translates** the response back to Anthropic format
5. **Handles streaming** by converting OpenAI SSE events to Anthropic SSE events

### Why This Approach?

- **Zero changes** to QueryEngine, Tool system, or any Anthropic-dependent code
- **Transparent** to the rest of the codebase
- **Reversible** — remove the fetch override and it's back to Anthropic
- **Testable** — the bridge is a pure function with clear input/output

### Streaming Translation

```
DeepSeek SSE:                    Anthropic SSE:
data: {"choices":[...]}     →    event: content_block_delta
                                 data: {"type":"text_delta",...}
```

The bridge handles R1's `reasoning_content` field by converting it to
Anthropic's `thinking` block type.

## Model Routing

| Agent Type | DeepSeek Model | Why |
|-----------|---------------|-----|
| Executors (trend, product, brand, store, ads, growth) | `deepseek-chat` (V3) | Tool calling support, fast, cheap |
| Reviewers (niche, product, store, ads) | `deepseek-reasoner` (R1) | Deep chain-of-thought analysis |
| Security agent | `deepseek-reasoner` (R1) | Critical thinking for vulnerability detection |
| Video inspiration | `deepseek-chat` (V3) | Text analysis (multimodal pending) |

**Important**: `deepseek-reasoner` does NOT support function/tool calling.
The fetch bridge automatically strips tools when routing to the reasoner.

## Cost Comparison

| Model | Input | Output | vs Claude Sonnet 4.6 |
|-------|-------|--------|---------------------|
| deepseek-chat | $0.27/Mtok | $1.10/Mtok | **11x cheaper** |
| deepseek-reasoner | $0.55/Mtok | $2.19/Mtok | **7x cheaper** |
| Claude Sonnet 4.6 | $3.00/Mtok | $15.00/Mtok | — |

A full pipeline run (all 9 agents) costs approximately **€0.02-0.08** with DeepSeek
vs **€0.50-2.00** with Claude.

## File Structure

```
src/providers/
├── types.ts              # Provider abstraction interfaces
├── index.ts              # Provider registry
└── deepseek/
    ├── index.ts          # Barrel export
    ├── client.ts         # Direct DeepSeek API client (LLMProvider)
    ├── configs.ts        # Model configs, aliases, cost tracking
    ├── models.ts         # Model definitions and pricing
    ├── fetch-bridge.ts   # ★ Anthropic SDK ↔ DeepSeek translator
    ├── bridge.ts         # Stream event bridge (for web UI)
    └── multimodal.ts     # Video/image scaffolding (future)
```

## Modified Existing Files

| File | Change |
|------|--------|
| `src/utils/model/providers.ts` | Added `'deepseek'` to `APIProvider` type |
| `src/utils/model/configs.ts` | Added `deepseek` key to all model configs |
| `src/utils/model/aliases.ts` | Added `chat`, `reasoner`, `fast`, `think`, `v3`, `r1` aliases |
| `src/utils/model/model.ts` | DeepSeek defaults in `getDefaultOpusModel`, `getDefaultSonnetModel`, etc. |
| `src/utils/modelCost.ts` | Added DeepSeek pricing tiers |
| `src/services/api/client.ts` | Added DeepSeek provider branch with fetch bridge |
| `src/coordinator/coordinatorMode.ts` | Enhanced pipeline prompt with DeepSeek instructions |
| `web/lib/constants.ts` | Added DeepSeek models and agent→model mapping |
| `web/app/api/chat/route.ts` | DeepSeek-aware provider detection |

## Activation

Set `DEEPSEEK_API_KEY` in your `.env` file. The system auto-detects DeepSeek
as the provider. No other configuration needed.

```bash
# Minimum config
DEEPSEEK_API_KEY=sk-your-key-here

# Explicit (optional)
CLAUDE_CODE_USE_DEEPSEEK=1
```

## Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Available models
curl http://localhost:3001/api/models

# Cost estimate
curl -X POST http://localhost:3001/api/cost-estimate \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-chat","inputTokens":10000,"outputTokens":5000}'

# Start pipeline
curl -X POST http://localhost:3001/api/pipeline/start \
  -H 'Content-Type: application/json' \
  -d '{"niche":"LED strip lights"}'
```

## Multimodal Roadmap

When DeepSeek adds vision/video support:

1. Set `DEEPSEEK_MULTIMODAL_ENABLED=1` in `.env`
2. The `video-inspiration-agent` will auto-detect and use frame analysis
3. The `multimodal.ts` module has all types and utilities ready
4. The fetch bridge will route multimodal requests to the correct model

Current text-based video analysis works now — the agent analyzes video metadata,
transcripts, and hashtags to extract product opportunities.
