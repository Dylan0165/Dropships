/**
 * Store Monitor — periodieke health checks voor alle deployed stores.
 *
 * Elke 5 minuten worden alle live/local stores gecheckt via HTTP.
 * Bij een down store wordt automatisch een AI-diagnose aangevraagd via DeepSeek.
 * Resultaten worden opgeslagen in de stores tabel (health_status, health_response_ms, etc.)
 *
 * Poortbeheer: eerste store krijgt poort 4001, elke volgende +1.
 * De poort wordt ook via nginx op 192.168.121.11 bereikbaar gemaakt (naast subdomain).
 */

import db, { allocatePort } from './db.js'

const MONITOR_INTERVAL_MS = 5 * 60 * 1000   // 5 minuten
const HEALTH_TIMEOUT_MS   = 8_000            // 8 seconden per store
const PORT_START          = 4001             // eerste store poort
const AI_DIAGNOSE_AFTER   = 2               // diagnose na N opeenvolgende failures

// Store server host — voor poortgebaseerde health checks (bereikbaar vanuit tool server)
const STORE_SERVER_HOST = process.env.STORE_SERVER_HOST || '192.168.121.11'

// ── LLM config (zelfde als agent-runner) ─────────────────────────────────────
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com'
const LLM_API_KEY  = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''
const LLM_MODEL    = process.env.LLM_MODEL ?? 'deepseek-chat'

// ── Poort toewijzing ──────────────────────────────────────────────────────────

// Behouden voor backward-compat; delegeert nu naar de centrale, atomaire
// allocatePort (single source of truth). De oude MAX(port)+1 logica gaf dubbele
// poorten omdat ze de andere allocator/proces niet zag. serverMaxPort is niet
// meer nodig: allocatePort scant de volledige range tegen beide bronnen.
export function assignPort(storeId: string, _serverMaxPort = 0): number {
  void _serverMaxPort
  const port = allocatePort(storeId)
  db.prepare('UPDATE stores SET port = ? WHERE store_id = ?').run(port, storeId)
  return port
}

// ── Health check ──────────────────────────────────────────────────────────────

interface StoreRow {
  store_id: string
  subdomein: string
  niche: string
  preview_url: string
  status: string
  port: number | null
  health_status: string
  health_checked_at: string | null
  health_response_ms: number | null
  health_error: string | null
  ai_diagnosed_at: string | null
  ai_diagnosis: string | null
}

async function checkStore(store: StoreRow): Promise<void> {
  const now = new Date().toISOString()
  // Gebruik poort-gebaseerde URL wanneer beschikbaar (bereikbaar van tool server)
  // Domein-gebaseerde preview_url is alleen voor eindgebruikers, niet intern
  const url = store.port
    ? `http://${STORE_SERVER_HOST}:${store.port}`
    : store.preview_url || `http://localhost:3002/preview/${store.subdomein}`

  const start = Date.now()
  let healthStatus: 'up' | 'down' | 'slow' = 'down'
  let responseMs: number | null = null
  let errorMsg: string | null = null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const res = await fetch(url, { signal: controller.signal, method: 'GET' })
    clearTimeout(timer)

    responseMs = Date.now() - start
    if (res.ok) {
      healthStatus = responseMs > 3000 ? 'slow' : 'up'
    } else {
      healthStatus = 'down'
      errorMsg = `HTTP ${res.status}`
    }
  } catch (err) {
    responseMs = Date.now() - start
    errorMsg = err instanceof Error ? err.message : String(err)
    healthStatus = 'down'
  }

  db.prepare(`
    UPDATE stores
    SET health_status = ?, health_checked_at = ?, health_response_ms = ?, health_error = ?
    WHERE store_id = ?
  `).run(healthStatus, now, responseMs, errorMsg, store.store_id)

  const icon = healthStatus === 'up' ? '✅' : healthStatus === 'slow' ? '⚠️' : '❌'
  console.log(`[store-monitor] ${icon} ${store.subdomein} — ${healthStatus} (${responseMs}ms)${errorMsg ? ` — ${errorMsg}` : ''}`)

  // AI-diagnose bij down-store (na meerdere failures)
  if (healthStatus === 'down' && !store.ai_diagnosed_at) {
    await runAiDiagnosis(store, errorMsg ?? 'onbekende fout')
  }
}

// ── AI diagnose ───────────────────────────────────────────────────────────────

async function runAiDiagnosis(store: StoreRow, error: string): Promise<void> {
  if (!LLM_API_KEY) return   // geen key = geen diagnose

  const prompt = `Je bent een DevOps AI assistent voor een dropshipping automatiseringssysteem.

Een deployed webstore is niet bereikbaar. Analyseer het probleem en geef een concrete oplossing.

Store info:
- Subdomain: ${store.subdomein}
- Niche: ${store.niche}
- Preview URL: ${store.preview_url}
- Port: ${store.port ?? 'niet toegewezen'}
- Status: ${store.status}
- Foutmelding: ${error}
- Laatste succesvolle check: ${store.health_checked_at ?? 'nooit'}

Geef een JSON response met:
{
  "waarschijnlijke_oorzaak": "korte beschrijving",
  "ernst": "laag|medium|hoog|kritiek",
  "stappen": ["stap 1", "stap 2", ...],
  "bash_commando": "optioneel direct uitvoerbaar herstelcommando",
  "preventie": "hoe dit voorkomen in de toekomst"
}`

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (LLM_API_KEY) headers['Authorization'] = `Bearer ${LLM_API_KEY}`

    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) return

    const data = await res.json() as { choices: { message: { content: string } }[] }
    const raw = data.choices[0]?.message?.content ?? ''

    // JSON extraheren
    const match = raw.match(/\{[\s\S]*\}/)
    const diagnosis = match ? match[0] : raw

    db.prepare(`
      UPDATE stores SET ai_diagnosis = ?, ai_diagnosed_at = ? WHERE store_id = ?
    `).run(diagnosis, new Date().toISOString(), store.store_id)

    console.log(`[store-monitor] 🤖 AI diagnose voor ${store.subdomein}: ${diagnosis.slice(0, 100)}...`)
  } catch (err) {
    console.error(`[store-monitor] AI diagnose mislukt voor ${store.subdomein}:`, err)
  }
}

// ── Monitor loop ──────────────────────────────────────────────────────────────

async function runMonitorCycle(): Promise<void> {
  const stores = db.prepare(`
    SELECT store_id, subdomein, niche, preview_url, status, port,
           health_status, health_checked_at, health_response_ms, health_error
    FROM stores
    WHERE status IN ('live', 'local')
  `).all() as StoreRow[]

  if (stores.length === 0) return

  console.log(`[store-monitor] Checking ${stores.length} store(s)...`)

  // Serieel checken om de server niet te overbelasten
  for (const store of stores) {
    try {
      await checkStore(store)
    } catch (err) {
      console.error(`[store-monitor] check crashed voor ${store.subdomein}:`, err)
    }
  }
}

let monitorTimer: ReturnType<typeof setInterval> | null = null

export function startStoreMonitor(): void {
  if (monitorTimer) return
  console.log(`[store-monitor] Gestart — interval: ${MONITOR_INTERVAL_MS / 1000}s, poorten vanaf ${PORT_START}`)
  // Eerste check na 30s (na opstart)
  setTimeout(() => {
    void runMonitorCycle()
    monitorTimer = setInterval(() => void runMonitorCycle(), MONITOR_INTERVAL_MS)
  }, 30_000)
}

export function stopStoreMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}

// ── On-demand diagnose (voor API endpoint) ────────────────────────────────────

export async function diagnoseStore(storeId: string): Promise<{ diagnosis: string; error?: string }> {
  const store = db.prepare(`
    SELECT store_id, subdomein, niche, preview_url, status, port,
           health_status, health_checked_at, health_response_ms, health_error, ai_diagnosis
    FROM stores WHERE store_id = ?
  `).get(storeId) as (StoreRow & { ai_diagnosis: string | null }) | undefined

  if (!store) return { error: 'Store niet gevonden', diagnosis: '' }

  // Altijd eerst een verse health check doen
  await checkStore(store)

  // Haal updated record op
  const updated = db.prepare('SELECT health_status, health_error, ai_diagnosis FROM stores WHERE store_id = ?').get(storeId) as
    { health_status: string; health_error: string | null; ai_diagnosis: string | null } | undefined

  if (updated?.health_status === 'up') {
    return { diagnosis: JSON.stringify({ waarschijnlijke_oorzaak: 'Store is bereikbaar en gezond', ernst: 'geen' }) }
  }

  // AI diagnose uitvoeren (reset ai_diagnosed_at zodat het opnieuw gebeurt)
  db.prepare('UPDATE stores SET ai_diagnosed_at = NULL WHERE store_id = ?').run(storeId)
  await runAiDiagnosis(store, updated?.health_error ?? 'onbekende fout')

  const result = db.prepare('SELECT ai_diagnosis FROM stores WHERE store_id = ?').get(storeId) as { ai_diagnosis: string | null } | undefined
  return { diagnosis: result?.ai_diagnosis ?? 'Geen diagnose beschikbaar' }
}

// ── Health overzicht (voor API) ───────────────────────────────────────────────

export interface StoreHealthSummary {
  store_id: string
  subdomein: string
  niche: string
  preview_url: string
  port: number | null
  status: string
  health_status: string
  health_checked_at: string | null
  health_response_ms: number | null
  health_error: string | null
  ai_diagnosis: string | null
  ai_diagnosed_at: string | null
}

export function getAllStoreHealth(): StoreHealthSummary[] {
  return db.prepare(`
    SELECT store_id, subdomein, niche, preview_url, port, status,
           health_status, health_checked_at, health_response_ms, health_error,
           ai_diagnosis, ai_diagnosed_at
    FROM stores
    ORDER BY created_at DESC
  `).all() as StoreHealthSummary[]
}
