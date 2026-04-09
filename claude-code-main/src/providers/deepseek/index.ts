/**
 * DeepSeek provider — barrel export.
 */
export { DeepSeekProvider, getDeepSeekProvider, resetDeepSeekProvider } from './client.js'
export { createDeepSeekFetch } from './fetch-bridge.js'
export { bridgeToAnthropicStream, bridgeToAnthropicMessage } from './bridge.js'
export {
  DEEPSEEK_CHAT,
  DEEPSEEK_REASONER,
  ALL_DEEPSEEK_MODELS,
  FUTURE_MULTIMODAL_MODELS,
  getDeepSeekProviderConfig,
  calculateDeepSeekCost,
  getDeepSeekModelForAgentCategory,
} from './models.js'
export {
  isMultimodalEnabled,
  getMultimodalModel,
  calculateViralityScore,
  extractProductSignals,
  classifyHashtagTrend,
  type VideoInput,
  type VideoMetadata,
  type VideoFrame,
  type ImageInput,
  type MultimodalMessage,
} from './multimodal.js'
