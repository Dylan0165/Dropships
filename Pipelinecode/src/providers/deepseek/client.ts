/**
 * DeepSeek API client — implements the LLMProvider interface.
 *
 * DeepSeek uses the OpenAI Chat Completions format.
 * This client translates between our internal Anthropic-shaped messages
 * and the OpenAI format that DeepSeek expects, so the entire tool system,
 * coordinator, and pipeline can stay untouched.
 *
 * Streaming uses Server-Sent Events (SSE) identical to OpenAI.
 */

import type {
  ChatMessage,
  ChatParams,
  ChatResponse,
  ContentBlock,
  LLMProvider,
  ModelDefinition,
  ModelRole,
  ProviderConfig,
  ProviderStreamEvent,
  ToolDefinition,
} from '../types.js'
import {
  ALL_DEEPSEEK_MODELS,
  DEEPSEEK_CHAT,
  DEEPSEEK_REASONER,
  getDeepSeekProviderConfig,
} from './models.js'

// ── OpenAI-compatible request/response types ────────────────────────────────

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OAIToolCall[]
  tool_call_id?: string
  name?: string
}

interface OAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OAIChoice {
  index: number
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: OAIToolCall[]
    reasoning_content?: string
  }
  finish_reason: 'stop' | 'tool_calls' | 'length' | null
}

interface OAIStreamDelta {
  role?: 'assistant'
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: 'function'
    function?: { name?: string; arguments?: string }
  }>
  reasoning_content?: string | null
}

interface OAIStreamChoice {
  index: number
  delta: OAIStreamDelta
  finish_reason: 'stop' | 'tool_calls' | 'length' | null
}

interface OAIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// ── Message conversion helpers ──────────────────────────────────────────────

function toOAIMessages(messages: ChatMessage[], system?: string): OAIMessage[] {
  const oai: OAIMessage[] = []

  if (system) {
    oai.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      oai.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      continue
    }

    // Array of content blocks — need to flatten
    const textParts: string[] = []
    const toolCalls: OAIToolCall[] = []
    const toolResults: OAIMessage[] = []

    for (const block of msg.content) {
      switch (block.type) {
        case 'text':
          textParts.push(block.text || '')
          break
        case 'tool_use':
          toolCalls.push({
            id: block.toolUseId || `call_${Date.now()}`,
            type: 'function',
            function: {
              name: block.toolName || '',
              arguments: JSON.stringify(block.toolInput || {}),
            },
          })
          break
        case 'tool_result':
          toolResults.push({
            role: 'tool',
            tool_call_id: block.toolUseId || '',
            content: block.toolResult || '',
          })
          break
        case 'image':
          // DeepSeek doesn't support vision yet — include description
          textParts.push(`[Image: ${block.image?.url || 'attached'}]`)
          break
      }
    }

    if (msg.role === 'assistant') {
      oai.push({
        role: 'assistant',
        content: textParts.join('\n') || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
    } else {
      if (textParts.length > 0) {
        oai.push({ role: 'user', content: textParts.join('\n') })
      }
    }

    // Tool results go as separate messages
    oai.push(...toolResults)
  }

  return oai
}

function toOAITools(tools: ToolDefinition[]): OAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

function finishReasonToStopReason(
  fr: string | null,
): ChatResponse['stopReason'] {
  switch (fr) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'stop':
    default:
      return 'end_turn'
  }
}

// ── DeepSeek Provider ───────────────────────────────────────────────────────

export class DeepSeekProvider implements LLMProvider {
  config: ProviderConfig

  constructor(config?: Partial<ProviderConfig>) {
    this.config = { ...getDeepSeekProviderConfig(), ...config }
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: params.model || 'deepseek-chat',
      messages: toOAIMessages(params.messages, params.system),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      stream: false,
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = toOAITools(params.tools)
      body.tool_choice = 'auto'
    }

    if (params.jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      throw new Error(`DeepSeek API error ${res.status}: ${errText}`)
    }

    const data = (await res.json()) as {
      choices: OAIChoice[]
      usage: OAIUsage
      model: string
    }

    const choice = data.choices[0]
    if (!choice) throw new Error('DeepSeek returned no choices')

    const content: ContentBlock[] = []

    // Reasoning content (from deepseek-reasoner)
    if (choice.message.reasoning_content) {
      content.push({
        type: 'text',
        text: `<thinking>${choice.message.reasoning_content}</thinking>`,
      })
    }

    // Text content
    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content })
    }

    // Tool calls
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          input = { raw: tc.function.arguments }
        }
        content.push({
          type: 'tool_use',
          toolUseId: tc.id,
          toolName: tc.function.name,
          toolInput: input,
        })
      }
    }

    return {
      content,
      model: data.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
      stopReason: finishReasonToStopReason(choice.finish_reason),
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<ProviderStreamEvent> {
    const body: Record<string, unknown> = {
      model: params.model || 'deepseek-chat',
      messages: toOAIMessages(params.messages, params.system),
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      stream: true,
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = toOAITools(params.tools)
      body.tool_choice = 'auto'
    }

    if (params.jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      yield {
        type: 'error',
        error: `DeepSeek API error ${res.status}: ${errText}`,
      }
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    // Track partial tool calls being built up across chunks
    const pendingToolCalls = new Map<
      number,
      { id: string; name: string; args: string }
    >()

    try {
      while (true) {
        if (params.signal?.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            // Flush any pending tool calls
            for (const [, tc] of pendingToolCalls) {
              let input: Record<string, unknown> = {}
              try {
                input = JSON.parse(tc.args)
              } catch {
                input = { raw: tc.args }
              }
              yield {
                type: 'tool_use',
                tool: { id: tc.id, name: tc.name, input },
              }
            }
            yield { type: 'done' }
            return
          }

          let parsed: { choices?: OAIStreamChoice[]; usage?: OAIUsage }
          try {
            parsed = JSON.parse(data)
          } catch {
            continue
          }

          const choice = parsed.choices?.[0]
          if (!choice) continue

          const delta = choice.delta

          // Reasoning content (thinking)
          if (delta.reasoning_content) {
            yield { type: 'thinking', thinking: delta.reasoning_content }
          }

          // Text content
          if (delta.content) {
            yield { type: 'text', content: delta.content }
          }

          // Tool calls (streamed incrementally)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = pendingToolCalls.get(tc.index)
              if (!existing) {
                pendingToolCalls.set(tc.index, {
                  id: tc.id || `call_${Date.now()}_${tc.index}`,
                  name: tc.function?.name || '',
                  args: tc.function?.arguments || '',
                })
              } else {
                if (tc.function?.arguments) {
                  existing.args += tc.function.arguments
                }
              }
            }
          }

          // Finish reason
          if (choice.finish_reason === 'tool_calls') {
            for (const [, tc] of pendingToolCalls) {
              let input: Record<string, unknown> = {}
              try {
                input = JSON.parse(tc.args)
              } catch {
                input = { raw: tc.args }
              }
              yield {
                type: 'tool_use',
                tool: { id: tc.id, name: tc.name, input },
              }
            }
            pendingToolCalls.clear()
          }

          // Usage info (usually in last chunk)
          if (parsed.usage) {
            yield {
              type: 'done',
              usage: {
                inputTokens: parsed.usage.prompt_tokens,
                outputTokens: parsed.usage.completion_tokens,
              },
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async healthCheck(): Promise<{
    ok: boolean
    error?: string
    latencyMs: number
  }> {
    const start = Date.now()
    try {
      const res = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      const latencyMs = Date.now() - start
      if (!res.ok) {
        return {
          ok: false,
          error: `HTTP ${res.status}`,
          latencyMs,
        }
      }
      return { ok: true, latencyMs }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        latencyMs: Date.now() - start,
      }
    }
  }

  getModelForRole(role: ModelRole): ModelDefinition {
    switch (role) {
      case 'executor':
      case 'fast':
        return DEEPSEEK_CHAT
      case 'reasoner':
        return DEEPSEEK_REASONER
      case 'multimodal':
        // Fall back to chat until multimodal is available
        return DEEPSEEK_CHAT
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let _instance: DeepSeekProvider | null = null

export function getDeepSeekProvider(): DeepSeekProvider {
  if (!_instance) {
    _instance = new DeepSeekProvider()
  }
  return _instance
}

export function resetDeepSeekProvider(): void {
  _instance = null
}
