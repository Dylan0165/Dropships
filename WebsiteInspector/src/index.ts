/**
 * WebsiteInspector — Express service on port 8002
 * Checks deployed stores: HTTP status, response time, basic HTML structure.
 * Called by store-lifecycle.ts on the UIcontrol server.
 */

import express from 'express'
import 'dotenv/config'

const PORT = parseInt(process.env.INSPECTOR_PORT ?? '8002', 10)
const TIMEOUT_MS = parseInt(process.env.INSPECTOR_TIMEOUT_MS ?? '8000', 10)

const app = express()
app.use(express.json())

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'website-inspector' })
})

// ── Inspect single URL ───────────────────────────────────────────────────────

interface InspectResult {
  url: string
  ok: boolean
  statusCode: number | null
  responseTimeMs: number
  checks: {
    reachable: boolean
    hasTitle: boolean
    hasProducts: boolean
    hasCheckout: boolean
    hasNoJsErrors: boolean
  }
  error?: string
}

app.post('/inspect', async (req, res) => {
  const { url } = req.body as { url?: string }
  if (!url) {
    res.status(400).json({ error: 'url is required' })
    return
  }

  const result = await inspectUrl(url)
  res.json(result)
})

// ── Batch inspect ────────────────────────────────────────────────────────────

app.post('/inspect/batch', async (req, res) => {
  const { urls } = req.body as { urls?: string[] }
  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: 'urls array is required' })
    return
  }
  const results = await Promise.all(urls.map(inspectUrl))
  res.json(results)
})

// ── Core inspector ───────────────────────────────────────────────────────────

async function inspectUrl(url: string): Promise<InspectResult> {
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DropshipInspector/1.0' },
    })
    clearTimeout(timer)

    const responseTimeMs = Date.now() - start
    const html = await response.text()

    const checks = {
      reachable: response.ok,
      hasTitle: /<title[^>]*>[^<]+<\/title>/i.test(html),
      hasProducts: /product|artikel|bestellen|winkelwagen/i.test(html),
      hasCheckout: /checkout|bestelling|betalen|cart/i.test(html),
      hasNoJsErrors: !/<script[^>]*>\s*throw\s/i.test(html),
    }

    return {
      url,
      ok: response.ok && checks.reachable,
      statusCode: response.status,
      responseTimeMs,
      checks,
    }
  } catch (err: unknown) {
    return {
      url,
      ok: false,
      statusCode: null,
      responseTimeMs: Date.now() - start,
      checks: {
        reachable: false,
        hasTitle: false,
        hasProducts: false,
        hasCheckout: false,
        hasNoJsErrors: false,
      },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

app.listen(PORT, () => {
  console.log(`[inspector] running on port ${PORT}`)
})
