import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '../../data/dropship.db')

// Ensure data directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(dbPath)

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    niche TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    data TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stores (
    store_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    subdomein TEXT NOT NULL,
    niche TEXT NOT NULL,
    preview_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    roas REAL,
    status TEXT NOT NULL DEFAULT 'building',
    port INTEGER,
    health_status TEXT NOT NULL DEFAULT 'unknown',
    health_checked_at TEXT,
    health_response_ms INTEGER,
    health_error TEXT,
    ai_diagnosis TEXT,
    ai_diagnosed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  -- Voeg kolommen toe aan bestaande DB (idempotent via ALTER TABLE)
  CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);

  CREATE INDEX IF NOT EXISTS idx_stores_run_id ON stores(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

  CREATE TABLE IF NOT EXISTS niches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    trending_score INTEGER NOT NULL DEFAULT 50,
    active_advertisers INTEGER NOT NULL DEFAULT 0,
    market_size_eu TEXT NOT NULL DEFAULT 'medium',
    viral_potential INTEGER NOT NULL DEFAULT 50,
    sources TEXT NOT NULL DEFAULT '[]',
    reasoning TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'suggested',
    run_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_outputs (
    run_id        TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    output_json   TEXT NOT NULL,
    completed_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, agent_id),
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );

  CREATE INDEX IF NOT EXISTS idx_agent_outputs_run ON agent_outputs(run_id);
`)


// ── Lifecycle events ──────────────────────────────────────────────────────────
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

  -- Skills performance tracking
  CREATE TABLE IF NOT EXISTS skills_performance (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id           TEXT NOT NULL,
    agent_id         TEXT NOT NULL,
    success          INTEGER NOT NULL DEFAULT 1,
    attempts         INTEGER NOT NULL DEFAULT 1,
    duration_ms      INTEGER NOT NULL DEFAULT 0,
    cost_eur         REAL    NOT NULL DEFAULT 0,
    validation_errors TEXT   NOT NULL DEFAULT '[]',
    output_quality   INTEGER NOT NULL DEFAULT 70,
    created_at       TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills_performance(agent_id);
  CREATE INDEX IF NOT EXISTS idx_skills_run   ON skills_performance(run_id);

  -- Component A/B experiments
  CREATE TABLE IF NOT EXISTS component_experiments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id  TEXT NOT NULL UNIQUE,
    component_name TEXT NOT NULL,
    variant_a      TEXT NOT NULL,
    variant_b      TEXT NOT NULL,
    store_id       TEXT NOT NULL DEFAULT '',
    impressions_a  INTEGER NOT NULL DEFAULT 0,
    impressions_b  INTEGER NOT NULL DEFAULT 0,
    conversions_a  INTEGER NOT NULL DEFAULT 0,
    conversions_b  INTEGER NOT NULL DEFAULT 0,
    winner         TEXT,
    declared_at    TEXT,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_experiments_store ON component_experiments(store_id);
  CREATE INDEX IF NOT EXISTS idx_experiments_comp  ON component_experiments(component_name);

  CREATE TABLE IF NOT EXISTS ads (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id           TEXT NOT NULL,
    run_id             TEXT,
    platform           TEXT NOT NULL DEFAULT 'meta',
    format             TEXT NOT NULL DEFAULT 'image',
    phase              TEXT NOT NULL DEFAULT 'static',
    status             TEXT NOT NULL DEFAULT 'queued',
    higgsfield_job_id  TEXT,
    creative_url       TEXT,
    hook               TEXT NOT NULL DEFAULT '',
    primary_text       TEXT NOT NULL DEFAULT '',
    headline           TEXT,
    performance_score  REAL,
    created_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ads_store  ON ads(store_id);
  CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);

  CREATE TABLE IF NOT EXISTS higgsfield_jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id            INTEGER NOT NULL,
    job_id           TEXT UNIQUE,
    status           TEXT NOT NULL DEFAULT 'pending',
    input_image_url  TEXT,
    output_video_url TEXT,
    prompt           TEXT,
    created_at       TEXT NOT NULL,
    completed_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_hf_ad_id ON higgsfield_jobs(ad_id);
`)

// ── Nieuwe tables voor pipeline v2 ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_executions (
    id           TEXT PRIMARY KEY,
    run_id       TEXT NOT NULL,
    agent_name   TEXT NOT NULL,
    stage        TEXT NOT NULL,
    status       TEXT NOT NULL,
    input_json   TEXT,
    output_json  TEXT,
    error_message TEXT,
    cost_usd     REAL    DEFAULT 0,
    tokens_in    INTEGER DEFAULT 0,
    tokens_out   INTEGER DEFAULT 0,
    duration_ms  INTEGER DEFAULT 0,
    retry_count  INTEGER DEFAULT 0,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_executions_run   ON agent_executions(run_id);
  CREATE INDEX IF NOT EXISTS idx_executions_agent ON agent_executions(agent_name);
  CREATE INDEX IF NOT EXISTS idx_executions_status ON agent_executions(status);

  CREATE TABLE IF NOT EXISTS stage_outputs (
    run_id       TEXT NOT NULL,
    stage        TEXT NOT NULL,
    output_json  TEXT NOT NULL,
    approved_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, stage)
  );

  CREATE TABLE IF NOT EXISTS port_allocations (
    port         INTEGER PRIMARY KEY,
    store_id     TEXT NOT NULL,
    allocated_at TEXT NOT NULL,
    released_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ports_store ON port_allocations(store_id);
`)

// ── Idempotente migrations voor bestaande databases ──────────────────────────
const storesCols = (db.prepare(`PRAGMA table_info(stores)`).all() as { name: string }[]).map(c => c.name)
const storeMigrations: [string, string][] = [
  ['port',              'ALTER TABLE stores ADD COLUMN port INTEGER'],
  ['health_status',     "ALTER TABLE stores ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown'"],
  ['health_checked_at', 'ALTER TABLE stores ADD COLUMN health_checked_at TEXT'],
  ['health_response_ms','ALTER TABLE stores ADD COLUMN health_response_ms INTEGER'],
  ['health_error',      'ALTER TABLE stores ADD COLUMN health_error TEXT'],
  ['ai_diagnosis',      'ALTER TABLE stores ADD COLUMN ai_diagnosis TEXT'],
  ['ai_diagnosed_at',   'ALTER TABLE stores ADD COLUMN ai_diagnosed_at TEXT'],
  ['store_data',        'ALTER TABLE stores ADD COLUMN store_data TEXT'],       // originele StoreData JSON (voor rebuild)
  ['custom_data',       'ALTER TABLE stores ADD COLUMN custom_data TEXT'],      // CMS overrides JSON
]
for (const [col, sql] of storeMigrations) {
  if (!storesCols.includes(col)) {
    try { db.prepare(sql).run() } catch { /* already exists */ }
  }
}

// ── Migrations voor runs (pipeline v3 — state machine) ───────────────────────
const runsCols = (db.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[]).map(c => c.name)
const runMigrations: [string, string][] = [
  ['current_stage', 'ALTER TABLE runs ADD COLUMN current_stage TEXT'],
  ['state_json',    'ALTER TABLE runs ADD COLUMN state_json TEXT'],
  ['paused',        'ALTER TABLE runs ADD COLUMN paused INTEGER NOT NULL DEFAULT 0'],
]
for (const [col, sql] of runMigrations) {
  if (!runsCols.includes(col)) {
    try { db.prepare(sql).run() } catch { /* already exists */ }
  }
}

// ── Port-uniqueness migratie (fix voor dubbele poorten / nginx conflicten) ────
// 1) De-dup bestaande stores.port: bij een dubbele poort houden we de meest
//    recente store, de rest krijgt port = NULL (wordt bij volgende deploy opnieuw
//    en uniek toegewezen). 2) UNIQUE index als database-vangnet tegen races.
try {
  const dupPorts = db.prepare(`
    SELECT port FROM stores WHERE port IS NOT NULL GROUP BY port HAVING COUNT(*) > 1
  `).all() as { port: number }[]
  for (const { port } of dupPorts) {
    // Behoud de winnaar: live boven building/local boven overige, dan nieuwste
    const keep = db.prepare(`
      SELECT store_id FROM stores WHERE port = ?
      ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'building' THEN 1 WHEN 'local' THEN 2 ELSE 3 END,
               created_at DESC
      LIMIT 1
    `).get(port) as { store_id: string } | undefined
    if (keep) {
      db.prepare(`UPDATE stores SET port = NULL WHERE port = ? AND store_id != ?`).run(port, keep.store_id)
      console.warn(`[db] dubbele poort ${port} opgeschoond — behouden: ${keep.store_id.slice(0, 8)}`)
    }
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_port_unique ON stores(port) WHERE port IS NOT NULL`)
} catch (err) {
  console.error('[db] port-uniqueness migratie mislukt (server draait door):', err)
}

// Helper for the runner to persist agent outputs immediately on completion.
export function saveAgentOutput(runId: string, agentId: string, output: Record<string, unknown>): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO agent_outputs (run_id, agent_id, output_json, completed_at)
       VALUES (?, ?, ?, ?)`,
    ).run(runId, agentId, JSON.stringify(output), new Date().toISOString())
  } catch (err) {
    console.error(`[db] saveAgentOutput(${runId}, ${agentId}) failed:`, err)
  }
}

export function getAgentOutput(runId: string, agentId: string): Record<string, unknown> | null {
  try {
    const row = db.prepare(
      `SELECT output_json FROM agent_outputs WHERE run_id = ? AND agent_id = ?`,
    ).get(runId, agentId) as { output_json: string } | undefined
    if (!row) return null
    return JSON.parse(row.output_json) as Record<string, unknown>
  } catch (err) {
    console.error(`[db] getAgentOutput(${runId}, ${agentId}) failed:`, err)
    return null
  }
}

export function logAgentExecution(exec: {
  id: string; runId: string; agentName: string; stage: string; status: string
  inputJson?: string; outputJson?: string; errorMessage?: string
  costUsd?: number; tokensIn?: number; tokensOut?: number
  durationMs?: number; retryCount?: number; startedAt: string; finishedAt?: string
}): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO agent_executions
        (id, run_id, agent_name, stage, status, input_json, output_json, error_message,
         cost_usd, tokens_in, tokens_out, duration_ms, retry_count, started_at, finished_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      exec.id, exec.runId, exec.agentName, exec.stage, exec.status,
      exec.inputJson ?? null, exec.outputJson ?? null, exec.errorMessage ?? null,
      exec.costUsd ?? 0, exec.tokensIn ?? 0, exec.tokensOut ?? 0,
      exec.durationMs ?? 0, exec.retryCount ?? 0, exec.startedAt, exec.finishedAt ?? null,
    )
  } catch (err) {
    console.error('[db] logAgentExecution failed:', err)
  }
}

export function saveStageOutput(runId: string, stage: string, output: Record<string, unknown>): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO stage_outputs (run_id, stage, output_json, approved_at) VALUES (?,?,?,?)
    `).run(runId, stage, JSON.stringify(output), new Date().toISOString())
  } catch (err) {
    console.error('[db] saveStageOutput failed:', err)
  }
}

export function getStageOutput(runId: string, stage: string): Record<string, unknown> | null {
  try {
    const row = db.prepare(`SELECT output_json FROM stage_outputs WHERE run_id=? AND stage=?`).get(runId, stage) as { output_json: string } | undefined
    return row ? JSON.parse(row.output_json) as Record<string, unknown> : null
  } catch { return null }
}

export const PORT_RANGE_MIN = parseInt(process.env.STORE_PORT_MIN ?? '4001', 10)
export const PORT_RANGE_MAX = parseInt(process.env.STORE_PORT_MAX ?? '4999', 10)

export class PortExhaustedError extends Error {
  constructor(message: string) { super(message); this.name = 'PortExhaustedError' }
}

/**
 * Centrale, atomaire port-allocatie — de DATABASE is de single source of truth.
 *
 * - Idempotent per storeId (herhaalde deploys van dezelfde store → zelfde poort).
 * - Scant de volledige range [PORT_RANGE_MIN..MAX] en vermijdt élke poort die in
 *   gebruik is door een store (elke status met een niet-NULL poort) óf door een
 *   actieve allocatie in het ledger.
 * - Claimt atomair via INSERT/UPSERT op de port_allocations PRIMARY KEY; een
 *   gelijktijdige claim (ander proces/run) botst op de UNIQUE constraint en wordt
 *   automatisch opnieuw geprobeerd — geen twee stores krijgen ooit dezelfde poort.
 * - Gooit PortExhaustedError als de range vol is (i.p.v. stil een bestaande poort
 *   te hergebruiken).
 */
export function allocatePort(storeId: string): number {
  const now = new Date().toISOString()

  // Idempotent: bestaande actieve allocatie of reeds gezette stores.port
  const existingAlloc = db.prepare(
    `SELECT port FROM port_allocations WHERE store_id = ? AND released_at IS NULL`,
  ).get(storeId) as { port: number } | undefined
  if (existingAlloc) return existingAlloc.port

  const existingStore = db.prepare(
    `SELECT port FROM stores WHERE store_id = ? AND port IS NOT NULL`,
  ).get(storeId) as { port: number } | undefined
  if (existingStore) {
    // Ledger bijtrekken zodat het consistent is, dan die poort teruggeven
    try {
      db.prepare(`
        INSERT INTO port_allocations (port, store_id, allocated_at, released_at) VALUES (?,?,?,NULL)
        ON CONFLICT(port) DO UPDATE SET store_id = excluded.store_id, released_at = NULL
      `).run(existingStore.port, storeId, now)
    } catch { /* ledger is best-effort hier */ }
    return existingStore.port
  }

  for (let attempt = 0; attempt < 64; attempt++) {
    // Bouw de set van bezette poorten uit BEIDE bronnen
    const used = new Set<number>()
    for (const r of db.prepare(`SELECT port FROM stores WHERE port IS NOT NULL`).all() as { port: number }[]) used.add(r.port)
    for (const r of db.prepare(`SELECT port FROM port_allocations WHERE released_at IS NULL`).all() as { port: number }[]) used.add(r.port)

    let port = -1
    for (let p = PORT_RANGE_MIN; p <= PORT_RANGE_MAX; p++) {
      if (!used.has(p)) { port = p; break }
    }
    if (port === -1) {
      throw new PortExhaustedError(
        `Geen vrije poort in range ${PORT_RANGE_MIN}-${PORT_RANGE_MAX} — alle ${PORT_RANGE_MAX - PORT_RANGE_MIN + 1} poorten in gebruik. Verwijder ongebruikte stores.`,
      )
    }

    // Atomaire claim: nieuwe poort → INSERT slaagt; vrijgegeven poort → UPSERT
    // reactiveert; actieve poort van een ander (race) → 0 changes → opnieuw.
    const info = db.prepare(`
      INSERT INTO port_allocations (port, store_id, allocated_at, released_at) VALUES (?,?,?,NULL)
      ON CONFLICT(port) DO UPDATE SET
        store_id = excluded.store_id, allocated_at = excluded.allocated_at, released_at = NULL
      WHERE port_allocations.released_at IS NOT NULL
    `).run(port, storeId, now)

    if (info.changes === 1) return port
    // changes === 0: poort werd net door een ander actief geclaimd → retry
  }

  throw new PortExhaustedError('allocatePort: kon geen poort claimen na 64 pogingen (hoge contention)')
}

/** @deprecated Gebruik allocatePort — alias voor backward-compat. */
export function claimPort(storeId: string): number {
  return allocatePort(storeId)
}

export function upsertStore(store: {
  storeId: string; runId: string; subdomain: string; niche: string
  previewUrl: string; port: number; status?: string
}): void {
  try {
    db.prepare(`
      INSERT INTO stores (store_id, run_id, subdomein, niche, preview_url, port, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        preview_url = excluded.preview_url,
        port        = excluded.port,
        status      = excluded.status
    `).run(
      store.storeId, store.runId, store.subdomain, store.niche,
      store.previewUrl, store.port, store.status ?? 'building',
      new Date().toISOString(),
    )
  } catch (err) {
    console.error('[db] upsertStore failed:', err)
  }
}

export function updateStoreHealth(storeId: string, health: {
  status: string; healthStatus: string; responseMs?: number; error?: string
}): void {
  try {
    db.prepare(`
      UPDATE stores SET
        status = ?, health_status = ?, health_checked_at = ?,
        health_response_ms = ?, health_error = ?
      WHERE store_id = ?
    `).run(
      health.status, health.healthStatus, new Date().toISOString(),
      health.responseMs ?? null, health.error ?? null, storeId,
    )
  } catch (err) {
    console.error('[db] updateStoreHealth failed:', err)
  }
}

export function getLiveStores(): Array<{ storeId: string; previewUrl: string; port: number | null }> {
  try {
    return (db.prepare(`
      SELECT store_id as storeId, preview_url as previewUrl, port
      FROM stores WHERE status IN ('live','building') AND preview_url != ''
    `).all() as Array<{ storeId: string; previewUrl: string; port: number | null }>)
  } catch { return [] }
}

export function releasePort(storeId: string): void {
  try {
    db.prepare(`UPDATE port_allocations SET released_at=? WHERE store_id=? AND released_at IS NULL`)
      .run(new Date().toISOString(), storeId)
  } catch { /* ignore */ }
}

export function savePipelineState(
  runId: string,
  currentStage: string,
  stateJson: Record<string, unknown>,
  paused = false,
): void {
  try {
    db.prepare(`
      UPDATE runs
      SET current_stage = ?, state_json = ?, paused = ?, updated_at = ?
      WHERE run_id = ?
    `).run(currentStage, JSON.stringify(stateJson), paused ? 1 : 0, new Date().toISOString(), runId)
  } catch (err) {
    console.error('[db] savePipelineState failed:', err)
  }
}

export function loadPipelineState(runId: string): {
  currentStage: string | null
  stateJson: Record<string, unknown> | null
  paused: boolean
} | null {
  try {
    const row = db.prepare(
      `SELECT current_stage, state_json, paused FROM runs WHERE run_id = ?`,
    ).get(runId) as { current_stage: string | null; state_json: string | null; paused: number } | undefined
    if (!row) return null
    return {
      currentStage: row.current_stage,
      stateJson: row.state_json ? (JSON.parse(row.state_json) as Record<string, unknown>) : null,
      paused: row.paused === 1,
    }
  } catch (err) {
    console.error('[db] loadPipelineState failed:', err)
    return null
  }
}

export function listRecentRuns(limit = 20): Array<{
  runId: string
  niche: string
  status: string
  currentStage: string | null
  paused: boolean
  startedAt: string
  completedAt: string | null
}> {
  try {
    const rows = db.prepare(`
      SELECT run_id, niche, status, current_stage, paused, started_at, completed_at
      FROM runs ORDER BY started_at DESC LIMIT ?
    `).all(limit) as Array<{
      run_id: string; niche: string; status: string; current_stage: string | null
      paused: number; started_at: string; completed_at: string | null
    }>
    return rows.map(r => ({
      runId: r.run_id, niche: r.niche, status: r.status,
      currentStage: r.current_stage, paused: r.paused === 1,
      startedAt: r.started_at, completedAt: r.completed_at,
    }))
  } catch (err) {
    console.error('[db] listRecentRuns failed:', err)
    return []
  }
}

export function listAgentExecutions(filter: {
  runId?: string; agentName?: string; status?: string; limit?: number; offset?: number
} = {}): Array<{
  id: string; runId: string; agentName: string; stage: string; status: string
  inputJson: string | null; outputJson: string | null; errorMessage: string | null
  costUsd: number; tokensIn: number; tokensOut: number
  durationMs: number; retryCount: number; startedAt: string; finishedAt: string | null
}> {
  const conds: string[] = []
  const params: unknown[] = []
  if (filter.runId)     { conds.push('run_id = ?');     params.push(filter.runId) }
  if (filter.agentName) { conds.push('agent_name = ?'); params.push(filter.agentName) }
  if (filter.status)    { conds.push('status = ?');     params.push(filter.status) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const limit = filter.limit ?? 100
  const offset = filter.offset ?? 0
  try {
    const rows = db.prepare(`
      SELECT * FROM agent_executions ${where}
      ORDER BY started_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<{
      id: string; run_id: string; agent_name: string; stage: string; status: string
      input_json: string | null; output_json: string | null; error_message: string | null
      cost_usd: number; tokens_in: number; tokens_out: number
      duration_ms: number; retry_count: number; started_at: string; finished_at: string | null
    }>
    return rows.map(r => ({
      id: r.id, runId: r.run_id, agentName: r.agent_name, stage: r.stage, status: r.status,
      inputJson: r.input_json, outputJson: r.output_json, errorMessage: r.error_message,
      costUsd: r.cost_usd, tokensIn: r.tokens_in, tokensOut: r.tokens_out,
      durationMs: r.duration_ms, retryCount: r.retry_count,
      startedAt: r.started_at, finishedAt: r.finished_at,
    }))
  } catch (err) {
    console.error('[db] listAgentExecutions failed:', err)
    return []
  }
}

export function aggregateCosts(runId?: string): {
  byRun: Array<{ runId: string; totalUsd: number; calls: number }>
  byAgent: Array<{ agentName: string; totalUsd: number; calls: number; successRate: number }>
} {
  try {
    const runFilter = runId ? `WHERE run_id = ?` : ''
    const args = runId ? [runId] : []
    const byRun = db.prepare(`
      SELECT run_id, SUM(cost_usd) as total, COUNT(*) as calls
      FROM agent_executions ${runFilter}
      GROUP BY run_id ORDER BY MAX(started_at) DESC LIMIT 20
    `).all(...args) as Array<{ run_id: string; total: number; calls: number }>
    const byAgent = db.prepare(`
      SELECT agent_name,
             SUM(cost_usd) as total,
             COUNT(*) as calls,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as ok
      FROM agent_executions ${runFilter}
      GROUP BY agent_name ORDER BY total DESC
    `).all(...args) as Array<{ agent_name: string; total: number; calls: number; ok: number }>
    return {
      byRun: byRun.map(r => ({ runId: r.run_id, totalUsd: r.total ?? 0, calls: r.calls })),
      byAgent: byAgent.map(a => ({
        agentName: a.agent_name, totalUsd: a.total ?? 0, calls: a.calls,
        successRate: a.calls > 0 ? a.ok / a.calls : 0,
      })),
    }
  } catch (err) {
    console.error('[db] aggregateCosts failed:', err)
    return { byRun: [], byAgent: [] }
  }
}

export function getResumableRuns(): { runId: string; niche: string }[] {
  try {
    const rows = db.prepare(
      `SELECT run_id, niche FROM runs WHERE status = 'running'`,
    ).all() as { run_id: string; niche: string }[]
    return rows.map(r => ({ runId: r.run_id, niche: r.niche }))
  } catch (err) {
    console.error('[db] getResumableRuns failed:', err)
    return []
  }
}

export default db
