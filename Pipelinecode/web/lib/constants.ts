export const MODELS = [
  { id: "deepseek-chat", label: "DeepSeek V3", description: "Fast executor — tool calling, code gen, store building" },
  { id: "deepseek-reasoner", label: "DeepSeek R1", description: "Deep thinker — reviews, analytics, strategy" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most capable (requires Anthropic key)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Balanced (requires Anthropic key)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fastest (requires Anthropic key)" },
] as const;

export const DEFAULT_MODEL = "deepseek-chat";

export const API_ROUTES = {
  chat: "/api/chat",
  stream: "/api/stream",
} as const;

export const MAX_MESSAGE_LENGTH = 100_000;

export const STREAMING_CHUNK_SIZE = 64;

/** Pipeline agent → model mapping */
export const AGENT_MODEL_MAP: Record<string, string> = {
  // Executors use deepseek-chat (V3)
  "trend-agent": "deepseek-chat",
  "product-agent": "deepseek-chat",
  "brand-agent": "deepseek-chat",
  "store-builder": "deepseek-chat",
  "ads-agent": "deepseek-chat",
  "growth-agent": "deepseek-chat",
  // Reviewers use deepseek-reasoner (R1)
  "niche-reviewer": "deepseek-reasoner",
  "product-reviewer": "deepseek-reasoner",
  "store-reviewer": "deepseek-reasoner",
  "ads-reviewer": "deepseek-reasoner",
  // Security uses reasoner for deep analysis
  "security-agent": "deepseek-reasoner",
} as const;
