/**
 * Store Platform Stub — Minimal Express service on port 3002
 * that accepts store creation requests and returns a store_id + preview_url.
 * 
 * This is a development stub. In production, this would connect to
 * a real hosting platform (Vercel, Netlify, etc.).
 */
import 'dotenv/config'
import express from 'express'
import { v4 as uuid } from 'uuid'

const PORT = parseInt(process.env.PLATFORM_PORT ?? '3002', 10)
const app = express()
app.use(express.json())

// In-memory store registry (stub)
const stores = new Map<string, {
  storeId: string
  subdomein: string
  niche: string
  status: 'building' | 'live' | 'paused' | 'killed'
  createdAt: string
  config: Record<string, unknown>
}>()

// ─── Create a new store ───
app.post('/api/stores/create', (req, res) => {
  const { subdomein, niche, brandConfig, components } = req.body

  if (!subdomein || !niche) {
    res.status(400).json({ error: 'subdomein and niche are required' })
    return
  }

  const storeId = uuid()
  const store = {
    storeId,
    subdomein: subdomein.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    niche,
    status: 'building' as const,
    createdAt: new Date().toISOString(),
    config: { brandConfig, components },
  }
  stores.set(storeId, store)

  // Simulate build delay — mark as live after 3s
  setTimeout(() => {
    const s = stores.get(storeId)
    if (s && s.status === 'building') {
      s.status = 'live'
    }
  }, 3000)

  res.json({
    storeId,
    subdomein: store.subdomein,
    previewUrl: `http://localhost:${PORT}/preview/${store.subdomein}`,
    status: store.status,
  })
})

// ─── Get store status ───
app.get('/api/stores/:storeId', (req, res) => {
  const store = stores.get(req.params.storeId)
  if (!store) {
    res.status(404).json({ error: 'Store not found' })
    return
  }
  res.json({
    storeId: store.storeId,
    subdomein: store.subdomein,
    niche: store.niche,
    status: store.status,
    previewUrl: `http://localhost:${PORT}/preview/${store.subdomein}`,
    createdAt: store.createdAt,
  })
})

// ─── List all stores ───
app.get('/api/stores', (_req, res) => {
  res.json([...stores.values()].map(s => ({
    storeId: s.storeId,
    subdomein: s.subdomein,
    niche: s.niche,
    status: s.status,
    previewUrl: `http://localhost:${PORT}/preview/${s.subdomein}`,
    createdAt: s.createdAt,
  })))
})

// ─── Update store status (pause/kill) ───
app.patch('/api/stores/:storeId', (req, res) => {
  const store = stores.get(req.params.storeId)
  if (!store) {
    res.status(404).json({ error: 'Store not found' })
    return
  }
  const { status } = req.body
  if (status && ['building', 'live', 'paused', 'killed'].includes(status)) {
    store.status = status
  }
  res.json({ storeId: store.storeId, status: store.status })
})

// ─── Preview page (stub) ───
app.get('/preview/:subdomein', (req, res) => {
  const store = [...stores.values()].find(s => s.subdomein === req.params.subdomein)
  if (!store) {
    res.status(404).send('Store not found')
    return
  }
  res.send(`<!DOCTYPE html>
<html>
<head><title>${store.subdomein} — Preview</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;flex-direction:column;gap:1rem}</style>
</head>
<body>
  <h1>🏪 ${store.subdomein}</h1>
  <p>Niche: ${store.niche}</p>
  <p>Status: <strong>${store.status}</strong></p>
  <p style="color:#94a3b8;font-size:0.875rem">This is a development preview stub.</p>
</body>
</html>`)
})

// ─── Health check ───
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, stores: stores.size })
})

app.listen(PORT, () => {
  console.log(`[store-platform-stub] Running on http://localhost:${PORT}`)
})
