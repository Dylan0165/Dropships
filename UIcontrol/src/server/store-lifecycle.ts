/**
 * Store lifecycle manager.
 *
 * Classifies each store as THRIVING / GROWING / STRUGGLING / DEAD
 * and auto-acts accordingly.  Dead store cleanup: 21-day threshold →
 * WhatsApp notification → 48 h timeout → auto-pause.
 */
import db from './db.js'
import { notifyApprovalNeeded } from './whatsapp.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoreStatus = 'THRIVING' | 'GROWING' | 'STRUGGLING' | 'DEAD'

export interface StoreHealthReport {
  storeId: string
  subdomain: string
  niche: string
  status: StoreStatus
  roas: number | null
  orderCount: number
  daysSinceCreated: number
  daysSinceLastOrder: number | null
  reason: string
}

export interface LifecycleEvent {
  id: number
  store_id: string
  event_type: string
  payload: string
  created_at: string
}

// ── Init DB tables (called from db.ts exec block) ─────────────────────────────

export function ensureLifecycleTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lifecycle_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id   TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload    TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_store ON lifecycle_events(store_id);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_type  ON lifecycle_events(event_type);

    CREATE TABLE IF NOT EXISTS store_products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id   TEXT NOT NULL,
      product_id TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      price      REAL NOT NULL DEFAULT 0,
      status     TEXT NOT NULL DEFAULT 'active',
      added_at   TEXT NOT NULL,
      UNIQUE(store_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_store_products ON store_products(store_id);
  `)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logEvent(storeId: string, eventType: string, payload: Record<string, unknown> = {}): void {
  db.prepare(
    `INSERT INTO lifecycle_events (store_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(storeId, eventType, JSON.stringify(payload), new Date().toISOString())
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ── Core health analysis ───────────────────────────────────────────────────────

export function analyzeStoreHealth(storeId: string): StoreHealthReport | null {
  const store = db.prepare(`SELECT * FROM stores WHERE store_id = ?`).get(storeId) as {
    store_id: string; subdomein: string; niche: string; roas: number | null
    created_at: string; status: string
  } | undefined

  if (!store) return null

  const now = new Date().toISOString()
  const daysSinceCreated = daysBetween(store.created_at, now)

  // Simulate order metrics from roas (in production: query real orders table)
  const roas = store.roas ?? 0
  const orderCount = Math.round(roas * 3)  // proxy until real order tracking
  const daysSinceLastOrder: number | null = roas > 0 ? Math.floor(Math.random() * 10) : null

  let status: StoreStatus
  let reason: string

  if (roas >= 3.0 && orderCount >= 10) {
    status = 'THRIVING'
    reason = `ROAS ${roas.toFixed(1)}x — winst boven drempel, groei mogelijk`
  } else if (roas >= 1.5) {
    status = 'GROWING'
    reason = `ROAS ${roas.toFixed(1)}x — break-even overschreden, optimalisatie nodig`
  } else if (daysSinceCreated <= 21 || roas > 0) {
    status = 'STRUGGLING'
    reason = `ROAS ${roas.toFixed(1)}x — winstgevend noch inactief`
  } else {
    status = 'DEAD'
    reason = `${daysSinceCreated} dagen actief, geen omzet — candidate voor cleanup`
  }

  return {
    storeId: store.store_id,
    subdomain: store.subdomein,
    niche: store.niche,
    status,
    roas,
    orderCount,
    daysSinceCreated,
    daysSinceLastOrder,
    reason,
  }
}

// ── Product actions ────────────────────────────────────────────────────────────

export function killProduct(storeId: string, productId: string): boolean {
  const result = db.prepare(
    `UPDATE store_products SET status = 'killed' WHERE store_id = ? AND product_id = ?`,
  ).run(storeId, productId)
  if (result.changes > 0) {
    logEvent(storeId, 'product_killed', { productId })
  }
  return result.changes > 0
}

export function pauseStore(storeId: string, reason: string): void {
  db.prepare(`UPDATE stores SET status = 'paused' WHERE store_id = ?`).run(storeId)
  logEvent(storeId, 'store_paused', { reason })
  console.log(`[lifecycle] Store ${storeId.slice(0, 8)} gepauzeerd: ${reason}`)
}

// ── Dead store cleanup (21-day threshold + 48h WhatsApp warning) ──────────────

interface DeadStoreRecord {
  store_id: string
  subdomein: string
  niche: string
  created_at: string
  notified_at: string | null
}

export async function checkDeadStores(): Promise<void> {
  const cutoff = new Date(Date.now() - 21 * 86_400_000).toISOString()

  const deadCandidates = db.prepare(`
    SELECT s.store_id, s.subdomein, s.niche, s.created_at,
           (SELECT payload FROM lifecycle_events
            WHERE store_id = s.store_id AND event_type = 'dead_store_notified'
            ORDER BY created_at DESC LIMIT 1) AS notified_at
    FROM stores s
    WHERE s.status NOT IN ('paused','killed','failed')
      AND s.created_at < ?
      AND (s.roas IS NULL OR s.roas = 0)
  `).all(cutoff) as DeadStoreRecord[]

  for (const store of deadCandidates) {
    const health = analyzeStoreHealth(store.store_id)
    if (!health || health.status !== 'DEAD') continue

    if (!store.notified_at) {
      // First time: send WhatsApp alert, log notification
      logEvent(store.store_id, 'dead_store_notified', {
        subdomain: store.subdomein,
        days: health.daysSinceCreated,
      })

      await notifyApprovalNeeded({
        agentId: 'lifecycle-manager',
        niche: store.niche,
        severity: 'MEDIUM',
        reason: `Store ${store.subdomein} is ${health.daysSinceCreated} dagen actief zonder omzet. Wordt over 48u automatisch gepauzeerd als geen actie.`,
        runId: store.store_id,
      }).catch(console.error)

      console.log(`[lifecycle] Dead store alert: ${store.subdomein} (${health.daysSinceCreated}d zonder omzet)`)
    } else {
      // Already notified — check if 48h have passed
      try {
        const notifiedPayload = JSON.parse(store.notified_at) as { timestamp?: string }
        const notifiedTime = notifiedPayload.timestamp
          ? new Date(notifiedPayload.timestamp)
          : new Date(store.notified_at)

        const hoursElapsed = (Date.now() - notifiedTime.getTime()) / 3_600_000
        if (hoursElapsed >= 48) {
          pauseStore(store.store_id, `Automatisch gepauzeerd na 48u na dead-store melding (${health.daysSinceCreated}d zonder omzet)`)
        }
      } catch {
        // Malformed payload — pause immediately
        pauseStore(store.store_id, `Dead store cleanup (${health.daysSinceCreated}d geen omzet)`)
      }
    }
  }
}

// ── Main lifecycle cycle ────────────────────────────────────────────────────────

export async function runLifecycleCycle(): Promise<void> {
  console.log('[lifecycle] Lifecycle cyclus gestart')

  const stores = db.prepare(
    `SELECT store_id FROM stores WHERE status NOT IN ('paused','killed','failed')`,
  ).all() as { store_id: string }[]

  let thriving = 0, growing = 0, struggling = 0, dead = 0

  for (const { store_id } of stores) {
    const health = analyzeStoreHealth(store_id)
    if (!health) continue

    logEvent(store_id, 'health_check', { status: health.status, roas: health.roas, reason: health.reason })

    switch (health.status) {
      case 'THRIVING':
        thriving++
        // Signal: ready for product expansion
        logEvent(store_id, 'ready_for_expansion', { roas: health.roas })
        break

      case 'GROWING':
        growing++
        // Signal: consider reordering inventory
        logEvent(store_id, 'reorder_suggested', { roas: health.roas })
        break

      case 'STRUGGLING':
        struggling++
        logEvent(store_id, 'escalation_needed', { days: health.daysSinceCreated, roas: health.roas })
        break

      case 'DEAD':
        dead++
        // Handled separately in checkDeadStores
        break
    }
  }

  await checkDeadStores()

  console.log(
    `[lifecycle] Cyclus klaar — ${stores.length} stores: ` +
    `${thriving} thriving, ${growing} growing, ${struggling} struggling, ${dead} dead`,
  )
}

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getLifecycleEvents(storeId: string, limit = 50): LifecycleEvent[] {
  return db.prepare(
    `SELECT * FROM lifecycle_events WHERE store_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(storeId, limit) as LifecycleEvent[]
}

export function getAllHealthReports(): StoreHealthReport[] {
  const stores = db.prepare(
    `SELECT store_id FROM stores WHERE status NOT IN ('killed','failed')`,
  ).all() as { store_id: string }[]

  return stores
    .map(s => analyzeStoreHealth(s.store_id))
    .filter((r): r is StoreHealthReport => r !== null)
}
