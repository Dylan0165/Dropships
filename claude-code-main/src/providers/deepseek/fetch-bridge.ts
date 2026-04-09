/**
 * Fetch Bridge — Custom fetch function passed to the Anthropic SDK
 * that intercepts API calls and translates them to DeepSeek format.
 *
 * This is the KEY integration point. Instead of rewriting the QueryEngine,
 * tools, or any of the 500K+ lines that depend on Anthropic SDK types,
 * we intercept at the HTTP boundary:
 *
 *   Anthropic SDK → fetch() → [[THIS BRIDGE]] → DeepSeek API
 *   Anthropic SDK ← fetch() ← [[THIS BRIDGE]] ← DeepSeek API
 *
 * The bridge translates:
 *   - Anthropic Messages API → OpenAI Chat Completions API
 *   - OpenAI Chat Completions response → Anthropic Messages response
 *   - SSE streaming events in both directions
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  thinking?: string
  signature?: string
  // Extended thinking budget
  budget_tokens?: number
}

interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string | Array<{ type: string; text: string; cache_control?: unknown }>
  tools?: AnthropicTool[]
  tool_choice?: unknown
  stream?: boolean
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  metadata?: unknown
  thinking?: { type: string; budget_tokens: number }
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

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
    description?: string
    parameters: Record<string, unknown>
  }
}

// ── Model mapping ────────────────────────────────────────────────────────────

/** Map Anthropic/internal model names to DeepSeek model IDs */
function mapModel(anthropicModel: string): string {
  const m = anthropicModel.toLowerCase()

  // Explicit DeepSeek models pass through
  if (m.startsWith('deepseek-')) return m

  // Map Claude models to DeepSeek equivalents
  // Opus/heavy-think models → deepseek-reasoner (R1)
  if (m.includes('opus')) return 'deepseek-reasoner'

  // Reviewers use reasoner
  if (m.includes('reviewer') || m.includes('reasoner')) return 'deepseek-reasoner'

  // Everything else (Sonnet, Haiku, etc.) → deepseek-chat (V3)
  return 'deepseek-chat'
}

/** Check if a model is the reasoner (R1) — it does NOT support tool calling */
function isReasonerModel(model: string): boolean {
  return model === 'deepseek-reasoner'
}

// ── Message conversion: Anthropic → OpenAI ───────────────────────────────────

function flattenAnthropicContent(
  content: string | AnthropicContentBlock[],
): string {
  if (typeof content === 'string') return content
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n')
}

function extractToolCalls(
  content: AnthropicContentBlock[],
): OAIToolCall[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'function' as const,
      function: {
        name: b.name || '',
        arguments: JSON.stringify(b.input || {}),
      },
    }))
}

function convertMessages(
  messages: AnthropicMessage[],
  dsModel: string,
): OAIMessage[] {
  const oaiMessages: OAIMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        oaiMessages.push({ role: 'user', content: msg.content })
      } else {
        // Check for tool_result blocks (these are tool responses in Anthropic format)
        const toolResults = msg.content.filter((b) => b.type === 'tool_result')
        const textBlocks = msg.content.filter(
          (b) => b.type === 'text' || b.type === 'image',
        )

        // Add tool results as separate tool messages
        for (const tr of toolResults) {
          const resultContent =
            typeof tr.content === 'string'
              ? tr.content
              : Array.isArray(tr.content)
                ? tr.content
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text)
                    .join('\n')
                : ''
          oaiMessages.push({
            role: 'tool',
            content: resultContent,
            tool_call_id: tr.tool_use_id || '',
          })
        }

        // Add remaining text as user message
        if (textBlocks.length > 0) {
          oaiMessages.push({
            role: 'user',
            content: flattenAnthropicContent(textBlocks),
          })
        }

        // If only tool results, don't add empty user message
        if (toolResults.length > 0 && textBlocks.length === 0) {
          continue
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        oaiMessages.push({ role: 'assistant', content: msg.content })
      } else {
        const text = flattenAnthropicContent(msg.content)
        const toolCalls = isReasonerModel(dsModel)
          ? []
          : extractToolCalls(msg.content)

        if (toolCalls.length > 0) {
          oaiMessages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls,
          })
        } else {
          oaiMessages.push({ role: 'assistant', content: text })
        }
      }
    }
  }

  return oaiMessages
}

function convertTools(tools: AnthropicTool[]): OAITool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

function buildSystemMessage(
  system: AnthropicRequest['system'],
): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system.map((s) => s.text).join('\n\n')
}

// ── Response conversion: OpenAI → Anthropic ──────────────────────────────────

function convertNonStreamingResponse(
  oaiResponse: Record<string, unknown>,
  originalModel: string,
): Record<string, unknown> {
  const choices = (oaiResponse.choices as Array<Record<string, unknown>>) || []
  const choice = choices[0] || {}
  const message = (choice.message as Record<string, unknown>) || {}
  const usage = (oaiResponse.usage as Record<string, unknown>) || {}

  const content: unknown[] = []

  // Handle reasoning_content (R1 chain-of-thought)
  if (message.reasoning_content) {
    content.push({
      type: 'thinking',
      thinking: message.reasoning_content as string,
      signature: '',
    })
  }

  // Handle text content
  if (message.content) {
    content.push({ type: 'text', text: message.content as string })
  }

  // Handle tool calls
  const toolCalls = message.tool_calls as OAIToolCall[] | undefined
  if (toolCalls?.length) {
    for (const tc of toolCalls) {
      let parsedInput: Record<string, unknown> = {}
      try {
        parsedInput = JSON.parse(tc.function.arguments)
      } catch {
        parsedInput = { raw: tc.function.arguments }
      }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: parsedInput,
      })
    }
  }

  const stopReason = toolCalls?.length
    ? 'tool_use'
    : (choice.finish_reason as string) === 'length'
      ? 'max_tokens'
      : 'end_turn'

  return {
    id: `msg_ds_${(oaiResponse.id as string) || Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: originalModel,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: (usage.prompt_tokens as number) || 0,
      output_tokens: (usage.completion_tokens as number) || 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

// ── Streaming translation: OpenAI SSE → Anthropic SSE ────────────────────────

function buildAnthropicSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function translateStreamingResponse(
  oaiResponse: Response,
  originalModel: string,
): Promise<Response> {
  const reader = oaiResponse.body?.getReader()
  if (!reader) {
    throw new Error('No response body for streaming')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let blockIndex = 0
  let textBlockOpen = false
  let sentMessageStart = false
  let inputTokens = 0
  let outputTokens = 0

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          // Close any open text block
          if (textBlockOpen) {
            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('content_block_stop', { type: 'content_block_stop', index: blockIndex }),
              ),
            )
          }
          // Send message_delta with stop reason
          controller.enqueue(
            new TextEncoder().encode(
              buildAnthropicSSE('message_delta', {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: outputTokens },
              }),
            ),
          )
          // Send message_stop
          controller.enqueue(
            new TextEncoder().encode(
              buildAnthropicSSE('message_stop', { type: 'message_stop' }),
            ),
          )
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6).trim()
          if (dataStr === '[DONE]') continue

          let chunk: Record<string, unknown>
          try {
            chunk = JSON.parse(dataStr)
          } catch {
            continue
          }

          // Extract usage if present
          const chunkUsage = chunk.usage as Record<string, unknown> | undefined
          if (chunkUsage) {
            inputTokens = (chunkUsage.prompt_tokens as number) || inputTokens
            outputTokens =
              (chunkUsage.completion_tokens as number) || outputTokens
          }

          // Emit message_start on first chunk
          if (!sentMessageStart) {
            sentMessageStart = true
            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('message_start', {
                  type: 'message_start',
                  message: {
                    id: `msg_ds_${(chunk.id as string) || Date.now()}`,
                    type: 'message',
                    role: 'assistant',
                    model: originalModel,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                      input_tokens: inputTokens,
                      output_tokens: 0,
                      cache_read_input_tokens: 0,
                      cache_creation_input_tokens: 0,
                    },
                  },
                }),
              ),
            )
          }

          const choices =
            (chunk.choices as Array<Record<string, unknown>>) || []
          const delta =
            (choices[0]?.delta as Record<string, unknown>) || {}

          // Handle reasoning_content (R1 thinking)
          if (delta.reasoning_content) {
            if (!textBlockOpen || blockIndex === 0) {
              // Emit a thinking block
              controller.enqueue(
                new TextEncoder().encode(
                  buildAnthropicSSE('content_block_start', {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: { type: 'thinking', thinking: '' },
                  }),
                ),
              )
            }
            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('content_block_delta', {
                  type: 'content_block_delta',
                  index: blockIndex,
                  delta: {
                    type: 'thinking_delta',
                    thinking: delta.reasoning_content as string,
                  },
                }),
              ),
            )
          }

          // Handle text content
          if (delta.content) {
            if (!textBlockOpen) {
              // Close thinking block if we had one
              if (blockIndex > 0 || delta.reasoning_content) {
                controller.enqueue(
                  new TextEncoder().encode(
                    buildAnthropicSSE('content_block_stop', {
                      type: 'content_block_stop',
                      index: blockIndex,
                    }),
                  ),
                )
                blockIndex++
              }
              controller.enqueue(
                new TextEncoder().encode(
                  buildAnthropicSSE('content_block_start', {
                    type: 'content_block_start',
                    index: blockIndex,
                    content_block: { type: 'text', text: '' },
                  }),
                ),
              )
              textBlockOpen = true
            }
            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('content_block_delta', {
                  type: 'content_block_delta',
                  index: blockIndex,
                  delta: {
                    type: 'text_delta',
                    text: delta.content as string,
                  },
                }),
              ),
            )
          }

          // Handle tool calls
          const toolCalls =
            delta.tool_calls as Array<Record<string, unknown>> | undefined
          if (toolCalls?.length) {
            // Close text block if open
            if (textBlockOpen) {
              controller.enqueue(
                new TextEncoder().encode(
                  buildAnthropicSSE('content_block_stop', {
                    type: 'content_block_stop',
                    index: blockIndex,
                  }),
                ),
              )
              blockIndex++
              textBlockOpen = false
            }

            for (const tc of toolCalls) {
              const fn = tc.function as Record<string, unknown> | undefined
              if (fn?.name) {
                // New tool call
                controller.enqueue(
                  new TextEncoder().encode(
                    buildAnthropicSSE('content_block_start', {
                      type: 'content_block_start',
                      index: blockIndex,
                      content_block: {
                        type: 'tool_use',
                        id:
                          (tc.id as string) ||
                          `toolu_ds_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: fn.name,
                        input: {},
                      },
                    }),
                  ),
                )
              }
              if (fn?.arguments) {
                controller.enqueue(
                  new TextEncoder().encode(
                    buildAnthropicSSE('content_block_delta', {
                      type: 'content_block_delta',
                      index: blockIndex,
                      delta: {
                        type: 'input_json_delta',
                        partial_json: fn.arguments as string,
                      },
                    }),
                  ),
                )
              }
            }
          }

          // Check for finish_reason
          const finishReason = choices[0]?.finish_reason
          if (finishReason) {
            if (textBlockOpen) {
              controller.enqueue(
                new TextEncoder().encode(
                  buildAnthropicSSE('content_block_stop', {
                    type: 'content_block_stop',
                    index: blockIndex,
                  }),
                ),
              )
              textBlockOpen = false
            }

            const stopReason =
              finishReason === 'tool_calls'
                ? 'tool_use'
                : finishReason === 'length'
                  ? 'max_tokens'
                  : 'end_turn'

            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('message_delta', {
                  type: 'message_delta',
                  delta: {
                    stop_reason: stopReason,
                    stop_sequence: null,
                  },
                  usage: { output_tokens: outputTokens },
                }),
              ),
            )
            controller.enqueue(
              new TextEncoder().encode(
                buildAnthropicSSE('message_stop', { type: 'message_stop' }),
              ),
            )
            controller.close()
            return
          }
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ── Main bridge function ─────────────────────────────────────────────────────

const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'

/**
 * Creates a custom fetch function that translates Anthropic API calls
 * to DeepSeek format. Pass this to the Anthropic SDK constructor.
 *
 * Usage:
 *   const client = new Anthropic({
 *     fetch: createDeepSeekFetch(),
 *     apiKey: 'dummy', // not used but SDK requires it
 *   })
 */
export function createDeepSeekFetch(): typeof globalThis.fetch {
  const apiKey = process.env.DEEPSEEK_API_KEY || ''

  return async function deepseekFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = input.toString()

    // Only intercept Anthropic API calls (messages endpoint)
    if (!url.includes('/v1/messages') && !url.includes('/messages')) {
      // Pass through non-API calls (e.g. models endpoint, etc.)
      return globalThis.fetch(input, init)
    }

    // Parse the Anthropic request body
    let anthropicBody: AnthropicRequest
    try {
      anthropicBody = JSON.parse((init?.body as string) || '{}')
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse request body' }),
        { status: 400 },
      )
    }

    const dsModel = mapModel(anthropicBody.model)
    const isStreaming = !!anthropicBody.stream
    const isReasoner = isReasonerModel(dsModel)

    // Build OpenAI-format request
    const systemMessage = buildSystemMessage(anthropicBody.system)
    const oaiMessages = convertMessages(anthropicBody.messages, dsModel)

    // Prepend system message
    if (systemMessage) {
      oaiMessages.unshift({ role: 'system', content: systemMessage })
    }

    const oaiBody: Record<string, unknown> = {
      model: dsModel,
      messages: oaiMessages,
      max_tokens: anthropicBody.max_tokens || 8192,
      stream: isStreaming,
    }

    // Only add these for non-reasoner models (R1 doesn't support them)
    if (!isReasoner) {
      if (anthropicBody.temperature !== undefined) {
        oaiBody.temperature = anthropicBody.temperature
      }
      if (anthropicBody.top_p !== undefined) {
        oaiBody.top_p = anthropicBody.top_p
      }
      if (anthropicBody.stop_sequences?.length) {
        oaiBody.stop = anthropicBody.stop_sequences
      }
      // Tools (R1 doesn't support function calling)
      if (anthropicBody.tools?.length) {
        oaiBody.tools = convertTools(anthropicBody.tools)
      }
    }

    // Add stream_options for usage in streaming mode
    if (isStreaming) {
      oaiBody.stream_options = { include_usage: true }
    }

    // Send to DeepSeek
    const dsResponse = await globalThis.fetch(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(init?.headers
            ? Object.fromEntries(
                Object.entries(init.headers as Record<string, string>).filter(
                  ([k]) =>
                    !k.toLowerCase().startsWith('x-') &&
                    k.toLowerCase() !== 'authorization' &&
                    k.toLowerCase() !== 'anthropic-version',
                ),
              )
            : {}),
        },
        body: JSON.stringify(oaiBody),
        signal: init?.signal,
      },
    )

    if (!dsResponse.ok) {
      const errorBody = await dsResponse.text()
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: `DeepSeek API error (${dsResponse.status}): ${errorBody}`,
          },
        }),
        {
          status: dsResponse.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Handle streaming vs non-streaming
    if (isStreaming) {
      return translateStreamingResponse(dsResponse, anthropicBody.model)
    }

    // Non-streaming: convert response
    const oaiResult = (await dsResponse.json()) as Record<string, unknown>
    const anthropicResult = convertNonStreamingResponse(
      oaiResult,
      anthropicBody.model,
    )

    return new Response(JSON.stringify(anthropicResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
