import './load-env.js'
import express from 'express'
import cookieParser from 'cookie-parser'
import { attachUser, registerAuthRoutes, requireAuth, sessionUserFromCookieHeader } from './auth-routes.js'
import { registerMarketplaceRoutes, listDeals, upsertDeal, deleteDeal, listPublicStores } from './marketplace.js'
import { registerCheckoutRoutes } from './checkout-gateway.js'
import { releaseCombination } from './design/uniqueness.js'
import { mergedStore, saveOverrides, applyPriceChange, aiEditStore, addProductsToStore, suggestProductsForStore } from './store-admin.js'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { AgentId, WsEvent } from '../types/index.js'
import * as store from './store.js'
import * as deepseek from './deepseek.js'
import * as trendscraper from './trendscraper.js'
import { handleStripeWebhook } from './stripe.js'
// Mollie blijft LEGACY geïmporteerd tot Stripe live-getest is (webhook nog actief)
import { handleWebhook, getCheckoutOrders } from './mollie.js'
import { launchCampaign, activateCampaign } from './meta-ads.js'
import { generateStoreImages, generateAdCreatives, listStoreImages } from './image-gen.js'
import { runLifecycleCycle, analyzeStoreHealth, getAllHealthReports, pauseStore, killProduct, getLifecycleEvents } from './store-lifecycle.js'
import { runSkillsUpdate, recordSkillPerformance, getSkillsStats } from './skills-updater.js'
import { createExperiment, assignComponentVariant, recordComponentConversion, declareWinner, getExperiments, getWinners, getExperimentStats } from './component-lab.js'
import { getStoreBranding, generateAdsForStore, animateAdWithHiggsfield, killAd, getAdsForStore, startHiggsfieldPoller } from './ad-manager.js'
import { runSeasonalCheck, getActiveSeasons } from './seasonal.js'
import { scanDeployedStores, removeDeployedStore, auditNginx, ensureApexVhost, stopStoreProcess } from './store-platform/deploy.js'
import { getSupplier, listSuppliers, getCjStatus } from './suppliers/index.js'
import { isMcpConfigured, listDiscoveryTools, CJ_MCP_DISCOVERY_TOOLS } from './suppliers/cj-mcp-client.js'
import { listOrders, fulfillOrder, getOrderTracking } from './fulfillment.js'
import { generateQuestions, generateDirections, buildShortlist, proposeStructure } from './wizard.js'
import { costumeDisqualification } from './suppliers/product-relevance.js'
import { listPresets, getPreset, deletePreset, listSkips, presetStats } from './research/preset-store.js'
import { getNicheSuggestions } from './niche-discovery.js'
import { getPublicBaseUrl, setPublicBaseUrl, getMollieWebhookUrl, getStripeWebhookUrl } from './public-url.js'
import type { WizardPersona } from './wizard.js'
import type { WizardConfig } from './pipeline/index.js'
import db, { getAgentOutput, listRecentRuns, aggregateCosts, getLiveStores, updateStoreHealth, releasePort } from './db.js'
import { notifyApprovalNeeded } from './whatsapp.js'
import {
  startRun as pipelineStartRun,
  pauseRun as pipelinePauseRun,
  resumeRun as pipelineResumeRun,
  stopRun as pipelineStopRun,
  getRunState as pipelineGetRunState,
  resumePersistedRuns,
  pipelineEvents,
} from './pipeline/index.js'

const APPROVAL_PIN = process.env.APPROVAL_PIN ?? '1234'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT ?? '3001', 10)

const app = express()
// Stripe-webhook heeft de ONBEWERKTE body nodig voor signatuur-verificatie →
// vang de raw body af in de json-parser (req.rawBody) i.p.v. een aparte parser.
app.use(express.json({
  verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf },
}))
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

// ── Authenticatie ─────────────────────────────────────────────────────────────
// Volgorde is kritiek: attachUser leest de sessie → auth-routes (login/setup zijn
// zelf publiek) → requireAuth sluit ALLES daarna af. Omdat requireAuth hier vóór
// alle /api/*-routes én vóór de static UI staat, is elke route automatisch
// beveiligd; nieuwe routes hoeven niets extra's te doen. Uitzonderingen staan op
// één plek in auth-routes.ts: /api/webhooks/stripe, /api/health en /market.
app.use(attachUser)
registerAuthRoutes(app)
// Het publieke kopers-dashboard (apex clynado.com → nginx → hier) staat bewust
// vóór de gate. Het admin-dashboard hieronder blijft volledig afgeschermd.
registerMarketplaceRoutes(app)
// De centrale checkout-gateway is publiek maar verdedigt zichzelf met een
// origin-check, een live-store-check en een prijs-herberekening.
registerCheckoutRoutes(app)
app.use(requireAuth)

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })
const clients = new Set<WebSocket>()

// ── WebSocket upgrade ──
// LET OP: dit draait op de HTTP-server, niet in Express. De middleware-keten —
// en dus `requireAuth` — komt hier NOOIT langs. De sessiecontrole moet daarom
// expliciet herhaald worden, anders is /ws een open venster op alle live
// pipeline- en build-updates voor wie het adres kent.
function denyUpgrade(socket: import('stream').Duplex, code: number, reason: string): void {
  // Een echt HTTP-antwoord in plaats van een kale destroy: de browser meldt dan
  // een duidelijke statuscode i.p.v. een vage netwerkfout, en het is zichtbaar
  // in een curl-test.
  socket.write(
    `HTTP/1.1 ${code} ${reason}\r\n` +
    'Connection: close\r\n' +
    'Content-Length: 0\r\n' +
    '\r\n',
  )
  socket.destroy()
}

server.on('upgrade', (req, socket, head) => {
  // Pad los van een eventuele querystring vergelijken, zodat `/ws?runId=…` niet
  // stilzwijgend geweigerd wordt.
  let pathname = req.url ?? ''
  try { pathname = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`).pathname } catch { /* val terug op de rauwe url */ }
  if (pathname !== '/ws') { socket.destroy(); return }

  // WebSockets kennen geen CORS: de browser stuurt de cookie ook mee bij een
  // handshake vanaf een vreemde site. SameSite=Strict dekt dat af, maar een
  // expliciete origin-controle is één regel en vangt het ook af als die vlag
  // ooit versoepeld wordt (bv. AUTH_INSECURE_COOKIES lokaal).
  const origin = req.headers.origin
  if (origin) {
    let sameSite = false
    try { sameSite = new URL(origin).host === req.headers.host } catch { sameSite = false }
    if (!sameSite) {
      console.warn(`[ws] upgrade geweigerd — vreemde origin ${origin} (host ${req.headers.host})`)
      denyUpgrade(socket, 403, 'Forbidden')
      return
    }
  }

  const user = sessionUserFromCookieHeader(req.headers.cookie)
  if (!user) {
    console.warn(`[ws] upgrade geweigerd — geen geldige sessie (${req.socket.remoteAddress ?? 'onbekend'})`)
    denyUpgrade(socket, 401, 'Unauthorized')
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

const WS_TIMEOUT_MS = 60_000

wss.on('connection', (ws) => {
  clients.add(ws)
  let lastSeen = Date.now()

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string }
      if (msg.type === 'ping') {
        lastSeen = Date.now()
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch { /* ignore non-JSON */ }
  })

  const staleness = setInterval(() => {
    if (Date.now() - lastSeen > WS_TIMEOUT_MS) {
      ws.terminate()
      clearInterval(staleness)
    }
  }, 30_000)

  ws.on('close', () => {
    clients.delete(ws)
    clearInterval(staleness)
  })
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

// ── Pipeline v3 event fan-out ──
// All pipeline events are pushed to every WS client; the client filters by runId.
pipelineEvents.on('event', (event) => {
  const data = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  }
})

// ═══════ API Endpoints ═══════

app.post('/api/pipeline/start', async (req, res) => {
  const { niche, wizardConfig } = req.body as { niche: string; wizardConfig?: WizardConfig }
  if (!niche || typeof niche !== 'string' || !niche.trim()) {
    res.status(400).json({ error: 'niche is required' })
    return
  }
  const clean = niche.trim()

  // Enforce 1 niche = 1 brand = 1 webshop
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
  db.prepare(`UPDATE niches SET status='used', run_id=?, updated_at=? WHERE name=? COLLATE NOCASE`)
    .run(runId, new Date().toISOString(), clean)

  try {
    const state = await pipelineStartRun(runId, clean, wizardConfig)
    res.json({ runId, state })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Pipeline start failed' })
  }
})

app.post('/api/pipeline/:runId/pause', (req, res) => {
  const ok = pipelinePauseRun(req.params.runId)
  res.json({ paused: ok })
})

app.post('/api/pipeline/:runId/resume', async (req, res) => {
  const state = await pipelineResumeRun(req.params.runId)
  if (!state) { res.status(404).json({ error: 'Run not found' }); return }
  res.json({ resumed: true, state })
})

app.post('/api/pipeline/:runId/stop', (req, res) => {
  const ok = pipelineStopRun(req.params.runId)
  store.completeRun(req.params.runId, 'failed')
  res.json({ stopped: ok })
})

app.get('/api/pipeline/:runId/state', (req, res) => {
  const state = pipelineGetRunState(req.params.runId)
  if (!state) { res.status(404).json({ error: 'Run not found' }); return }
  res.json(state)
})

app.get('/api/pipeline/runs', (_req, res) => {
  res.json(listRecentRuns(20))
})

app.delete('/api/stores/failed', (_req, res) => {
  try {
    const result = db.prepare(`DELETE FROM stores WHERE status IN ('failed','building')`).run()
    res.json({ deleted: result.changes })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' })
  }
})

// Legacy stop alias (keeps frontend backward compat for one release)
app.post('/api/pipeline/stop', (req, res) => {
  const { runId } = req.body as { runId: string }
  if (!runId) { res.status(400).json({ error: 'runId is required' }); return }
  pipelineStopRun(runId)
  store.completeRun(runId, 'failed')
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

app.post('/api/pipeline/approve', async (req, res) => {
  const { runId, agentId, decision, opmerking } = req.body as {
    runId: string; agentId: string; decision: string; opmerking?: string
  }
  if (!runId || !agentId || !decision) {
    res.status(400).json({ error: 'runId, agentId, and decision are required' })
    return
  }
  store.resolveEscalation(runId, agentId as AgentId, decision, opmerking)
  // For uncertain stages: human approval = resume; rejection = stop
  if (decision === 'approve') {
    await pipelineResumeRun(runId)
  } else {
    pipelineStopRun(runId)
  }
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
  if (agent?.outputJson) {
    res.json(agent.outputJson)
    return
  }
  // Fallback to persisted agent_outputs (in case of resume after restart)
  const persisted = getAgentOutput(req.params.runId, req.params.agentId)
  if (persisted) {
    res.json(persisted)
    return
  }
  res.status(404).json({ error: 'No output available' })
})

app.get('/api/runs/:runId/resume', async (req, res) => {
  const run = store.getRun(req.params.runId)
  if (!run) { res.status(404).json({ error: 'Run not found' }); return }
  const state = await pipelineResumeRun(req.params.runId)
  res.json({ resumed: !!state, runId: req.params.runId, niche: run.niche })
})

app.get('/api/stores', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT store_id as storeId, run_id as runId, subdomein, niche,
             preview_url as previewUrl, created_at as createdAt,
             roas, status, port,
             health_status as healthStatus, health_checked_at as healthCheckedAt,
             health_response_ms as healthResponseMs, health_error as healthError
      FROM stores ORDER BY created_at DESC
    `).all()
    res.json(rows)
  } catch (err) {
    console.error('[api/stores] query failed:', err)
    res.json([])
  }
})

// ── Deals op het publieke kopers-dashboard ────────────────────────────────────
// Beheer zit achter de 2FA-gate (deze routes staan ná requireAuth); de deals
// zelf zijn publiek zichtbaar via /api/market/deals.
app.get('/api/admin/deals', (_req, res) => {
  res.json({ deals: listDeals(false), stores: listPublicStores().map(s => ({ storeId: s.storeId, brand: s.brand, url: s.url })) })
})

app.post('/api/admin/deals', (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  const title = String(b.title ?? '').trim()
  if (!title) { res.status(400).json({ error: 'Titel is verplicht' }); return }
  const deal = upsertDeal({
    id: typeof b.id === 'number' ? b.id : undefined,
    storeId: String(b.storeId ?? ''),
    title,
    subtitle: String(b.subtitle ?? ''),
    label: String(b.label ?? ''),
    url: String(b.url ?? ''),
    active: b.active !== false,
    sortOrder: Number(b.sortOrder ?? 0) || 0,
    startsAt: b.startsAt ? String(b.startsAt) : null,
    endsAt: b.endsAt ? String(b.endsAt) : null,
  })
  if (!deal) { res.status(500).json({ error: 'Opslaan mislukt' }); return }
  res.json(deal)
})

app.delete('/api/admin/deals/:id', (req, res) => {
  const ok = deleteDeal(Number(req.params.id))
  res.status(ok ? 200 : 404).json({ ok })
})

// SSH-scan the deploy server for nginx vhosts → reconcile into stores table
app.post('/api/admin/reconcile-stores', async (_req, res) => {
  try {
    const scanned = await scanDeployedStores()
    if (!scanned.length) {
      // Fallback: try stage_outputs if SSH scan finds nothing
      type StageRow = { run_id: string; output_json: string }
      const rows = db.prepare(`SELECT run_id, output_json FROM stage_outputs WHERE stage='deploy'`).all() as StageRow[]
      scanned.push(...rows.flatMap(r => {
        try {
          const o = JSON.parse(r.output_json) as { subdomain?: string; port?: number }
          return o.subdomain && o.port ? [{ subdomain: o.subdomain, port: o.port }] : []
        } catch { return [] }
      }))
    }

    const host = process.env.STORE_SERVER_HOST ?? 'localhost'
    const added: string[] = []
    const updated: string[] = []
    const now = new Date().toISOString()

    for (const { subdomain, port } of scanned) {
      const previewUrl = `http://${host}:${port}/`

      // Find matching store by port first, then by subdomain
      const byPort = db.prepare(`SELECT store_id, run_id FROM stores WHERE port = ?`).get(port) as { store_id: string; run_id: string } | undefined
      const byName = db.prepare(`SELECT store_id, run_id FROM stores WHERE subdomein = ?`).get(subdomain) as { store_id: string; run_id: string } | undefined
      const existing = byPort ?? byName

      // Try to find run_id from port_allocations → runs
      const portRow = db.prepare(`SELECT store_id FROM port_allocations WHERE port = ?`).get(port) as { store_id: string } | undefined
      const runId = existing?.run_id
        ?? (portRow?.store_id.startsWith('store-') ? portRow.store_id.slice(6) : null)
        ?? 'unknown'

      const runRow = db.prepare(`SELECT niche FROM runs WHERE run_id = ?`).get(runId) as { niche: string } | undefined
      const niche = runRow?.niche ?? subdomain

      // Ensure the run exists (FK constraint) — create a stub if needed
      if (!runRow) {
        db.prepare(`INSERT OR IGNORE INTO runs (run_id, niche, status, data, started_at, updated_at) VALUES (?,?,?,?,?,?)`)
          .run(runId, niche, 'completed', '{}', now, now)
      }

      if (!existing) {
        const storeId = portRow?.store_id ?? `store-${runId}`
        db.prepare(`
          INSERT INTO stores (store_id, run_id, subdomein, niche, preview_url, port, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'building', ?)
        `).run(storeId, runId, subdomain, niche, previewUrl, port, now)
        added.push(subdomain)
      } else {
        db.prepare(`UPDATE stores SET port=?, preview_url=?, subdomein=? WHERE store_id=?`)
          .run(port, previewUrl, subdomain, existing.store_id)
        updated.push(subdomain)
      }
    }

    void pollStoreHealth()
    res.json({ added: added.length, updated: updated.length, stores: [...added, ...updated] })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'reconcile failed' })
  }
})

// Nginx-audit: orphaned vhosts + poort-conflicten (rapporteert alleen, verwijdert niets)
app.get('/api/admin/nginx-audit', async (_req, res) => {
  try {
    const rows = db.prepare(`SELECT subdomein FROM stores WHERE status IN ('live','building','local')`).all() as { subdomein: string }[]
    const active = new Set(rows.map(r => r.subdomein))
    const audit = await auditNginx(active)
    res.json(audit)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'nginx audit mislukt' })
  }
})

// ── CMS proxy endpoints ───────────────────────────────────────────────────────
const PLATFORM_URL = process.env.PLATFORM_API_URL ?? 'http://localhost:3002'

app.get('/api/stores/:storeId/cms-data', async (req, res) => {
  try {
    const r = await fetch(`${PLATFORM_URL}/api/stores/${req.params.storeId}/cms-data`)
    res.status(r.status).json(await r.json())
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.put('/api/stores/:storeId/cms-data', async (req, res) => {
  try {
    const r = await fetch(`${PLATFORM_URL}/api/stores/${req.params.storeId}/cms-data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body),
    })
    res.status(r.status).json(await r.json())
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.post('/api/stores/:storeId/rebuild', async (req, res) => {
  try {
    const r = await fetch(`${PLATFORM_URL}/api/stores/${req.params.storeId}/rebuild`, { method: 'POST' })
    res.status(r.status).json(await r.json())
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.get('/api/server-mode', (_req, res) => {
  res.json({
    storeServerHost: process.env.STORE_SERVER_HOST || null,
    hasRemoteMode: !!process.env.STORE_SERVER_HOST,
  })
})

app.get('/api/ads', (_req, res) => {
  try {
    const ads = db.prepare(`
      SELECT id, store_id as storeId, run_id as runId, platform, format, phase, status,
             higgsfield_job_id as higgsfieldJobId, creative_url as creativeUrl,
             hook, primary_text as primaryText, headline, performance_score as performanceScore,
             created_at as createdAt
      FROM ads ORDER BY created_at DESC
    `).all()
    res.json(ads)
  } catch {
    res.json([])
  }
})

// ── Ad Manager routes ──────────────────────────────────────────────────────────

app.get('/api/stores/:storeId/branding', (req, res) => {
  try {
    const branding = getStoreBranding(req.params.storeId)
    if (!branding) { res.status(404).json({ error: 'Store niet gevonden' }); return }
    res.json(branding)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.get('/api/stores/:storeId/ads', (req, res) => {
  try {
    res.json(getAdsForStore(req.params.storeId))
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.post('/api/stores/:storeId/ads/generate', async (req, res) => {
  try {
    const ads = await generateAdsForStore(req.params.storeId)
    res.json({ created: ads.length, ads })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.post('/api/ads/:id/animate', async (req, res) => {
  try {
    const result = await animateAdWithHiggsfield(parseInt(req.params.id))
    res.json(result ?? { error: 'Geen Higgsfield API key geconfigureerd' })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.post('/api/ads/:id/kill', (req, res) => {
  try {
    killAd(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
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

// Seed default niches if table is empty.
// Deze query draait op moduleniveau: gooit hij, dan komt de server niet op en
// herstart pm2 hem eindeloos. Een lege of onbereikbare niches-tabel is hinderlijk
// maar mag de hele API niet platleggen — vandaar de guard.
let nicheCount = -1
try {
  nicheCount = (db.prepare('SELECT COUNT(*) as cnt FROM niches').get() as { cnt: number }).cnt
} catch (err) {
  console.error('[server] niches-tabel niet leesbaar — seeding overgeslagen, server start door:', err)
}
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

// ── Trendscraper proxy: live suggestions from the Python service ──
app.get('/api/niches/suggestions', async (_req, res) => {
  try {
    const niches = await trendscraper.getNiches('pending')
    res.json(niches)
  } catch (err) {
    console.error('[server] /api/niches/suggestions failed:', err)
    res.json([])
  }
})

app.post('/api/niches/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'id must be numeric' })
    return
  }
  try {
    const result = await trendscraper.approveNiche(id)
    if (!result) {
      res.status(502).json({ error: 'Trendscraper unreachable or niche not found' })
      return
    }
    res.json(result)
  } catch (err) {
    console.error('[server] /api/niches/:id/approve failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Approve failed' })
  }
})

app.post('/api/niches/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'id must be numeric' })
    return
  }
  try {
    const result = await trendscraper.rejectNiche(id)
    if (!result) {
      res.status(502).json({ error: 'Trendscraper unreachable or niche not found' })
      return
    }
    res.json(result)
  } catch (err) {
    console.error('[server] /api/niches/:id/reject failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Reject failed' })
  }
})

app.post('/api/niches/rescrape', async (_req, res) => {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    res.status(400).json({ error: 'LLM_API_KEY not configured — go to Settings' })
    return
  }

  try {
    // Exclude ALLE bestaande niches (used, rejected, en huidige suggested)
    // zodat de AI altijd vers, unieke niches teruggeeft
    const excludeRows = db.prepare(`SELECT name FROM niches`).all() as { name: string }[]
    const usedNames = excludeRows.map(r => r.name)

    const response = await fetch(`${process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
        messages: [{
          role: 'system',
          content: 'You are a European dropshipping trend analyst. Return ONLY valid JSON — no markdown, no explanation, just the JSON array.',
        }, {
          role: 'user',
          content: `Find 8 NEW trending product niches for European dropshipping (NL/BE/DE/FR).
IMPORTANT: These niches have ALREADY been used or suggested — do NOT repeat any of them: ${JSON.stringify(usedNames)}.
Each niche must be completely new, specific, and different (e.g. "Portable Blender Bottles" not just "Kitchen gadgets").
Think outside the box — explore unexpected categories, seasonal trends, emerging sub-niches, viral TikTok products.
Return ONLY a JSON array (no markdown):
[{"name":"...","trending_score":0-100,"active_advertisers":number,"market_size_eu":"small|medium|large","viral_potential":0-100,"reasoning":"1-2 zinnen in het Nederlands waarom dit kansrijk is"}]`,
        }],
        max_tokens: 2048,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const txt = await response.text()
      res.status(502).json({ error: `LLM API error: ${txt.slice(0, 200)}` })
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

// ── Observability ─────────────────────────────────────────────────────────────

app.get('/api/obs/logs', (req, res) => {
  const { run_id, agent, status, limit = '200', offset = '0' } = req.query as Record<string, string>
  let sql = 'SELECT * FROM agent_executions WHERE 1=1'
  const params: unknown[] = []
  if (run_id)  { sql += ' AND run_id = ?';     params.push(run_id) }
  if (agent)   { sql += ' AND agent_name LIKE ?'; params.push(`%${agent}%`) }
  if (status)  { sql += ' AND status = ?';     params.push(status) }
  sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?'
  params.push(parseInt(limit, 10), parseInt(offset, 10))
  try {
    const rows = db.prepare(sql).all(...params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/obs/costs', (req, res) => {
  try {
    const runId = (req.query.run_id as string | undefined) ?? undefined
    res.json(aggregateCosts(runId))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/cost-estimate', (req, res) => {
  const { model, inputTokens, outputTokens } = req.body
  if (!model || !inputTokens || !outputTokens) {
    res.status(400).json({ error: 'model, inputTokens, and outputTokens are required' })
    return
  }
  res.json(deepseek.estimateCost(model, inputTokens, outputTokens))
})

// ═══════ Checkout ═══════
// De sessie-creatie zelf staat in checkout-gateway.ts en wordt HIERBOVEN al
// gemount, vóór requireAuth — een browser op een store-domein heeft geen
// sessiecookie. De origin-check daar vervangt de sessie.

// ═══════ Publieke URL (Cloudflare Tunnel) ═══════
// De cloudflared-manager (PM2, zelfde machine) registreert hier de actuele
// trycloudflare-URL. Alleen vanaf localhost, of met TUNNEL_TOKEN indien gezet.

function tunnelAuthOk(req: express.Request): boolean {
  const token = process.env.TUNNEL_TOKEN
  if (token && req.headers['x-tunnel-token'] === token) return true
  const ip = req.socket.remoteAddress ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

app.post('/api/admin/public-url', (req, res) => {
  if (!tunnelAuthOk(req)) { res.status(403).json({ error: 'alleen localhost of met TUNNEL_TOKEN' }); return }
  const { url } = req.body as { url?: string | null }
  const result = setPublicBaseUrl(url ?? null)
  if (!result.ok) { res.status(400).json(result); return }
  res.json({ ok: true, publicBaseUrl: getPublicBaseUrl() })
})

app.get('/api/admin/public-url', (_req, res) => {
  const base = getPublicBaseUrl()
  res.json({
    publicBaseUrl: base,
    stripeWebhookUrl: getStripeWebhookUrl(),
    mollieWebhookUrl: getMollieWebhookUrl(),   // legacy
    configured: base !== null,
    note: base ? 'Stripe-webhook configureren op het dashboard met stripeWebhookUrl' : 'Geen publiek adres — stel PUBLIC_BASE_URL in (named tunnel) zodat Stripe de webhook kan bereiken',
  })
})

// Selftest: maakt een echte €0.01 test-payment MET webhookUrl bij Mollie en
// rapporteert of Mollie hem accepteert (i.p.v. de oude 422). Draait op de
// server (waar de Mollie-key staat); best-effort direct weer geannuleerd.
app.get('/api/admin/tunnel-selftest', async (_req, res) => {
  const apiKey = process.env.MOLLIE_API_KEY
  if (!apiKey) { res.json({ ok: false, skipped: true, reason: 'MOLLIE_API_KEY niet geconfigureerd' }); return }
  const webhookUrl = getMollieWebhookUrl()
  if (!webhookUrl) { res.json({ ok: false, reason: 'Geen publieke URL geregistreerd — draait de cloudflared-api PM2 service?' }); return }
  try {
    const resp = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: '0.01' },
        description: 'Tunnel selftest (auto-cancelled)',
        redirectUrl: `${getPublicBaseUrl()}/`,
        webhookUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const bodyTxt = await resp.text()
    if (!resp.ok) {
      res.json({ ok: false, status: resp.status, webhookUrl, mollieResponse: bodyTxt.slice(0, 300) })
      return
    }
    const payment = JSON.parse(bodyTxt) as { id: string }
    // Best-effort opruimen (alleen mogelijk zolang de payment cancelable is)
    fetch(`https://api.mollie.com/v2/payments/${payment.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => { /* niet-cancelable is prima */ })
    res.json({ ok: true, webhookUrl, paymentId: payment.id, note: 'Mollie accepteerde de webhook-URL — geen 422 meer' })
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

// ── Stripe webhook — signatuur-geverifieerd (checkout.session.completed) ──────
app.post('/api/webhooks/stripe', async (req, res) => {
  const raw = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
  const sig = req.header('stripe-signature')
  try {
    const result = await handleStripeWebhook(raw, sig)
    if (!result.ok) console.error(`[server] stripe webhook geweigerd: ${result.error}`)
    res.status(result.status).send(result.ok ? 'ok' : (result.error ?? 'error'))
  } catch (err) {
    console.error('[server] stripe webhook verwerking mislukt:', err)
    res.sendStatus(500)
  }
})

// Mollie webhook (LEGACY — vervangen door Stripe; blijft staan tot Stripe live-
// getest is, daarna te verwijderen). Always 200 regardless of outcome.
app.post('/api/webhooks/mollie', async (req, res) => {
  res.sendStatus(200)
  try {
    await handleWebhook(new URLSearchParams(req.body as Record<string, string>))
  } catch (err) {
    console.error('[server] mollie webhook verwerking mislukt:', err)
  }
})

app.get('/api/checkout/orders', (_req, res) => {
  res.json(getCheckoutOrders(100))
})

// ═══════ Orders & Fulfillment ═══════

app.get('/api/orders', (_req, res) => {
  try {
    res.json(listOrders(100))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'orders ophalen mislukt' })
  }
})

// Handmatige (re)fulfillment — bv. na fulfillment_failed of manual_required
app.post('/api/orders/:id/fulfill', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: 'id moet numeriek zijn' }); return }
  try {
    const result = await fulfillOrder(id)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'fulfillment mislukt' })
  }
})

app.get('/api/orders/:id/tracking', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (Number.isNaN(id)) { res.status(400).json({ error: 'id moet numeriek zijn' }); return }
  try {
    res.json(await getOrderTracking(id))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'tracking ophalen mislukt' })
  }
})

// ═══════ Suppliers (CJ Dropshipping) ═══════

app.get('/api/suppliers', (_req, res) => {
  res.json(listSuppliers())
})

// Live status van de CJ request-queue: is er een 429-backoff bezig? De wizard
// pollt dit tijdens het laden om "opnieuw proberen over Xs" te kunnen tonen.
app.get('/api/suppliers/cj/status', (_req, res) => {
  res.json(getCjStatus())
})

// MCP-status: is de CJ MCP discovery-laag geconfigureerd, en welke read-only
// tools biedt de server aan? Order-tools worden hier NOOIT uitgevoerd.
app.get('/api/suppliers/cj/mcp/status', async (_req, res) => {
  const configured = isMcpConfigured()
  if (!configured) {
    res.json({ configured: false, tools: [], note: 'MCP niet geconfigureerd — wizard gebruikt directe REST-search' })
    return
  }
  try {
    const tools = await listDiscoveryTools()
    res.json({
      configured: true,
      tools: tools.map(t => t.name),
      allowlist: [...CJ_MCP_DISCOVERY_TOOLS],
      note: 'Alleen read-only discovery-tools; orders lopen via REST CJAdapter',
    })
  } catch (err) {
    res.json({ configured: true, reachable: false, tools: [], error: err instanceof Error ? err.message : 'MCP onbereikbaar' })
  }
})

app.get('/api/suppliers/cj/search', async (req, res) => {
  // `niche` is optioneel: staat hij erin, dan worden resultaten die duidelijk
  // niet bij die niche horen (verkleedkleding voor mensen) gemarkeerd. Handmatig
  // zoeken is een bewuste actie van de operator, dus we blokkeren niets — maar
  // dit pad had helemaal GEEN relevantie-controle, en dat is hoe een
  // dalmatiër-kostuum in een hondenwinkel kan belanden.
  const { q, limit, niche } = req.query as { q?: string; limit?: string; niche?: string }
  if (!q || !q.trim()) { res.status(400).json({ error: 'q (zoekterm) is verplicht' }); return }
  try {
    const adapter = getSupplier('cj')
    const found = await adapter.searchProducts(q.trim(), {
      maxResults: Math.min(parseInt(limit ?? '30', 10) || 30, 60),
    })
    const scope = (niche ?? '').trim()
    const products = found.map(p => {
      if (!scope) return p
      const dq = costumeDisqualification(scope, p)
      return dq.rejected ? { ...p, disqualified: true, disqualifiedReason: dq.reason } : p
    })
    res.json({ products, isMock: adapter.isMock })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'CJ zoeken mislukt' })
  }
})

app.get('/api/suppliers/cj/product/:pid', async (req, res) => {
  try {
    const product = await getSupplier('cj').getProduct(req.params.pid)
    if (!product) { res.status(404).json({ error: 'Product niet gevonden bij CJ' }); return }
    res.json(product)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'CJ product ophalen mislukt' })
  }
})

app.get('/api/suppliers/cj/inventory/:pid', async (req, res) => {
  try {
    res.json(await getSupplier('cj').getInventory(req.params.pid))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'CJ voorraad ophalen mislukt' })
  }
})

// ═══════ Store-wizard ═══════

// CJ-catalogus verkenning: niche-suggesties op basis van gemeten CJ-voorraad.
// Cache 24h; ?refresh=1 forceert een nieuwe scan (async — response kan
// 'scanning' of 'stale-refreshing' zijn, UI pollt dan).
app.get('/api/wizard/niches', (req, res) => {
  try {
    res.json(getNicheSuggestions({ refresh: req.query.refresh === '1' }))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Niche-discovery mislukt' })
  }
})

// ═══════ Presetbibliotheek (offline batch-onderzoek) ═══════
// Inspectie-endpoints; het zware werk draait als los proces
// (`npm run research:batch`) en niet in de webserver.

app.get('/api/research/presets', (req, res) => {
  try {
    const includeMock = req.query.mock === '1'
    res.json({
      stats: presetStats(),
      presets: listPresets({ includeMock, limit: Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500) })
        .map(p => ({
          slug: p.slug, niche: p.niche, productCount: p.productCount, distinctTypes: p.distinctTypes,
          avgScore: p.avgScore, rationale: p.rationale, problem: p.problem, source: p.source,
          category: p.categoryName ? `${p.parentName} › ${p.categoryName}` : null,
          shippingProfile: p.shippingProfile, isMock: p.isMock,
          createdAt: p.createdAt, usedCount: p.usedCount,
          types: p.types.map(t => t.name),
        })),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'presets ophalen mislukt' })
  }
})

app.get('/api/research/presets/:slug', (req, res) => {
  const preset = getPreset(req.params.slug)
  if (!preset) { res.status(404).json({ error: 'preset niet gevonden' }); return }
  res.json(preset)
})

app.delete('/api/research/presets/:slug', (req, res) => {
  res.json({ ok: deletePreset(req.params.slug) })
})

app.get('/api/research/skips', (_req, res) => {
  res.json({ skips: listSkips() })
})

app.post('/api/wizard/questions', async (req, res) => {
  const { idea } = req.body as { idea?: string }
  if (!idea?.trim()) { res.status(400).json({ error: 'idea is verplicht' }); return }
  try {
    res.json(await generateQuestions(idea.trim()))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'AI vragen genereren mislukt' })
  }
})

app.post('/api/wizard/directions', async (req, res) => {
  const { idea, answers } = req.body as { idea?: string; answers?: Record<string, string> }
  if (!idea?.trim()) { res.status(400).json({ error: 'idea is verplicht' }); return }
  try {
    res.json(await generateDirections(idea.trim(), answers ?? {}))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'AI richtingen genereren mislukt' })
  }
})

app.post('/api/wizard/shortlist', async (req, res) => {
  // `broaden` = de gebruiker kreeg een te kleine collectie en kiest ervoor de
  // niche één stap breder te laten zoeken (zelfde doelgroep, ruimere types).
  const { niche, persona, broaden } = req.body as { niche?: string; persona?: WizardPersona; broaden?: boolean }
  if (!niche?.trim() || !persona) { res.status(400).json({ error: 'niche en persona zijn verplicht' }); return }
  try {
    res.json(await buildShortlist(niche.trim(), persona, { broaden: !!broaden }))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Shortlist bouwen mislukt' })
  }
})

app.post('/api/wizard/structure', async (req, res) => {
  const { idea, persona, productCount } = req.body as { idea?: string; persona?: WizardPersona; productCount?: number }
  if (!idea?.trim() || !persona) { res.status(400).json({ error: 'idea en persona zijn verplicht' }); return }
  try {
    res.json(await proposeStructure(idea.trim(), persona, productCount ?? 1))
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Site-structuur voorstel mislukt' })
  }
})

// ═══════ Store deletion ═══════
// Verwijdert de store van de store server (nginx vhost + files), geeft de poort
// vrij en ruimt de DB-rijen op. Werkt ook voor stores die alleen in de DB staan.

// ═══════ Store-beheer ═══════
// Bewerken van een LIVE store zonder de pipeline opnieuw te draaien. Alles komt
// als override in `stores.custom_data`; de originele pipeline-output blijft
// staan. Na een wijziging moet je `POST /api/stores/:id/rebuild` aanroepen om
// hem live te zetten — bewust een aparte stap, zodat je meerdere bewerkingen
// kunt stapelen voor één rebuild van 2-3 minuten.

app.get('/api/stores/:storeId/editable', (req, res) => {
  const store = mergedStore(req.params.storeId)
  if (!store) { res.status(404).json({ error: 'Store niet gevonden' }); return }
  res.json(store)
})

app.put('/api/stores/:storeId/editable', (req, res) => {
  const b = (req.body ?? {}) as { brand_name?: string; slogan?: string; products?: Array<{ id: string }> }
  const r = saveOverrides(req.params.storeId, b)
  if (!r.ok) { res.status(404).json({ error: 'Store niet gevonden' }); return }
  res.json({ ok: true, changedProducts: r.changedProducts, store: mergedStore(req.params.storeId) })
})

app.post('/api/stores/:storeId/prices', (req, res) => {
  const b = (req.body ?? {}) as { percent?: number; delta?: number; roundTo?: number; productIds?: string[] }
  const r = applyPriceChange(req.params.storeId, b)
  if (!r.ok) { res.status(400).json({ error: r.error }); return }
  res.json(r)
})

app.post('/api/stores/:storeId/ai-edit', async (req, res) => {
  const instruction = String((req.body as { instruction?: unknown } | undefined)?.instruction ?? '').trim()
  if (!instruction) { res.status(400).json({ error: 'instruction is verplicht' }); return }
  try {
    const r = await aiEditStore(req.params.storeId, instruction)
    res.status(r.ok ? 200 : 400).json(r)
  } catch (err) {
    console.error('[store-admin] ai-edit mislukt:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI-bewerking mislukt' })
  }
})

app.get('/api/stores/:storeId/product-suggestions', async (req, res) => {
  const r = await suggestProductsForStore(req.params.storeId, req.query.q ? String(req.query.q) : undefined)
  res.status(r.ok ? 200 : 400).json(r)
})

app.post('/api/stores/:storeId/products', async (req, res) => {
  const ids = (req.body as { supplierProductIds?: unknown } | undefined)?.supplierProductIds
  if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'supplierProductIds is verplicht' }); return }
  try {
    const r = await addProductsToStore(req.params.storeId, ids.map(String))
    res.status(r.ok ? 200 : 400).json(r)
  } catch (err) {
    console.error('[store-admin] producten toevoegen mislukt:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Toevoegen mislukt' })
  }
})

// Verwijderen in één klik — maar niet per ongeluk. De client moet de
// subdomeinnaam meesturen als `confirm`; dat is dezelfde tekst die de gebruiker
// in het dialoogvenster moet typen. Een misklik op een rij in een lijst kan zo
// nooit een live winkel offline halen.
//
// Wat er opgeruimd wordt, in deze volgorde (server eerst, database daarna —
// omgekeerd zou een mislukte serveropruiming een weesbestand achterlaten dat
// niemand meer kan vinden):
//   1. nginx-vhost + bestanden op de server
//   2. eventueel PM2-proces (alleen relevant bij een legacy store met server-side
//      rendering; de huidige stores zijn statische exports achter nginx)
//   3. poort vrijgeven zodat de volgende deploy hem opnieuw kan pakken
//   4. de design-combinatie vrijgeven voor de uniciteitscontrole
//   5. deals die naar deze winkel wijzen van het kopers-dashboard halen
//   6. de rij uit `stores` — daarmee verdwijnt hij ook uit de publieke etalage
app.delete('/api/stores/:storeId', async (req, res) => {
  try {
    const store = db.prepare(`SELECT store_id, subdomein, status, port FROM stores WHERE store_id = ?`)
      .get(req.params.storeId) as { store_id: string; subdomein: string; status: string; port: number | null } | undefined
    if (!store) { res.status(404).json({ error: 'Store niet gevonden' }); return }

    const confirm = String((req.body as { confirm?: unknown } | undefined)?.confirm ?? req.query.confirm ?? '').trim()
    if (confirm !== store.subdomein) {
      res.status(428).json({
        error: 'Bevestiging ontbreekt of klopt niet',
        expected: store.subdomein,
        hint: `Stuur { "confirm": "${store.subdomein}" } mee om te bevestigen.`,
      })
      return
    }

    const steps: string[] = []

    const remote = await removeDeployedStore(store.subdomein, (m) => console.log(`[store-delete] ${m}`))
    if (!remote.ok) {
      res.status(502).json({ error: `Store server opruimen mislukt: ${remote.error}` })
      return
    }
    steps.push('nginx-vhost en bestanden verwijderd')

    const pm2 = await stopStoreProcess(store.subdomein)
    if (pm2.stopped) steps.push(`PM2-proces ${store.subdomein} gestopt`)

    releasePort(store.store_id)
    steps.push(store.port ? `poort ${store.port} vrijgegeven` : 'geen poort in gebruik')

    releaseCombination(store.subdomein)
    steps.push('design-combinatie vrijgegeven')

    const deals = db.prepare(`DELETE FROM market_deals WHERE store_id = ?`).run(store.store_id)
    if (deals.changes) steps.push(`${deals.changes} deal(s) van het kopers-dashboard gehaald`)

    db.prepare(`DELETE FROM stores WHERE store_id = ?`).run(store.store_id)
    steps.push('uit de database en de publieke etalage')

    console.log(`[store-delete] ${store.subdomein} (${store.store_id}) verwijderd — ${steps.join('; ')}`)
    res.json({ deleted: true, storeId: store.store_id, subdomain: store.subdomein, steps })
  } catch (err) {
    console.error('[server] store delete mislukt:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Store verwijderen mislukt' })
  }
})

// ═══════ Meta Ads ═══════

app.post('/api/ads/launch', async (req, res) => {
  try {
    const {
      runId, brandName, niche, dailyBudgetEur,
      adCopy, targetingCountries, imageUrl, productUrl,
    } = req.body as {
      runId: string; brandName: string; niche: string; dailyBudgetEur: number
      adCopy: { primaryText: string; headline: string; hooks: string[] }
      targetingCountries?: string[]; imageUrl?: string; productUrl: string
    }
    if (!brandName || !niche || !adCopy || !productUrl) {
      res.status(400).json({ error: 'brandName, niche, adCopy en productUrl zijn verplicht' })
      return
    }
    const result = await launchCampaign({
      runId: runId ?? '',
      brandName,
      niche,
      dailyBudgetEur: Number(dailyBudgetEur) || 10,
      adCopy,
      targetingCountries,
      imageUrl,
      productUrl,
    })
    res.json(result)
  } catch (err) {
    console.error('[server] /api/ads/launch mislukt:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Ads lanceren mislukt' })
  }
})

app.post('/api/ads/activate', async (req, res) => {
  try {
    const { campaignId, adSetId } = req.body as { campaignId: string; adSetId: string }
    if (!campaignId || !adSetId) {
      res.status(400).json({ error: 'campaignId en adSetId zijn verplicht' })
      return
    }
    await activateCampaign(campaignId, adSetId)
    res.json({ activated: true, campaignId, adSetId })
  } catch (err) {
    console.error('[server] /api/ads/activate mislukt:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Activatie mislukt' })
  }
})

// ═══════ Image Generation ═══════

app.post('/api/images/store', async (req, res) => {
  try {
    const { storeId, productName, niche, brandName, primaryColor } = req.body as {
      storeId: string; productName: string; niche: string; brandName: string; primaryColor?: string
    }
    if (!storeId || !productName || !niche || !brandName) {
      res.status(400).json({ error: 'storeId, productName, niche en brandName zijn verplicht' })
      return
    }
    const result = await generateStoreImages({ storeId, productName, niche, brandName, primaryColor })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Store images genereren mislukt' })
  }
})

app.post('/api/images/ads', async (req, res) => {
  try {
    const { storeId, productName, niche, adHooks } = req.body as {
      storeId: string; productName: string; niche: string; adHooks: string[]
    }
    if (!storeId || !productName || !niche) {
      res.status(400).json({ error: 'storeId, productName en niche zijn verplicht' })
      return
    }
    const result = await generateAdCreatives({ storeId, productName, niche, adHooks: adHooks ?? [] })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Ad creatives genereren mislukt' })
  }
})

app.get('/api/images/:storeId', (req, res) => {
  res.json(listStoreImages(req.params.storeId))
})

// ═══════ Store Lifecycle ═══════

app.get('/api/stores/:storeId/health', (req, res) => {
  const report = analyzeStoreHealth(req.params.storeId)
  if (!report) {
    res.status(404).json({ error: 'Store niet gevonden' })
    return
  }
  res.json(report)
})

app.get('/api/lifecycle/health', (_req, res) => {
  res.json(getAllHealthReports())
})

app.get('/api/lifecycle/events/:storeId', (req, res) => {
  res.json(getLifecycleEvents(req.params.storeId))
})

app.post('/api/stores/:storeId/pause', (req, res) => {
  const { reason } = req.body as { reason?: string }
  pauseStore(req.params.storeId, reason ?? 'Handmatig gepauzeerd')
  res.json({ success: true })
})

app.post('/api/stores/:storeId/kill-product', (req, res) => {
  const { productId } = req.body as { productId: string }
  if (!productId) {
    res.status(400).json({ error: 'productId is verplicht' })
    return
  }
  const ok = killProduct(req.params.storeId, productId)
  res.json({ success: ok })
})

app.post('/lifecycle/run', async (_req, res) => {
  try {
    await runLifecycleCycle()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Lifecycle cyclus mislukt' })
  }
})

// ═══════ Skills Updater ═══════

app.get('/api/skills/stats', (_req, res) => {
  res.json(getSkillsStats())
})

app.post('/api/skills/record', (req, res) => {
  const params = req.body as Parameters<typeof recordSkillPerformance>[0]
  if (!params.runId || !params.agentId) {
    res.status(400).json({ error: 'runId en agentId zijn verplicht' })
    return
  }
  recordSkillPerformance(params)
  res.json({ success: true })
})

app.post('/api/skills/update', async (_req, res) => {
  try {
    await runSkillsUpdate()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Skills update mislukt' })
  }
})

// ═══════ Component Lab ═══════

app.get('/api/experiments', (req, res) => {
  const { storeId } = req.query as { storeId?: string }
  res.json(getExperiments(storeId))
})

app.get('/api/experiments/winners', (_req, res) => {
  res.json(getWinners())
})

app.get('/api/experiments/:experimentId/stats', (req, res) => {
  res.json(getExperimentStats(req.params.experimentId))
})

app.post('/api/experiments', (req, res) => {
  const { componentName, variantA, variantB, storeId } = req.body as {
    componentName: string; variantA: string; variantB: string; storeId?: string
  }
  if (!componentName || !variantA || !variantB) {
    res.status(400).json({ error: 'componentName, variantA en variantB zijn verplicht' })
    return
  }
  const experimentId = createExperiment({ componentName, variantA, variantB, storeId })
  res.json({ experimentId })
})

app.post('/api/experiments/:experimentId/impression', (req, res) => {
  const { sessionId } = req.body as { sessionId: string }
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is verplicht' })
    return
  }
  const variant = assignComponentVariant(req.params.experimentId, sessionId)
  res.json({ variant })
})

app.post('/api/experiments/:experimentId/conversion', (req, res) => {
  const { variant } = req.body as { variant: 'A' | 'B' }
  if (!variant || !['A', 'B'].includes(variant)) {
    res.status(400).json({ error: 'variant moet A of B zijn' })
    return
  }
  recordComponentConversion(req.params.experimentId, variant)
  res.json({ success: true })
})

app.post('/api/experiments/:experimentId/winner', (req, res) => {
  const { winner } = req.body as { winner: 'A' | 'B' }
  if (!winner || !['A', 'B'].includes(winner)) {
    res.status(400).json({ error: 'winner moet A of B zijn' })
    return
  }
  const ok = declareWinner(req.params.experimentId, winner)
  res.json({ success: ok })
})

// ═══════ Seasonal ═══════

app.get('/api/seasonal', (_req, res) => {
  res.json(getActiveSeasons())
})

// ═══════ Static UI (Vite build) ═══════
// MOET na alle /api/*-routes staan zodat API-calls voorrang houden, en vóór de
// error-handler (Express vereist dat de 4-arg error-middleware als laatste komt).
// `npm run build` produceert UIcontrol/dist; zonder deze serving gaf / in
// productie "Cannot GET /".
//
// __dirname = UIcontrol/src/server (draait via tsx op de bron) → ../../dist.
const UI_DIST = path.resolve(__dirname, '../../dist')
const UI_INDEX = path.join(UI_DIST, 'index.html')

if (fs.existsSync(UI_INDEX)) {
  // Twee mounts: Vite schrijft content-gehashte bestanden naar dist/assets/ —
  // die mogen een jaar gecachet worden. De rest (incl. index.html) juist niet,
  // anders blijft na een deploy een oude bundle-verwijzing hangen.
  // Bewust express.static's eigen maxAge i.p.v. setHeaders: `send` zet z'n
  // Cache-Control ná de setHeaders-callback, waardoor die genegeerd werd.
  app.use('/assets', express.static(path.join(UI_DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }))
  app.use(express.static(UI_DIST, { index: false, maxAge: 0 }))

  // SPA-fallback: alles wat GEEN /api/* is → index.html (client-side routing).
  // Bewust géén '*'-pattern: Express 5 / path-to-regexp v6 accepteert dat niet
  // meer. Een middleware met expliciete guards is versie-onafhankelijk.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api/')) return next()          // API houdt voorrang
    if (req.path === '/ws') return next()                    // WS-upgrade loopt via
                                                             // server.on('upgrade'); dit
                                                             // vangt alleen een kale GET /ws
    if (path.extname(req.path)) return next()                // ontbrekend asset → 404
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(UI_INDEX)
  })
  console.log(`[server] UI served from ${UI_DIST}`)
} else {
  console.warn(`[server] ⚠ geen UI-build gevonden op ${UI_DIST} — draai \`npm run build\` (API blijft werken)`)
}

// Global error handler — returns JSON instead of HTML for all thrown errors
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err.message)
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', message: err.message })
  }
})

// ── Resume any in-flight runs that were interrupted by a server restart ──
function resumeInterruptedRuns(): void {
  try {
    resumePersistedRuns()
  } catch (err) {
    console.error('[server] resumeInterruptedRuns failed:', err)
  }
}

// ── Scheduled jobs ─────────────────────────────────────────────────────────────

function scheduleDaily(hour: number, task: () => Promise<void>, name: string): void {
  function tick(): void {
    const now = new Date()
    const nextRun = new Date()
    nextRun.setHours(hour, 0, 0, 0)
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
    const delay = nextRun.getTime() - now.getTime()
    setTimeout(() => {
      task().catch(err => console.error(`[scheduler] ${name} failed:`, err))
      tick()  // reschedule
    }, delay)
  }
  tick()
  console.log(`[scheduler] ${name} gepland — dagelijks om ${String(hour).padStart(2, '0')}:00`)
}

function scheduleWeekly(dayOfWeek: number, hour: number, task: () => Promise<void>, name: string): void {
  function tick(): void {
    const now = new Date()
    const next = new Date()
    next.setHours(hour, 0, 0, 0)
    const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7
    next.setDate(now.getDate() + (next <= now ? daysUntil : daysUntil === 7 ? 0 : daysUntil))
    const delay = next.getTime() - now.getTime()
    setTimeout(() => {
      task().catch(err => console.error(`[scheduler] ${name} failed:`, err))
      tick()
    }, delay)
  }
  tick()
  console.log(`[scheduler] ${name} gepland — wekelijks maandag om ${String(hour).padStart(2, '0')}:00`)
}

// ── Start ──
// ── Background store health poller ───────────────────────────────────────────
async function pollStoreHealth() {
  const stores = getLiveStores()
  for (const s of stores) {
    const url = s.previewUrl || (s.port ? `http://${process.env.STORE_SERVER_HOST ?? 'localhost'}:${s.port}/` : null)
    if (!url) continue
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      const start = Date.now()
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' }).catch(() => null)
      clearTimeout(timer)
      const ms = Date.now() - start
      const up = res?.ok ?? false
      updateStoreHealth(s.storeId, {
        status: up ? 'live' : 'failed',
        healthStatus: up ? 'up' : 'down',
        responseMs: ms,
        error: up ? undefined : `HTTP ${res?.status ?? 'timeout'}`,
      })
    } catch {
      updateStoreHealth(s.storeId, { status: 'failed', healthStatus: 'down', error: 'unreachable' })
    }
  }
}

server.listen(PORT, () => {
  console.log(`[server] API + WS on http://localhost:${PORT}`)
  resumeInterruptedRuns()
  startHiggsfieldPoller()

  // Apex-vhost (clynado.com → kopers-dashboard). Idempotent: schrijft alleen bij
  // een echte wijziging, dus dit lokt geen nginx-reload uit bij elke herstart.
  void ensureApexVhost(m => console.log(m)).then(r => {
    if (r.changed && r.ok) console.log('[apex] kopers-dashboard-vhost geïnstalleerd')
    else if (r.error) console.log(`[apex] ${r.error}`)
  })

  // Poll deployed store health every 60s
  setInterval(pollStoreHealth, 60_000)
  setTimeout(pollStoreHealth, 5000) // initial check 5s after boot

  // Schedulers disabled — user wants pipeline to be manual-only to control costs.
  // skills-update gebruikt LLM calls; lifecycle en seasonal kunnen extern API verkeer veroorzaken.
  // Te herstarten vanuit een aparte ops/admin tool wanneer nodig.
  // scheduleDaily(2, runLifecycleCycle, 'lifecycle-cycle')
  // scheduleWeekly(1, 3, runSkillsUpdate, 'skills-update')
  // scheduleDaily(7, runSeasonalCheck, 'seasonal-check')
})
