/**
 * Image generation — 3-provider fallback chain:
 *   1. OpenAI gpt-image-1 (quality: "high")   — lifestyle / hero
 *   2. Flux 1.1 Pro via Replicate              — product shots
 *   3. Flux Dev via Replicate                  — fallback
 *
 * Public API:
 *   generateProductImages()  — backward-compatible (3 product shots)
 *   generateStoreImages()    — full set: products + hero + social proof + logo
 *   generateAdCreatives()    — 9 ad images across 3 aspect ratios
 */
import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = path.resolve(__dirname, '../../data/images')

const OPENAI_API_KEY      = () => process.env.OPENAI_API_KEY ?? ''
const REPLICATE_API_TOKEN = () => process.env.REPLICATE_API_TOKEN ?? ''
const IMAGE_PROVIDER      = () => (process.env.IMAGE_PROVIDER ?? 'flux').toLowerCase()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateStoreImagesResult {
  products:     string[]   // 3 product shot URLs/paths
  hero:         string[]   // 3 hero background URLs/paths
  social_proof: string[]   // 2 lifestyle background URLs/paths
  logo_concept: string[]   // 1 logo concept URL/path
}

export interface GenerateAdCreativesResult {
  square:    string[]   // 1:1  — 3 images
  portrait:  string[]   // 4:5  — 3 images
  story:     string[]   // 9:16 — 3 images
}

// ── Directory helpers ─────────────────────────────────────────────────────────

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function imagePath(storeId: string, subfolder: string, name: string): string {
  const dir = path.join(DATA_DIR, storeId, subfolder)
  ensureDir(dir)
  return path.join(dir, name)
}

// ── Download helper ───────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject)
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve(dest) })
    }).on('error', (err) => {
      fs.unlink(dest, () => { /* ignore */ })
      reject(err)
    })
  })
}

// ── Provider: OpenAI GPT-4o Images ────────────────────────────────────────────

async function openaiGenerateImage(
  prompt: string,
  size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
): Promise<string | null> {
  const key = OPENAI_API_KEY()
  if (!key) return null

  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size,
        quality: 'high',
        output_format: 'webp',
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!resp.ok) {
      console.warn(`[image-gen] OpenAI failed: ${resp.status}`)
      return null
    }
    const data = await resp.json() as { data: { url?: string }[] }
    return data.data[0]?.url ?? null
  } catch (err) {
    console.warn('[image-gen] OpenAI error:', err)
    return null
  }
}

// ── Provider: Flux via Replicate ───────────────────────────────────────────────

async function replicateGenerateImage(
  prompt: string,
  model: 'flux-1.1-pro' | 'flux-dev' = 'flux-1.1-pro',
  aspectRatio = '1:1',
): Promise<string | null> {
  const token = REPLICATE_API_TOKEN()
  if (!token) return null

  const modelId = model === 'flux-1.1-pro'
    ? 'black-forest-labs/flux-1.1-pro'
    : 'black-forest-labs/flux-dev'

  try {
    const createResp = await fetch(`https://api.replicate.com/v1/models/${modelId}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
        Prefer: 'wait',
      },
      body: JSON.stringify({ input: { prompt, aspect_ratio: aspectRatio, output_format: 'webp' } }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!createResp.ok) {
      console.warn(`[image-gen] Replicate create failed: ${createResp.status}`)
      return null
    }
    const prediction = await createResp.json() as {
      id: string; status: string; output?: string[] | string | null; urls?: { get: string }
    }

    if (prediction.status === 'succeeded') {
      return Array.isArray(prediction.output) ? prediction.output[0] ?? null : prediction.output ?? null
    }

    // Poll
    const pollUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000))
      const poll = await fetch(pollUrl, {
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!poll.ok) continue
      const p = await poll.json() as { status: string; output?: string[] | string | null }
      if (p.status === 'succeeded') {
        return Array.isArray(p.output) ? p.output[0] ?? null : p.output ?? null
      }
      if (p.status === 'failed' || p.status === 'canceled') return null
    }
    console.warn('[image-gen] Replicate timeout')
    return null
  } catch (err) {
    console.warn('[image-gen] Replicate error:', err)
    return null
  }
}

// ── Unified generate with fallback chain ───────────────────────────────────────

async function generateImage(
  prompt: string,
  options: {
    preferOpenAI?: boolean
    openaiSize?: '1024x1024' | '1792x1024' | '1024x1792'
    aspectRatio?: string
  } = {},
): Promise<string | null> {
  const provider = IMAGE_PROVIDER()

  if (provider !== 'openai' && !options.preferOpenAI) {
    const fluxUrl = await replicateGenerateImage(prompt, 'flux-1.1-pro', options.aspectRatio ?? '1:1')
    if (fluxUrl) return fluxUrl
    return replicateGenerateImage(prompt, 'flux-dev', options.aspectRatio ?? '1:1')
  }

  const openaiUrl = await openaiGenerateImage(prompt, options.openaiSize ?? '1024x1024')
  if (openaiUrl) return openaiUrl

  const fluxUrl = await replicateGenerateImage(prompt, 'flux-1.1-pro', options.aspectRatio ?? '1:1')
  if (fluxUrl) return fluxUrl

  return replicateGenerateImage(prompt, 'flux-dev', options.aspectRatio ?? '1:1')
}

// ── Mock helper ────────────────────────────────────────────────────────────────

function mockUrl(label: string): string {
  return `https://placehold.co/1024x1024/7c3aed/ffffff?text=${encodeURIComponent(label.slice(0, 30))}`
}

// ── Save image URL/file to disk ────────────────────────────────────────────────

async function saveImage(
  url: string | null,
  dest: string,
  mockLabel: string,
): Promise<string> {
  if (!url) return mockUrl(mockLabel)
  if (url.startsWith('http')) {
    try {
      await downloadFile(url, dest)
      return dest
    } catch {
      return url
    }
  }
  return url
}

// ── Product image prompts ──────────────────────────────────────────────────────

function buildProductPrompts(productName: string, niche: string): string[] {
  return [
    `Professional product photography of ${productName}, white background, studio lighting, 4K, e-commerce style, ultra-sharp detail`,
    `Lifestyle photo of ${productName} in a modern European home, natural lighting, ${niche} niche, aspirational, warm tones`,
    `Close-up macro shot of ${productName}, showing premium material quality, sharp focus, soft background blur`,
  ]
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Backward-compatible: generate 3 product shots. Used by coordinator.ts */
export async function generateProductImages(params: {
  storeId: string
  productName: string
  niche: string
}): Promise<string[]> {
  const mock = !REPLICATE_API_TOKEN() && !OPENAI_API_KEY()
  if (mock) {
    console.log('[image-gen] mock mode — geen API tokens geconfigureerd')
    return buildProductPrompts(params.productName, params.niche).map((_, i) => mockUrl(`product_${i + 1}`))
  }

  const prompts = buildProductPrompts(params.productName, params.niche)
  const results: string[] = []
  for (let i = 0; i < prompts.length; i++) {
    const url = await generateImage(prompts[i], { aspectRatio: '1:1' })
    const dest = imagePath(params.storeId, 'products', `product_${i + 1}.webp`)
    results.push(await saveImage(url, dest, `product_${i + 1}`))
  }
  return results
}

/** Full store image set */
export async function generateStoreImages(params: {
  storeId: string
  productName: string
  niche: string
  brandName: string
  primaryColor?: string
}): Promise<GenerateStoreImagesResult> {
  const mock = !REPLICATE_API_TOKEN() && !OPENAI_API_KEY()

  const productPrompts = buildProductPrompts(params.productName, params.niche)
  const heroPrompts = [
    `Abstract gradient background for ${params.niche} e-commerce store, ${params.primaryColor ?? 'purple'} tones, minimalist, premium`,
    `Lifestyle hero background for ${params.niche} brand, European aesthetic, soft colors, wide format`,
    `Clean geometric pattern background for ${params.brandName}, brand color ${params.primaryColor ?? '#7c3aed'}`,
  ]
  const socialProofPrompts = [
    `Happy European customer using ${params.productName}, candid lifestyle photo, natural light`,
    `Modern living space featuring ${params.productName}, aspirational interior, Scandinavian style`,
  ]
  const logoPrompt = `Minimalist logo concept for ${params.brandName}, ${params.niche} brand, clean vector style, professional`

  async function gen(prompt: string, sub: string, name: string, opts: Parameters<typeof generateImage>[1] = {}): Promise<string> {
    if (mock) return mockUrl(name)
    const url = await generateImage(prompt, opts)
    return saveImage(url, imagePath(params.storeId, sub, `${name}.webp`), name)
  }

  const [p1, p2, p3] = await Promise.all(productPrompts.map((p, i) => gen(p, 'products', `product_${i+1}`, { aspectRatio: '1:1' })))
  const [h1, h2, h3] = await Promise.all(heroPrompts.map((p, i) => gen(p, 'hero', `hero_${i+1}`, { preferOpenAI: true, openaiSize: '1792x1024', aspectRatio: '16:9' })))
  const [s1, s2]     = await Promise.all(socialProofPrompts.map((p, i) => gen(p, 'social', `social_${i+1}`, { preferOpenAI: true })))
  const logo         = await gen(logoPrompt, 'logo', 'logo_concept', { aspectRatio: '1:1' })

  return {
    products:     [p1, p2, p3].filter(Boolean),
    hero:         [h1, h2, h3].filter(Boolean),
    social_proof: [s1, s2].filter(Boolean),
    logo_concept: [logo].filter(Boolean),
  }
}

/** Ad creatives — 3 formats × 3 hooks = 9 images */
export async function generateAdCreatives(params: {
  storeId: string
  productName: string
  niche: string
  adHooks: string[]
}): Promise<GenerateAdCreativesResult> {
  const mock = !REPLICATE_API_TOKEN() && !OPENAI_API_KEY()
  const hooks = [...params.adHooks.slice(0, 3)]
  while (hooks.length < 3) hooks.push(`Best ${params.productName}`)

  const formats: Array<{ key: keyof GenerateAdCreativesResult; ratio: string; size: '1024x1024' | '1024x1792' }> = [
    { key: 'square',   ratio: '1:1',  size: '1024x1024' },
    { key: 'portrait', ratio: '4:5',  size: '1024x1024' },
    { key: 'story',    ratio: '9:16', size: '1024x1792' },
  ]

  const result: GenerateAdCreativesResult = { square: [], portrait: [], story: [] }

  for (const fmt of formats) {
    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i]
      if (mock) {
        result[fmt.key].push(mockUrl(`ad_${fmt.key}_${i + 1}`))
        continue
      }
      const prompt = `Social media ad creative for ${params.productName}, ${fmt.key} format, hook: "${hook}", ${params.niche} niche, bold design`
      const url = await generateImage(prompt, { aspectRatio: fmt.ratio, openaiSize: fmt.size })
      const dest = imagePath(params.storeId, 'ads', `ad_${fmt.key}_${i + 1}.webp`)
      result[fmt.key].push(await saveImage(url, dest, `ad_${fmt.key}_${i + 1}`))
    }
  }

  return result
}

/** List all saved images for a store */
export function listStoreImages(storeId: string): Record<string, string[]> {
  const base = path.join(DATA_DIR, storeId)
  if (!fs.existsSync(base)) return {}
  const result: Record<string, string[]> = {}
  for (const sub of fs.readdirSync(base)) {
    const dir = path.join(base, sub)
    if (fs.statSync(dir).isDirectory()) {
      result[sub] = fs.readdirSync(dir)
        .filter(f => /\.(webp|png|jpg|jpeg)$/i.test(f))
        .map(f => path.join(dir, f))
    }
  }
  return result
}
