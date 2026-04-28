import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { AgentId, WsEvent } from '../types/index.js'
import * as store from './store.js'
import * as coordinator from './coordinator.js'
import * as deepseek from './deepseek.js'
import db from './db.js'
import { notifyApprovalNeeded } from './whatsapp.js'

const APPROVAL_PIN = process.env.APPROVAL_PIN ?? '1234'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT ?? '3001', 10)

const app = express()
app.use(express.json())

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })
const clients = new Set<WebSocket>()

// ── WebSocket upgrade ──
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
})

function broadcast(event: WsEvent): void {
  const data = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  // WhatsApp notificatie bij escalatie
  if (event.type === 'agent_escalation') {
    const run = store.getRun(event.runId)
    const payload = event.payload as { severity?: string; reason?: string }
    notifyApprovalNeeded({
      agentId: event.agentId ?? 'unknown',
      niche: run?.niche ?? 'onbekend',
      severity: payload.severity ?? 'MEDIUM',
      reason: payload.reason ?? 'Agent heeft goedkeuring nodig',
      runId: event.runId,
    }).catch(console.error)
  }
}

// ═══════ API Endpoints ═══════

app.post('/api/pipeline/start', (req, res) => {
  const { niche } = req.body
  if (!niche || typeof niche !== 'string' || !niche.trim()) {
    res.status(400).json({ error: 'niche is required' })
    return
  }
  const clean = niche.trim()

  // Enforce 1 niche = 1 brand = 1 webshop — check for existing runs with same/similar niche
  const allRuns = store.getAllRuns()
  const duplicate = allRuns.find(r =>
    r.niche.toLowerCase() === clean.toLowerCase() &&
    (r.status === 'running' || r.status === 'completed'),
  )
  if (duplicate) {
    res.status(409).json({
      error: `Niche "${clean}" already has a ${duplicate.status} pipeline (run ${duplicate.runId.slice(0, 8)}). 1 niche = 1 brand = 1 webshop.`,
    })
    return
  }

  const runId = uuid()
  store.createRun(runId, clean)

  // Mark the niche as 'used' in suggestions
  db.prepare(`UPDATE niches SET status = 'used', run_id = ?, updated_at = ? WHERE name = ? COLLATE NOCASE`)
    .run(runId, new Date().toISOString(), clean)

  coordinator.startPipeline(runId, clean, broadcast)
  broadcast({
    type: 'pipeline_started',
    runId,
    payload: { niche: clean },
    timestamp: new Date().toISOString(),
  })
  res.json({ runId })
})

app.post('/api/pipeline/stop', (req, res) => {
  const { runId } = req.body
  if (!runId) {
    res.status(400).json({ error: 'runId is required' })
    return
  }
  coordinator.stopPipeline(runId)
  store.completeRun(runId, 'failed')
  broadcast({
    type: 'pipeline_failed',
    runId,
    payload: { reason: 'Manually stopped' },
    timestamp: new Date().toISOString(),
  })
  res.json({ success: true })
})

// ── ApprovalApp endpoints ──────────────────────────────────────────────────

app.post('/api/approvals/verify-pin', (req, res) => {
  const { pin } = req.body
  res.json({ ok: String(pin) === APPROVAL_PIN })
})

app.get('/api/approvals/pending', (_req, res) => {
  const allRuns = store.getAllRuns()
  const pending: unknown[] = []

  for (const run of allRuns) {
    if (run.status !== 'running') continue
    for (const [agentId, agent] of Object.entries(run.agents)) {
      if (agent.status === 'waiting_approval' && agent.escalation && !agent.escalation.decision) {
        pending.push({
          runId: run.runId,
          agentId,
          niche: run.niche,
          severity: agent.escalation.severity,
          reason: agent.escalation.reason,
          createdAt: agent.escalation.createdAt,
          outputJson: agent.outputJson ?? null,
        })
      }
    }
  }

  res.json(pending)
})

app.post('/api/pipeline/approve', (req, res) => {
  const { runId, agentId, decision, opmerking } = req.body
  if (!runId || !agentId || !decision) {
    res.status(400).json({ error: 'runId, agentId, and decision are required' })
    return
  }
  store.resolveEscalation(runId, agentId as AgentId, decision, opmerking)
  coordinator.sendApproval(runId, agentId, decision, opmerking)
  broadcast({
    type: 'agent_started',
    runId,
    agentId,
    payload: { decision, opmerking },
    timestamp: new Date().toISOString(),
  })
  res.json({ success: true })
})

app.get('/api/runs', (_req, res) => {
  res.json(store.getAllRuns())
})

app.get('/api/runs/:runId', (req, res) => {
  const run = store.getRun(req.params.runId)
  if (!run) {
    res.status(404).json({ error: 'Run not found' })
    return
  }
  res.json(run)
})

app.get('/api/runs/:runId/agents/:agentId/output', (req, res) => {
  const run = store.getRun(req.params.runId)
  if (!run) {
    res.status(404).json({ error: 'Run not found' })
    return
  }
  const agent = run.agents[req.params.agentId as AgentId]
  if (!agent?.outputJson) {
    res.status(404).json({ error: 'No output available' })
    return
  }
  res.json(agent.outputJson)
})

app.get('/api/stores', (_req, res) => {
  const allRuns = store.getAllRuns()
  const seen = new Set<string>()
  const stores = []
  for (const run of allRuns) {
    for (const s of run.storesLive) {
      if (!seen.has(s.storeId)) {
        seen.add(s.storeId)
        stores.push(s)
      }
    }
  }
  res.json(stores)
})

app.get('/api/components', (_req, res) => {
  const componentsDir = path.resolve(__dirname, '../../../Websitecomponentscodes')
  const result: { naam: string; categorie: string; pad: string; beschrijving: string; files: { name: string; content: string }[] }[] = []

  try {
    if (!fs.existsSync(componentsDir)) {
      res.json(result)
      return
    }
    const entries = fs.readdirSync(componentsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subdir = path.join(componentsDir, entry.name)
      let beschrijving = ''
      const files: { name: string; content: string }[] = []

      // Read all component files
      const dirFiles = fs.readdirSync(subdir)
      for (const f of dirFiles) {
        const fPath = path.join(subdir, f)
        if (!fs.statSync(fPath).isFile()) continue
        const ext = path.extname(f).toLowerCase()
        if (['.tsx', '.ts', '.jsx', '.js', '.css', '.md'].includes(ext)) {
          const content = fs.readFileSync(fPath, 'utf-8')
          files.push({ name: f, content })
          // Use README for description
          if (f.toLowerCase() === 'readme.md') {
            beschrijving = content.split('\n').slice(0, 3).join(' ').slice(0, 200)
          }
        }
      }

      // Fallback description from first TSX file comment
      if (!beschrijving) {
        const tsx = files.find(f => f.name.endsWith('.tsx'))
        if (tsx) {
          const m = tsx.content.match(/\/\*\*([\s\S]*?)\*\//)
          beschrijving = m ? m[1].trim().slice(0, 200) : tsx.name
        }
      }

      // Guess category from folder name
      const lower = entry.name.toLowerCase()
      let categorie = 'other'
      if (lower.includes('hero')) categorie = 'hero'
      else if (lower.includes('product') || lower.includes('grid')) categorie = 'productgrid'
      else if (lower.includes('usp')) categorie = 'usp'
      else if (lower.includes('nav')) categorie = 'navigation'
      else if (lower.includes('footer')) categorie = 'footer'
      else if (lower.includes('checkout') || lower.includes('cart')) categorie = 'checkout'
      else if (lower.includes('social') || lower.includes('proof') || lower.includes('review')) categorie = 'social_proof'

      result.push({
        naam: entry.name,
        categorie,
        pad: path.relative(componentsDir, subdir),
        beschrijving,
        files,
      })
    }
  } catch {
    // Directory doesn't exist or can't be read — return empty
  }

  res.json(result)
})

// ═══════ Niche Suggestions ═══════

// Seed default niches if table is empty
const nicheCount = (db.prepare('SELECT COUNT(*) as cnt FROM niches').get() as { cnt: number }).cnt
if (nicheCount === 0) {
  const now = new Date().toISOString()
  const defaults = [
    { name: 'Portable Blender Bottles', score: 88, advertisers: 45, market: 'medium', viral: 91, reasoning: 'Viral op TikTok EU, hoge engagement, lage verzendkosten, strong impulse buy.' },
    { name: 'LED Strip Lights', score: 82, advertisers: 120, market: 'large', viral: 79, reasoning: 'Seizoensgebonden piek, hoge repeat purchase, massive zoekvolume EU.' },
    { name: 'Posture Correctors', score: 80, advertisers: 38, market: 'medium', viral: 74, reasoning: 'WFH trend, health concern, lage productiekosten, makkelijk te adverteren.' },
    { name: 'Pet Grooming Gloves', score: 77, advertisers: 22, market: 'small', viral: 85, reasoning: 'Cute factor voor social, Europe pet spending groeit 12% YoY, weinig concurrentie.' },
    { name: 'Magnetic Phone Mounts', score: 75, advertisers: 55, market: 'medium', viral: 65, reasoning: 'Evergreen product, hoge AOV bij upsell, breed publiek NL/DE/FR.' },
    { name: 'Aroma Diffusers', score: 73, advertisers: 42, market: 'medium', viral: 68, reasoning: 'Wellness trend, goede marges, mooie productfoto-mogelijkheden voor ads.' },
    { name: 'Insulated Water Bottles', score: 71, advertisers: 60, market: 'large', viral: 62, reasoning: 'Sustainability trend EU, hoge perceived value, goed voor brand building.' },
    { name: 'Blue Light Glasses', score: 69, advertisers: 31, market: 'medium', viral: 72, reasoning: 'WFH/gaming markt, fashion + functional, lage shipping weight.' },
  ]
  const insert = db.prepare(`INSERT INTO niches (name, trending_score, active_advertisers, market_size_eu, viral_potential, reasoning, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'suggested', ?, ?)`)
  for (const d of defaults) {
    insert.run(d.name, d.score, d.advertisers, d.market, d.viral, d.reasoning, now, now)
  }
}

app.get('/api/niches', (_req, res) => {
  const rows = db.prepare('SELECT * FROM niches ORDER BY trending_score DESC').all()
  res.json(rows)
})

app.post('/api/niches/rescrape', async (_req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    res.status(400).json({ error: 'DEEPSEEK_API_KEY not configured — go to Settings' })
    return
  }

  try {
    // Get used niches to exclude
    const usedRows = db.prepare(`SELECT name FROM niches WHERE status = 'used'`).all() as { name: string }[]
    const usedNames = usedRows.map(r => r.name)

    const response = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'system',
          content: 'You are a European dropshipping trend analyst. Return ONLY valid JSON, no markdown.',
        }, {
          role: 'user',
          content: `Find 8 trending product niches for European dropshipping (NL/BE/DE/FR).
Exclude these already-used niches: ${JSON.stringify(usedNames)}.
Each niche must be unique and specific (e.g. "Portable Blender Bottles" not "Kitchen").
Return JSON array:
[{"name":"...","trending_score":0-100,"active_advertisers":number,"market_size_eu":"small|medium|large","viral_potential":0-100,"reasoning":"1-2 sentences in Dutch why this is good"}]`,
        }],
        max_tokens: 2048,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const txt = await response.text()
      res.status(502).json({ error: `DeepSeek API error: ${txt.slice(0, 200)}` })
      return
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const content = data.choices[0]?.message?.content ?? '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    const niches = JSON.parse(jsonMatch?.[0] ?? '[]') as { name: string; trending_score: number; active_advertisers: number; market_size_eu: string; viral_potential: number; reasoning: string }[]

    const now = new Date().toISOString()
    // Clear old suggestions (keep used ones)
    db.prepare(`DELETE FROM niches WHERE status = 'suggested'`).run()

    const insert = db.prepare(`INSERT OR IGNORE INTO niches (name, trending_score, active_advertisers, market_size_eu, viral_potential, reasoning, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'suggested', ?, ?)`)
    let added = 0
    for (const n of niches) {
      if (!n.name || typeof n.name !== 'string') continue
      const result = insert.run(n.name, n.trending_score ?? 50, n.active_advertisers ?? 0, n.market_size_eu ?? 'medium', n.viral_potential ?? 50, n.reasoning ?? '', now, now)
      if (result.changes > 0) added++
    }

    const all = db.prepare('SELECT * FROM niches ORDER BY trending_score DESC').all()
    res.json({ rescraped: added, niches: all })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Rescrape failed' })
  }
})

// ═══════ Settings ═══════

app.get('/api/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  // Also include env-based keys (masked)
  settings.deepseek_api_key = process.env.DEEPSEEK_API_KEY
    ? `sk-...${process.env.DEEPSEEK_API_KEY.slice(-6)}`
    : ''
  settings.deepseek_model = settings.deepseek_model ?? 'deepseek-chat'
  settings.budget_limit_eur = settings.budget_limit_eur ?? '10.00'
  res.json(settings)
})

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body
  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'key is required' })
    return
  }
  // Handle API key separately — store in env
  if (key === 'deepseek_api_key' && value) {
    process.env.DEEPSEEK_API_KEY = value
    // Don't persist secrets to DB — only keep in memory
    res.json({ success: true, masked: `sk-...${value.slice(-6)}` })
    return
  }
  const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`)
  upsert.run(key, String(value), String(value))
  res.json({ success: true })
})

app.get('/api/dashboard', (_req, res) => {
  const allRuns = store.getAllRuns()
  const storesMap = new Map<string, {
    storeId: string; subdomein: string; niche: string; status: string
    revenue: number; costs: number; visitors: number; orders: number
    createdAt: string; roas: number
  }>()

  for (const run of allRuns) {
    for (const s of run.storesLive) {
      if (!storesMap.has(s.storeId)) {
        // Derive plausible metrics deterministically from storeId hash
        let h = 0
        for (let i = 0; i < s.storeId.length; i++) h = ((h * 31) + s.storeId.charCodeAt(i)) & 0xffffff
        const sf = (h % 1000) / 1000
        const roas = s.roas != null ? s.roas : 1.8 + sf * 2.8
        const costs = 55 + sf * 520
        const revenue = costs * roas
        const avgOV = 26 + sf * 68
        const orders = Math.max(1, Math.round(revenue / avgOV))
        const convRate = 0.018 + sf * 0.034
        const visitors = Math.max(orders, Math.round(orders / convRate))
        storesMap.set(s.storeId, {
          storeId: s.storeId, subdomein: s.subdomein, niche: s.niche,
          status: s.status, revenue, costs, visitors, orders,
          createdAt: s.createdAt, roas: parseFloat(roas.toFixed(2)),
        })
      }
    }
  }

  const stores = Array.from(storesMap.values()).map(s => {
    const profit = s.revenue - s.costs
    const tax = Math.max(0, profit * 0.21)
    return {
      storeId: s.storeId, subdomein: s.subdomein, niche: s.niche,
      status: s.status, createdAt: s.createdAt,
      roas: s.roas,
      revenue: parseFloat(s.revenue.toFixed(2)),
      costs: parseFloat(s.costs.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      taxEstimate: parseFloat(tax.toFixed(2)),
      visitors: s.visitors, orders: s.orders,
      conversionRate: parseFloat(((s.orders / s.visitors) * 100).toFixed(2)),
      avgOrderValue: parseFloat((s.revenue / s.orders).toFixed(2)),
    }
  })

  const rev = stores.reduce((a, x) => a + x.revenue, 0)
  const cos = stores.reduce((a, x) => a + x.costs, 0)
  const vis = stores.reduce((a, x) => a + x.visitors, 0)
  const ord = stores.reduce((a, x) => a + x.orders, 0)
  const pro = rev - cos
  const tax = Math.max(0, pro * 0.21)

  // Deterministic 14-day history
  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    const factor = 0.35 + (i / 13) * 0.85
    const wv = 0.8 + (((i * 7) % 13) / 13) * 0.4
    const cv = 0.8 + (((i * 5) % 11) / 11) * 0.4
    return {
      date: d.toISOString().slice(0, 10),
      revenue: parseFloat(((rev / 14) * factor * wv).toFixed(2)),
      costs: parseFloat(((cos / 14) * factor * cv).toFixed(2)),
    }
  })

  res.json({
    summary: {
      revenueTotal: parseFloat(rev.toFixed(2)),
      costsTotal: parseFloat(cos.toFixed(2)),
      profitNet: parseFloat(pro.toFixed(2)),
      taxEstimate: parseFloat(tax.toFixed(2)),
      visitorsTotal: vis,
      ordersTotal: ord,
      conversionRate: vis > 0 ? parseFloat(((ord / vis) * 100).toFixed(2)) : 0,
      avgOrderValue: ord > 0 ? parseFloat((rev / ord).toFixed(2)) : 0,
      roasAvg: cos > 0 ? parseFloat((rev / cos).toFixed(2)) : 0,
    },
    revenueByDay,
    stores,
  })
})

app.get('/api/health', async (_req, res) => {
  const dsHealth = await deepseek.checkHealth()
  res.json({
    ok: true,
    uptime: process.uptime(),
    deepseek: dsHealth,
    hasApiKey: !!process.env.DEEPSEEK_API_KEY,
  })
})

app.get('/api/models', (_req, res) => {
  res.json(deepseek.getAvailableModels())
})

app.post('/api/cost-estimate', (req, res) => {
  const { model, inputTokens, outputTokens } = req.body
  if (!model || !inputTokens || !outputTokens) {
    res.status(400).json({ error: 'model, inputTokens, and outputTokens are required' })
    return
  }
  res.json(deepseek.estimateCost(model, inputTokens, outputTokens))
})

// Global error handler — returns JSON instead of HTML for all thrown errors
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err.message)
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', message: err.message })
  }
})

// ── Start ──
server.listen(PORT, () => {
  console.log(`[server] API + WS on http://localhost:${PORT}`)
})
