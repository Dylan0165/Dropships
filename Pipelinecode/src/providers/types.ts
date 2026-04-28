/**
 * Provider abstraction layer — enables swapping LLM backends
 * without touching orchestration, tools, or UI code.
 *
 * DeepSeek is the primary provider for the Dropship Pipeline.
 * The Anthropic SDK types are still used as the wire format because
 * the entire tool system, message history, and streaming pipeline
 * are built around them. This adapter translates DeepSeek ↔ Anthropic
 * shapes at the boundary so the rest of the codebase stays untouched.
 */

// ── Provider identity ───────────────────────────────────────────────────────
export type ProviderName = 'deepseek' | 'anthropic' | 'openai-compatible'

export interface ProviderConfig {
  name: ProviderName
  displayName: string
  baseUrl: string
  apiKey: string
  models: ModelDefinition[]
  /** Does this provider support the Anthropic Messages API format? */
  anthropicCompatible: boolean
  /** Does this provider support OpenAI chat completions format? */
  openaiCompatible: boolean
  /** Maximum parallel tool calls the provider supports */
  maxParallelToolCalls: number
  /** Provider supports streaming responses */
  supportsStreaming: boolean
  /** Provider supports image/vision input */
  supportsVision: boolean
  /** Provider supports video input (future) */
  supportsVideo: boolean
  /** Provider supports file/document input */
  supportsFiles: boolean
}

// ── Model definitions ───────────────────────────────────────────────────────
export type ModelRole = 'executor' | 'reasoner' | 'fast' | 'multimodal'

export interface ModelDefinition {
  id: string
  displayName: string
  role: ModelRole
  contextWindow: number
  maxOutputTokens: number
  /** Cost per million input tokens (USD) */
  inputCostPerMillion: number
  /** Cost per million output tokens (USD) */
  outputCostPerMillion: number
  /** Supports tool/function calling */
  supportsTools: boolean
  /** Supports structured JSON output */
  supportsJsonMode: boolean
  /** Supports vision/image input */
  supportsVision: boolean
  /** Supports extended thinking / chain-of-thought */
  supportsThinking: boolean
  /** Supports file attachments */
  supportsFiles: boolean
  /** Supports video input (future) */
  supportsVideo: boolean
}

// ── Streaming event types ───────────────────────────────────────────────────
export interface ProviderStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'done'
  content?: string
  tool?: {
    id: string
    name: string
    input: Record<string, unknown>
  }
  thinking?: string
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
}

// ── Provider interface ──────────────────────────────────────────────────────
export interface LLMProvider {
  config: ProviderConfig
  /**
   * Send a chat completion request.
   * Input and output use Anthropic message format for compatibility.
   */
  chat(params: ChatParams): Promise<ChatResponse>
  /**
   * Send a streaming chat completion request.
   * Yields events in a normalized format.
   */
  streamChat(params: ChatParams): AsyncGenerator<ProviderStreamEvent>
  /**
   * Check if the provider is reachable and the API key is valid.
   */
  healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs: number }>
  /**
   * Get the best model for a given role.
   */
  getModelForRole(role: ModelRole): ModelDefinition
}

export interface ChatParams {
  model: string
  messages: ChatMessage[]
  system?: string
  tools?: ToolDefinition[]
  maxTokens?: number
  temperature?: number
  topP?: number
  stream?: boolean
  /** Force JSON output */
  jsonMode?: boolean
  /** Enable extended thinking (reasoner models) */
  thinking?: boolean
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result'
  text?: string
  image?: { url: string; mediaType: string }
  toolUseId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  isError?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ChatResponse {
  content: ContentBlock[]
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
}
