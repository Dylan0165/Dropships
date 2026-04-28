/**
 * DeepSeek model configurations — parallel to the Anthropic model configs
 * in src/utils/model/configs.ts.
 *
 * These are used when the provider is 'deepseek' so the existing model
 * resolution, cost tracking, and UI display work without changes.
 */

import type { ModelConfig } from '../../utils/model/configs.js'

// DeepSeek models use the same ID across all access methods
// (there's only one provider, no Bedrock/Vertex/Foundry split)
export const DEEPSEEK_CHAT_CONFIG = {
  firstParty: 'deepseek-chat',
  bedrock: 'deepseek-chat',
  vertex: 'deepseek-chat',
  foundry: 'deepseek-chat',
} as const satisfies ModelConfig

export const DEEPSEEK_REASONER_CONFIG = {
  firstParty: 'deepseek-reasoner',
  bedrock: 'deepseek-reasoner',
  vertex: 'deepseek-reasoner',
  foundry: 'deepseek-reasoner',
} as const satisfies ModelConfig

// Future models — placeholders for when DeepSeek releases these
export const DEEPSEEK_VISION_CONFIG = {
  firstParty: 'deepseek-vision',
  bedrock: 'deepseek-vision',
  vertex: 'deepseek-vision',
  foundry: 'deepseek-vision',
} as const satisfies ModelConfig

export const DEEPSEEK_VIDEO_CONFIG = {
  firstParty: 'deepseek-video',
  bedrock: 'deepseek-video',
  vertex: 'deepseek-video',
  foundry: 'deepseek-video',
} as const satisfies ModelConfig

/**
 * DeepSeek pricing (USD per million tokens).
 * Source: https://platform.deepseek.com/api-docs/pricing
 * Last updated: 2026-04-04
 */
export const DEEPSEEK_COST = {
  // deepseek-chat (V3)
  chat: {
    inputTokens: 0.27,
    outputTokens: 1.10,
    promptCacheWriteTokens: 0.27,
    promptCacheReadTokens: 0.07,  // cache hit discount
    webSearchRequests: 0,
  },
  // deepseek-reasoner (R1)
  reasoner: {
    inputTokens: 0.55,
    outputTokens: 2.19,
    promptCacheWriteTokens: 0.55,
    promptCacheReadTokens: 0.14,
    webSearchRequests: 0,
  },
} as const

/**
 * Model aliases for DeepSeek.
 * Maps user-friendly names to actual model IDs.
 */
export const DEEPSEEK_ALIASES: Record<string, string> = {
  chat: 'deepseek-chat',
  reasoner: 'deepseek-reasoner',
  fast: 'deepseek-chat',
  think: 'deepseek-reasoner',
  v3: 'deepseek-chat',
  r1: 'deepseek-reasoner',
  // Pipeline agent role mapping
  executor: 'deepseek-chat',
  reviewer: 'deepseek-reasoner',
  analytics: 'deepseek-reasoner',
  security: 'deepseek-reasoner',
}

/**
 * Resolve a model input to a DeepSeek model ID.
 * Accepts aliases, full IDs, or returns default.
 */
export function resolveDeepSeekModel(input?: string | null): string {
  if (!input) return 'deepseek-chat'
  const lower = input.toLowerCase().trim()
  if (DEEPSEEK_ALIASES[lower]) return DEEPSEEK_ALIASES[lower]
  if (lower.startsWith('deepseek-')) return lower
  return 'deepseek-chat'
}

/**
 * Max output tokens per DeepSeek model.
 */
export function getDeepSeekMaxOutputTokens(model: string): number {
  switch (model) {
    case 'deepseek-reasoner':
      return 8192
    case 'deepseek-chat':
    default:
      return 8192
  }
}

/**
 * Context window size per DeepSeek model.
 */
export function getDeepSeekContextWindow(model: string): number {
  switch (model) {
    case 'deepseek-reasoner':
      return 64_000
    case 'deepseek-chat':
    default:
      return 64_000
  }
}
