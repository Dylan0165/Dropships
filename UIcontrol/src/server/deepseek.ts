/**
 * DeepSeek API helper for UIcontrol dashboard.
 * Provides direct DeepSeek API access for health checks,
 * model listing, and cost estimation.
 */

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'

interface DeepSeekHealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  latencyMs: number
  model: string
  error?: string
}

interface DeepSeekCostEstimate {
  inputTokens: number
  outputTokens: number
  costUsd: number
  costEur: number
  model: string
}

const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-v4-pro':   { input: 0.435, output: 0.87 },
}

const USD_TO_EUR = 0.92

/**
 * Check if the DeepSeek API is reachable and responding.
 */
export async function checkHealth(model = 'deepseek-v4-flash'): Promise<DeepSeekHealthStatus> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return { status: 'down', latencyMs: 0, model, error: 'DEEPSEEK_API_KEY not set' }
  }

  const start = Date.now()
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const latencyMs = Date.now() - start

    if (response.ok) {
      return { status: latencyMs > 3000 ? 'degraded' : 'healthy', latencyMs, model }
    }

    const errorText = await response.text()
    return { status: 'degraded', latencyMs, model, error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` }
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      model,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Estimate cost for a given token count.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): DeepSeekCostEstimate {
  const pricing = PRICING[model] || PRICING['deepseek-v4-flash']
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output

  return {
    inputTokens,
    outputTokens,
    costUsd: Math.round(costUsd * 10000) / 10000,
    costEur: Math.round(costUsd * USD_TO_EUR * 10000) / 10000,
    model,
  }
}

/**
 * Get available DeepSeek models.
 */
export function getAvailableModels() {
  return [
    {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      description: 'Fast executor — tool calling, code generation, store building',
      contextWindow: 1_000_000,
      maxOutput: 8_192,
      supportsTools: true,
      role: 'executor',
      pricing: PRICING['deepseek-v4-flash'],
    },
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      description: 'Deep thinker — reviews, analytics, strategic analysis',
      contextWindow: 1_000_000,
      maxOutput: 8_192,
      supportsTools: true,
      role: 'reviewer',
      pricing: PRICING['deepseek-v4-pro'],
    },
  ]
}
