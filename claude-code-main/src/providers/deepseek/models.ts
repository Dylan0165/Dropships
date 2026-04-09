/**
 * DeepSeek model definitions and pricing.
 *
 * Pricing source: https://platform.deepseek.com/api-docs/pricing
 * Updated: 2026-04-04
 *
 * DeepSeek exposes two main models:
 * - deepseek-chat     (V3) — fast executor, tool calling, JSON mode
 * - deepseek-reasoner (R1) — chain-of-thought reasoning, reviews, analysis
 *
 * Both support the OpenAI Chat Completions API format.
 * Tool/function calling is supported on deepseek-chat.
 * Vision is NOT yet supported via API (text-only as of 2026-04).
 * Video is NOT supported via API yet.
 */

import type { ModelDefinition, ProviderConfig } from '../types.js'

// ── Model catalog ───────────────────────────────────────────────────────────

export const DEEPSEEK_CHAT: ModelDefinition = {
  id: 'deepseek-chat',
  displayName: 'DeepSeek V3 (Chat)',
  role: 'executor',
  contextWindow: 64_000,
  maxOutputTokens: 8_192,
  inputCostPerMillion: 0.27,   // $0.27 / 1M input (cache miss)
  outputCostPerMillion: 1.10,  // $1.10 / 1M output
  supportsTools: true,
  supportsJsonMode: true,
  supportsVision: false,       // not yet via API
  supportsThinking: false,
  supportsFiles: false,
  supportsVideo: false,
}

export const DEEPSEEK_REASONER: ModelDefinition = {
  id: 'deepseek-reasoner',
  displayName: 'DeepSeek R1 (Reasoner)',
  role: 'reasoner',
  contextWindow: 64_000,
  maxOutputTokens: 8_192,
  inputCostPerMillion: 0.55,
  outputCostPerMillion: 2.19,
  supportsTools: false,        // R1 does not support function calling
  supportsJsonMode: true,
  supportsVision: false,
  supportsThinking: true,      // native chain-of-thought
  supportsFiles: false,
  supportsVideo: false,
}

export const ALL_DEEPSEEK_MODELS: ModelDefinition[] = [
  DEEPSEEK_CHAT,
  DEEPSEEK_REASONER,
]

// ── Provider config ─────────────────────────────────────────────────────────

export function getDeepSeekProviderConfig(): ProviderConfig {
  return {
    name: 'deepseek',
    displayName: 'DeepSeek AI',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    models: ALL_DEEPSEEK_MODELS,
    anthropicCompatible: false,
    openaiCompatible: true,
    maxParallelToolCalls: 1,
    supportsStreaming: true,
    supportsVision: false,
    supportsVideo: false,
    supportsFiles: false,
  }
}

// ── Cost calculation ────────────────────────────────────────────────────────

export function calculateDeepSeekCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const def =
    model === 'deepseek-reasoner' ? DEEPSEEK_REASONER : DEEPSEEK_CHAT
  return (
    (inputTokens / 1_000_000) * def.inputCostPerMillion +
    (outputTokens / 1_000_000) * def.outputCostPerMillion
  )
}

// ── Model role mapping ──────────────────────────────────────────────────────

/**
 * Map pipeline agent categories to DeepSeek models.
 * - executor  → deepseek-chat    (fast, tool calling)
 * - reviewer  → deepseek-reasoner (chain-of-thought)
 * - analytics → deepseek-reasoner
 * - security  → deepseek-reasoner
 */
export function getDeepSeekModelForAgentCategory(
  category: 'executor' | 'reviewer' | 'analytics' | 'security',
): string {
  switch (category) {
    case 'executor':
      return 'deepseek-chat'
    case 'reviewer':
    case 'analytics':
    case 'security':
      return 'deepseek-reasoner'
  }
}

// ── Future: multimodal placeholder ──────────────────────────────────────────

/**
 * Placeholder for future DeepSeek multimodal models.
 * When DeepSeek releases vision/video API support, register new models here.
 *
 * Expected future models:
 * - deepseek-vision    (image understanding for product analysis)
 * - deepseek-video     (video understanding for TikTok/ad inspiration)
 * - deepseek-janus     (image generation for ad creatives)
 */
export const FUTURE_MULTIMODAL_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-vision',
    displayName: 'DeepSeek Vision (Future)',
    role: 'multimodal',
    contextWindow: 64_000,
    maxOutputTokens: 4_096,
    inputCostPerMillion: 0.55,
    outputCostPerMillion: 2.19,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    supportsThinking: false,
    supportsFiles: true,
    supportsVideo: false,
  },
  {
    id: 'deepseek-video',
    displayName: 'DeepSeek Video (Future)',
    role: 'multimodal',
    contextWindow: 64_000,
    maxOutputTokens: 4_096,
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 3.0,
    supportsTools: true,
    supportsJsonMode: true,
    supportsVision: true,
    supportsThinking: false,
    supportsFiles: true,
    supportsVideo: true,
  },
]
