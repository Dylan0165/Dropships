/**
 * Multimodal Scaffolding — Future-proofing for DeepSeek vision/video support.
 *
 * DeepSeek does NOT currently support multimodal input (images/video).
 * This module provides:
 * 1. Types and interfaces ready for when multimodal is added
 * 2. Video metadata extraction (text-based, works now)
 * 3. Frame extraction utilities (placeholder, requires ffmpeg)
 * 4. Content preprocessing pipeline
 *
 * When DeepSeek adds multimodal:
 * - Set DEEPSEEK_MULTIMODAL_ENABLED=1
 * - Update the model in fetch-bridge.ts mapModel()
 * - The video-inspiration-agent will auto-detect and use frame analysis
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface VideoInput {
  url: string
  platform: 'tiktok' | 'instagram' | 'youtube' | 'other'
  /** Video metadata (always available) */
  metadata: VideoMetadata
  /** Extracted frames as base64 (future: when multimodal is available) */
  frames?: VideoFrame[]
  /** Transcript/captions text */
  transcript?: string
}

export interface VideoMetadata {
  title: string
  description: string
  hashtags: string[]
  views: number
  likes: number
  shares: number
  comments: number
  creatorFollowers?: number
  postedAt?: string
  durationSeconds?: number
  musicTrack?: string
}

export interface VideoFrame {
  /** Base64-encoded image (PNG/JPEG) */
  data: string
  /** MIME type */
  mimeType: 'image/png' | 'image/jpeg'
  /** Timestamp in seconds */
  timestampSeconds: number
  /** Frame description (from AI if available) */
  description?: string
}

export interface ImageInput {
  data: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  description?: string
}

export interface MultimodalMessage {
  role: 'user' | 'assistant' | 'system'
  content: Array<TextContent | ImageContent | VideoContent>
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface VideoContent {
  type: 'video'
  source: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string
    url?: string
  }
}

// ── Feature Detection ────────────────────────────────────────────────────────

export function isMultimodalEnabled(): boolean {
  return process.env.DEEPSEEK_MULTIMODAL_ENABLED === '1'
}

export function getMultimodalModel(): string {
  return process.env.DEEPSEEK_MULTIMODAL_MODEL || 'deepseek-chat'
}

// ── Text-based Video Analysis (works now) ────────────────────────────────────

/**
 * Calculate virality score from video metadata.
 * 0-100 scale. Works without multimodal.
 */
export function calculateViralityScore(metadata: VideoMetadata): number {
  const { views, likes, shares, comments } = metadata

  if (views === 0) return 0

  const engagementRate = ((likes + shares + comments) / views) * 100
  const shareability = (shares / views) * 100
  const hoursOld = metadata.postedAt
    ? (Date.now() - new Date(metadata.postedAt).getTime()) / 3600000
    : 168 // default 1 week
  const growthVelocity = views / Math.max(hoursOld, 1)

  // Weighted score (0-100)
  const score =
    Math.min(engagementRate * 5, 30) + // max 30 pts from engagement
    Math.min(shareability * 20, 25) + // max 25 pts from shares
    Math.min(growthVelocity / 1000, 25) + // max 25 pts from velocity
    Math.min(views / 1_000_000, 20) // max 20 pts from raw views

  return Math.round(Math.min(score, 100))
}

/**
 * Extract product signals from video text content.
 * Works without multimodal — uses titles, descriptions, transcripts.
 */
export function extractProductSignals(
  title: string,
  description: string,
  transcript?: string,
): {
  productMentions: string[]
  painPoints: string[]
  pricePoints: number[]
  categories: string[]
} {
  const allText = [title, description, transcript || ''].join(' ').toLowerCase()

  // Product mention patterns
  const productPatterns = [
    /(?:this|these|the|my|our)\s+(\w+(?:\s+\w+){0,3})/g,
    /(?:bought|ordered|got)\s+(?:this|these|a|an)\s+(\w+(?:\s+\w+){0,3})/g,
  ]
  const productMentions: string[] = []
  for (const pattern of productPatterns) {
    let match
    while ((match = pattern.exec(allText)) !== null) {
      if (match[1] && match[1].length > 3) {
        productMentions.push(match[1].trim())
      }
    }
  }

  // Pain point patterns
  const painPatterns = [
    /(?:tired of|sick of|struggling with|problem with|hate when)\s+(.+?)(?:\.|!|\?|$)/g,
    /(?:finally|never again|no more)\s+(.+?)(?:\.|!|\?|$)/g,
  ]
  const painPoints: string[] = []
  for (const pattern of painPatterns) {
    let match
    while ((match = pattern.exec(allText)) !== null) {
      if (match[1]) painPoints.push(match[1].trim())
    }
  }

  // Price extraction
  const pricePattern = /(?:€|EUR|\$|USD)\s*(\d+(?:[.,]\d{2})?)/g
  const pricePoints: number[] = []
  let priceMatch
  while ((priceMatch = pricePattern.exec(allText)) !== null) {
    const price = parseFloat(priceMatch[1].replace(',', '.'))
    if (price > 0 && price < 10000) pricePoints.push(price)
  }

  // Category classification
  const categoryKeywords: Record<string, string[]> = {
    beauty: ['makeup', 'skincare', 'serum', 'cream', 'foundation', 'lipstick'],
    fitness: ['gym', 'workout', 'exercise', 'resistance', 'yoga', 'fitness'],
    kitchen: ['kitchen', 'cooking', 'food', 'recipe', 'gadget', 'appliance'],
    tech: ['phone', 'laptop', 'gadget', 'bluetooth', 'wireless', 'charging'],
    home_decor: ['room', 'decor', 'light', 'led', 'aesthetic', 'cozy'],
    fashion: ['outfit', 'dress', 'shoes', 'style', 'fashion', 'wear'],
    pet: ['dog', 'cat', 'pet', 'puppy', 'kitten', 'animal'],
  }

  const categories: string[] = []
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => allText.includes(kw))) {
      categories.push(category)
    }
  }

  return { productMentions, painPoints, pricePoints, categories }
}

/**
 * Detect trending hashtags and classify their velocity.
 */
export function classifyHashtagTrend(
  hashtag: string,
  currentViews: number,
  avgViewsLastMonth?: number,
): 'rising' | 'stable' | 'declining' | 'unknown' {
  if (!avgViewsLastMonth) return 'unknown'
  const ratio = currentViews / avgViewsLastMonth
  if (ratio > 1.5) return 'rising'
  if (ratio > 0.8) return 'stable'
  return 'declining'
}
