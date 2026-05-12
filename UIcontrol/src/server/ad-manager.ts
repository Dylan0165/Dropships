/**
 * Ad Manager — Phase 1 (static image ads) + Phase 2 (Higgsfield video ads)
 *
 * Flow:
 *   generateAdsForStore()  → calls image-gen generateAdCreatives()
 *                          → inserts rows into ads table (status: ready)
 *   animateAdWithHiggsfield() → POST to Higgsfield image-to-video API
 *                             → inserts higgsfield_jobs row
 *                             → updates ad status to 'generating'
 *   pollHiggsfieldJobs()  → checks pending jobs, updates ad creative_url on completion
 */
import 'dotenv/config'
import db from './db.js'
import { generateAdCreatives } from './image-gen.js'
import { getAgentOutput } from './db.js'

const HIGGSFIELD_API_KEY = process.env.HIGGSFIELD_API_KEY ?? ''
const HIGGSFIELD_BASE    = 'https://api.higgsfield.ai/v1'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreBranding {
  brandName:  string
  slogan:     string
  niche:      string
  primary:    string
  secondary:  string
  accent:     string
  productImages: string[]
}

interface AdRow {
  id: number
  storeId: string
  runId: string | null
  platform: string
  format: string
  phase: string
  status: string
  higgsfieldJobId: string | null
  creativeUrl: string | null
  hook: string
  primaryText: string
  headline: string | null
  performanceScore: number | null
  createdAt: string
}

// ── Branding ──────────────────────────────────────────────────────────────────

export function getStoreBranding(storeId: string): StoreBranding | null {
  const store = db.prepare(
    `SELECT store_id, subdomein, niche, run_id, store_data FROM stores WHERE store_id = ?`,
  ).get(storeId) as { store_id: string; subdomein: string; niche: string; run_id: string; store_data: string | null } | undefined

  if (!store) return null

  // Try brand-agent output first (most complete)
  let brandName  = store.subdomein
  let slogan     = ''
  let primary    = '#2563eb'
  let secondary  = '#1e293b'
  let accent     = '#f59e0b'
  const productImages: string[] = []

  if (store.run_id) {
    const brandOut = getAgentOutput(store.run_id, 'brand-agent') as Record<string, unknown> | null
    if (brandOut) {
      brandName = (brandOut.name as string) || brandName
      slogan    = (brandOut.slogan as string) || ''
      const colors = brandOut.colors as Record<string, string> | undefined
      if (colors) {
        primary   = colors.primary   ?? primary
        secondary = colors.secondary ?? secondary
        accent    = colors.accent    ?? accent
      }
    }

    // Try store-builder output for product images
    const storeOut = getAgentOutput(store.run_id, 'store-builder') as Record<string, unknown> | null
    if (storeOut) {
      const imgs = storeOut.imageUrls as string[] | undefined
      if (imgs) productImages.push(...imgs.slice(0, 3))
    }
  }

  // Fallback: parse store_data JSON
  if (store.store_data) {
    try {
      const sd = JSON.parse(store.store_data) as Record<string, unknown>
      if (!slogan && sd.slogan) slogan = sd.slogan as string
      if (sd.primary_color) primary = sd.primary_color as string
      const colors = sd.colors as Record<string, string> | undefined
      if (colors) {
        primary   = colors.primary   ?? primary
        secondary = colors.secondary ?? secondary
        accent    = colors.accent    ?? accent
      }
      const prods = sd.products as Array<{ image?: string }> | undefined
      if (prods) {
        for (const p of prods.slice(0, 3)) {
          if (p.image && !productImages.includes(p.image)) productImages.push(p.image)
        }
      }
    } catch { /* ignore */ }
  }

  return { brandName, slogan, niche: store.niche, primary, secondary, accent, productImages }
}

// ── Phase 1 — Static image ads ────────────────────────────────────────────────

const AD_HOOKS = [
  'Stop scrollen. Dit verandert alles.',
  'Waarom iedereen dit bestelt.',
  '⬇ Kijk wat er gebeurt als je dit probeert.',
  'Dit wist ik niet totdat ik het zelf kocht.',
  'Besteld door 10.000+ tevreden klanten.',
]

const AD_TEXTS = [
  'Ontdek waarom onze klanten niet meer zonder kunnen. Bestel vandaag en ontvang gratis verzending.',
  'Top kwaliteit, eerlijke prijs. Meer dan 5.000 vijfsterrrereviews spreken voor zich.',
  'Tijdelijk aanbod: gratis verzending op alle bestellingen in NL & BE. Bestel vóór 23:00.',
  'Geen risico — 30 dagen retourrecht. Als je niet blij bent, krijg je je geld terug.',
  'Vandaag besteld = morgen in huis. Snelle levering, veilig betalen.',
]

export async function generateAdsForStore(storeId: string): Promise<AdRow[]> {
  const branding = getStoreBranding(storeId)
  if (!branding) throw new Error(`Store ${storeId} niet gevonden`)

  // Determine what images to use as ad creatives
  const imageUrls: string[] = branding.productImages.length > 0
    ? branding.productImages
    : []

  // Generate ad creatives via image-gen (if we have real images, or use mock)
  let generatedUrls: string[] = imageUrls
  if (imageUrls.length > 0) {
    try {
      const result = await generateAdCreatives({
        storeId,
        productName: branding.brandName,
        niche: branding.niche,
        adHooks: [],
      })
      // result has fields per format — collect any non-empty URLs
      const collected = Object.values(result).filter((v): v is string => typeof v === 'string' && v.length > 0)
      if (collected.length > 0) generatedUrls = collected
    } catch {
      generatedUrls = imageUrls
    }
  }

  const now = new Date().toISOString()
  const store = db.prepare(`SELECT run_id FROM stores WHERE store_id = ?`).get(storeId) as { run_id: string } | undefined
  const runId = store?.run_id ?? null

  const created: AdRow[] = []

  // Create 3 ads (1:1 / 9:16 / 16:9) with different hooks
  const formats: Array<{ format: string; headline: string }> = [
    { format: '1:1',  headline: `${branding.brandName} — Shop Nu` },
    { format: '9:16', headline: `${branding.brandName} — Story` },
    { format: '16:9', headline: `${branding.brandName} — Banner` },
  ]

  for (let i = 0; i < formats.length; i++) {
    const hook       = AD_HOOKS[i % AD_HOOKS.length]
    const primaryText = AD_TEXTS[i % AD_TEXTS.length]
    const creativeUrl = generatedUrls[i] ?? imageUrls[0] ?? null

    const result = db.prepare(`
      INSERT INTO ads (store_id, run_id, platform, format, phase, status, hook, primary_text, headline, creative_url, created_at)
      VALUES (?, ?, 'meta', 'image', 'static', ?, ?, ?, ?, ?, ?)
    `).run(storeId, runId, creativeUrl ? 'ready' : 'queued', hook, primaryText, formats[i].headline, creativeUrl, now)

    created.push({
      id: result.lastInsertRowid as number,
      storeId,
      runId,
      platform: 'meta',
      format: 'image',
      phase: 'static',
      status: creativeUrl ? 'ready' : 'queued',
      higgsfieldJobId: null,
      creativeUrl,
      hook,
      primaryText,
      headline: formats[i].headline,
      performanceScore: null,
      createdAt: now,
    })
  }

  return created
}

// ── Phase 2 — Higgsfield video animation ──────────────────────────────────────

export async function animateAdWithHiggsfield(adId: number): Promise<{ jobId: string } | null> {
  const ad = db.prepare(`SELECT * FROM ads WHERE id = ?`).get(adId) as AdRow | undefined
  if (!ad) throw new Error(`Ad ${adId} niet gevonden`)
  if (!ad.creativeUrl) throw new Error('Ad heeft geen creative URL om te animeren')

  const branding = getStoreBranding(ad.storeId)
  const prompt = branding
    ? `${branding.brandName} product showcase, ${branding.niche}, smooth cinematic motion, brand color ${branding.primary}, high-end commercial, 4K, no text overlay`
    : 'product showcase, smooth cinematic motion, high-end commercial, 4K, no text overlay'

  if (!HIGGSFIELD_API_KEY) {
    // Mock mode — return fake job ID so UI can show "generating"
    const mockJobId = `mock_${Date.now()}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO higgsfield_jobs (ad_id, job_id, status, input_image_url, prompt, created_at)
      VALUES (?, ?, 'processing', ?, ?, ?)
    `).run(adId, mockJobId, ad.creativeUrl, prompt, now)
    db.prepare(`UPDATE ads SET status = 'generating', higgsfield_job_id = ? WHERE id = ?`).run(mockJobId, adId)
    console.log(`[ad-manager] Mock Higgsfield job: ${mockJobId}`)
    return { jobId: mockJobId }
  }

  const resp = await fetch(`${HIGGSFIELD_BASE}/generate/image-to-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HIGGSFIELD_API_KEY}`,
    },
    body: JSON.stringify({
      image_url:    ad.creativeUrl,
      prompt,
      duration:     4,
      aspect_ratio: '9:16',
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Higgsfield API error ${resp.status}: ${err}`)
  }

  const data = await resp.json() as { job_id?: string; id?: string }
  const jobId = data.job_id ?? data.id
  if (!jobId) throw new Error('Higgsfield response bevat geen job_id')

  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO higgsfield_jobs (ad_id, job_id, status, input_image_url, prompt, created_at)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).run(adId, jobId, ad.creativeUrl, prompt, now)
  db.prepare(`UPDATE ads SET status = 'generating', higgsfield_job_id = ? WHERE id = ?`).run(jobId, adId)

  return { jobId }
}

// ── Poller — checks Higgsfield jobs every 15s ─────────────────────────────────

async function checkJob(jobId: string): Promise<{ status: string; videoUrl?: string }> {
  if (jobId.startsWith('mock_')) {
    // Simulate completion after 30s
    const ts = parseInt(jobId.replace('mock_', ''))
    const elapsed = Date.now() - ts
    if (elapsed > 30_000) return { status: 'completed', videoUrl: 'https://placehold.co/400x711.mp4' }
    return { status: 'processing' }
  }

  const resp = await fetch(`${HIGGSFIELD_BASE}/jobs/${jobId}`, {
    headers: { 'Authorization': `Bearer ${HIGGSFIELD_API_KEY}` },
  })
  if (!resp.ok) return { status: 'failed' }
  const data = await resp.json() as { status?: string; output_url?: string; video_url?: string }
  return {
    status:   data.status ?? 'processing',
    videoUrl: data.output_url ?? data.video_url,
  }
}

export function startHiggsfieldPoller(): void {
  setInterval(async () => {
    const pending = db.prepare(`
      SELECT hj.job_id, hj.ad_id FROM higgsfield_jobs hj
      WHERE hj.status IN ('pending', 'processing')
      LIMIT 10
    `).all() as Array<{ job_id: string; ad_id: number }>

    for (const job of pending) {
      try {
        const result = await checkJob(job.job_id)
        if (result.status === 'completed' && result.videoUrl) {
          db.prepare(`UPDATE higgsfield_jobs SET status = 'completed', output_video_url = ?, completed_at = ? WHERE job_id = ?`)
            .run(result.videoUrl, new Date().toISOString(), job.job_id)
          db.prepare(`UPDATE ads SET status = 'ready', format = 'video_animated', phase = 'animated', creative_url = ? WHERE id = ?`)
            .run(result.videoUrl, job.ad_id)
          console.log(`[ad-manager] Higgsfield job ${job.job_id} voltooid: ${result.videoUrl}`)
        } else if (result.status === 'failed') {
          db.prepare(`UPDATE higgsfield_jobs SET status = 'failed' WHERE job_id = ?`).run(job.job_id)
          db.prepare(`UPDATE ads SET status = 'queued' WHERE id = ?`).run(job.ad_id)
        }
      } catch (err) {
        console.error(`[ad-manager] Poll error ${job.job_id}:`, err)
      }
    }
  }, 15_000)
}

// ── Kill ad ───────────────────────────────────────────────────────────────────

export function killAd(adId: number): void {
  db.prepare(`UPDATE ads SET status = 'killed' WHERE id = ?`).run(adId)
}

// ── List ads for store ────────────────────────────────────────────────────────

export function getAdsForStore(storeId: string): AdRow[] {
  return db.prepare(`
    SELECT id, store_id as storeId, run_id as runId, platform, format, phase, status,
           higgsfield_job_id as higgsfieldJobId, creative_url as creativeUrl,
           hook, primary_text as primaryText, headline, performance_score as performanceScore,
           created_at as createdAt
    FROM ads WHERE store_id = ? ORDER BY created_at DESC
  `).all(storeId) as AdRow[]
}
