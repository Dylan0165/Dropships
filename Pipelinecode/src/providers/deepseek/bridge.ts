/**
 * Anthropic SDK Bridge — translates DeepSeek responses into Anthropic SDK shapes.
 *
 * The entire tool system (Tool.ts, BashTool, FileEditTool, AgentTool, etc.)
 * and the QueryEngine expect Anthropic SDK types:
 *   - ContentBlockParam, ToolUseBlockParam, ToolResultBlockParam
 *   - BetaMessageStreamParams, BetaUsage
 *   - Streaming events: message_start, content_block_start, content_block_delta, etc.
 *
 * Rather than rewriting 500K+ lines, this bridge converts DeepSeek's OpenAI
 * format into those shapes at the API boundary. The coordinator and tools
 * never know they're talking to DeepSeek.
 *
 * This is the key integration point that makes the whole system work.
 */

import type { ProviderStreamEvent } from '../types.js'

// ── Anthropic-like event types (subset used by QueryEngine + tools) ─────────

export interface AnthropicStreamEvent {
  type: string
  index?: number
  content_block?: {
    type: string
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }
  delta?: {
    type: string
    text?: string
    partial_json?: string
    thinking?: string
  }
  message?: {
    id: string
    type: 'message'
    role: 'assistant'
    model: string
    content: unknown[]
    stop_reason: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
  usage?: { input_tokens: number; output_tokens: number }
}

/**
 * Convert a stream of ProviderStreamEvents (from DeepSeek client)
 * into Anthropic-compatible SSE events that the web frontend and
 * QueryEngine can consume.
 */
export async function* bridgeToAnthropicStream(
  source: AsyncGenerator<ProviderStreamEvent>,
  model: string,
): AsyncGenerator<AnthropicStreamEvent> {
  let blockIndex = 0
  const messageId = `msg_ds_${Date.now()}`

  // Emit message_start
  yield {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  }

  let currentTextBlock = false

  for await (const event of source) {
    switch (event.type) {
      case 'thinking':
        // Map to Anthropic thinking block
        if (event.thinking) {
          yield {
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'thinking',
              thinking: event.thinking,
            },
          }
          yield {
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'thinking_delta', thinking: event.thinking },
          }
          yield { type: 'content_block_stop', index: blockIndex }
          blockIndex++
        }
        break

      case 'text':
        if (event.content) {
          if (!currentTextBlock) {
            yield {
              type: 'content_block_start',
              index: blockIndex,
              content_block: { type: 'text', text: '' },
            }
            currentTextBlock = true
          }
          yield {
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'text_delta', text: event.content },
          }
        }
        break

      case 'tool_use':
        // Close any open text block
        if (currentTextBlock) {
          yield { type: 'content_block_stop', index: blockIndex }
          blockIndex++
          currentTextBlock = false
        }

        if (event.tool) {
          yield {
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'tool_use',
              id: event.tool.id,
              name: event.tool.name,
              input: event.tool.input,
            },
          }
          // Send the full input as a single delta
          yield {
            type: 'content_block_delta',
            index: blockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(event.tool.input),
            },
          }
          yield { type: 'content_block_stop', index: blockIndex }
          blockIndex++
        }
        break

      case 'error':
        // Close any open text block
        if (currentTextBlock) {
          yield { type: 'content_block_stop', index: blockIndex }
          blockIndex++
          currentTextBlock = false
        }
        yield {
          type: 'content_block_start',
          index: blockIndex,
          content_block: {
            type: 'text',
            text: `[DeepSeek Error] ${event.error}`,
          },
        }
        yield { type: 'content_block_stop', index: blockIndex }
        blockIndex++
        break

      case 'done':
        // Close any open text block
        if (currentTextBlock) {
          yield { type: 'content_block_stop', index: blockIndex }
          currentTextBlock = false
        }
        yield {
          type: 'message_delta',
          delta: { type: 'message_delta', stop_reason: 'end_turn' },
          usage: event.usage
            ? {
                input_tokens: event.usage.inputTokens,
                output_tokens: event.usage.outputTokens,
              }
            : { input_tokens: 0, output_tokens: 0 },
        }
        yield { type: 'message_stop' }
        break
    }
  }

  // Safety: close any dangling text block
  if (currentTextBlock) {
    yield { type: 'content_block_stop', index: blockIndex }
  }
}

/**
 * Convert a non-streaming DeepSeek response into Anthropic message format.
 * Used for the web chat API route.
 */
export function bridgeToAnthropicMessage(
  content: Array<{
    type: string
    text?: string
    toolUseId?: string
    toolName?: string
    toolInput?: Record<string, unknown>
  }>,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
  stopReason: string,
): Record<string, unknown> {
  const anthropicContent = content.map((block) => {
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.toolUseId,
        name: block.toolName,
        input: block.toolInput || {},
      }
    }
    return { type: 'text', text: block.text || '' }
  })

  return {
    id: `msg_ds_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: anthropicContent,
    stop_reason: stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    },
  }
}
