/**
 * Component A/B experimentation lab.
 *
 * Assigns visitors to component variants, records conversions,
 * and auto-declares a winner after statistical significance.
 */
import { createHash } from 'crypto'
import db from './db.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComponentExperiment {
  id: number
  experiment_id: string
  component_name: string
  variant_a: string
  variant_b: string
  store_id: string
  impressions_a: number
  impressions_b: number
  conversions_a: number
  conversions_b: number
  winner: string | null
  declared_at: string | null
  created_at: string
}

// ── DB setup ──────────────────────────────────────────────────────────────────

export function ensureComponentLabTables(): void {
  db.exec(`
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
  `)
}

// ── Experiment CRUD ────────────────────────────────────────────────────────────

export function createExperiment(params: {
  componentName: string
  variantA: string
  variantB: string
  storeId?: string
}): string {
  const experimentId = createHash('sha256')
    .update(`${params.componentName}-${params.storeId ?? 'global'}-${Date.now()}`)
    .digest('hex')
    .slice(0, 16)

  db.prepare(
    `INSERT OR IGNORE INTO component_experiments
     (experiment_id, component_name, variant_a, variant_b, store_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    experimentId,
    params.componentName,
    params.variantA,
    params.variantB,
    params.storeId ?? '',
    new Date().toISOString(),
  )

  return experimentId
}

// ── Variant assignment (deterministic, session-stable) ────────────────────────

export function assignComponentVariant(experimentId: string, sessionId: string): 'A' | 'B' {
  // Already has a winner — serve winner
  const exp = db.prepare(
    `SELECT winner FROM component_experiments WHERE experiment_id = ?`,
  ).get(experimentId) as { winner: string | null } | undefined

  if (exp?.winner) return exp.winner as 'A' | 'B'

  // Deterministic 50/50 split via hash
  const hash = createHash('md5').update(experimentId + sessionId).digest('hex')
  const variant: 'A' | 'B' = parseInt(hash[0], 16) < 8 ? 'A' : 'B'

  // Record impression
  const col = `impressions_${variant.toLowerCase()}`
  db.prepare(
    `UPDATE component_experiments SET ${col} = ${col} + 1 WHERE experiment_id = ?`,
  ).run(experimentId)

  return variant
}

// ── Conversion recording ────────────────────────────────────────────────────────

export function recordComponentConversion(experimentId: string, variant: 'A' | 'B'): void {
  const col = `conversions_${variant.toLowerCase()}`
  db.prepare(
    `UPDATE component_experiments SET ${col} = ${col} + 1 WHERE experiment_id = ? AND winner IS NULL`,
  ).run(experimentId)

  // Auto-declare winner if statistically significant (z-test approximation)
  maybeAutoWinner(experimentId)
}

function maybeAutoWinner(experimentId: string): void {
  const exp = db.prepare(
    `SELECT impressions_a, impressions_b, conversions_a, conversions_b
     FROM component_experiments WHERE experiment_id = ?`,
  ).get(experimentId) as {
    impressions_a: number; impressions_b: number
    conversions_a: number; conversions_b: number
  } | undefined

  if (!exp) return

  const { impressions_a: nA, impressions_b: nB, conversions_a: cA, conversions_b: cB } = exp

  // Minimum sample size
  if (nA < 100 || nB < 100) return

  const pA = cA / nA
  const pB = cB / nB
  const pPool = (cA + cB) / (nA + nB)
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB))
  if (se === 0) return

  const z = Math.abs(pA - pB) / se

  // 95% confidence = z ≥ 1.96
  if (z >= 1.96) {
    const winner = pA >= pB ? 'A' : 'B'
    declareWinner(experimentId, winner)
  }
}

// ── Manual winner declaration ─────────────────────────────────────────────────

export function declareWinner(experimentId: string, winner: 'A' | 'B'): boolean {
  const result = db.prepare(
    `UPDATE component_experiments
     SET winner = ?, declared_at = ?
     WHERE experiment_id = ? AND winner IS NULL`,
  ).run(winner, new Date().toISOString(), experimentId)

  if (result.changes > 0) {
    console.log(`[component-lab] Winnaar gedeclareerd: experiment ${experimentId} → variant ${winner}`)
  }
  return result.changes > 0
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getExperiments(storeId?: string): ComponentExperiment[] {
  if (storeId) {
    return db.prepare(
      `SELECT * FROM component_experiments WHERE store_id = ? ORDER BY created_at DESC`,
    ).all(storeId) as ComponentExperiment[]
  }
  return db.prepare(
    `SELECT * FROM component_experiments ORDER BY created_at DESC LIMIT 100`,
  ).all() as ComponentExperiment[]
}

export function getWinners(): ComponentExperiment[] {
  return db.prepare(
    `SELECT * FROM component_experiments WHERE winner IS NOT NULL ORDER BY declared_at DESC`,
  ).all() as ComponentExperiment[]
}

export function getExperimentStats(experimentId: string): {
  experiment: ComponentExperiment | null
  conversionRateA: number
  conversionRateB: number
  lift: number
} {
  const exp = db.prepare(
    `SELECT * FROM component_experiments WHERE experiment_id = ?`,
  ).get(experimentId) as ComponentExperiment | null

  if (!exp) return { experiment: null, conversionRateA: 0, conversionRateB: 0, lift: 0 }

  const cvA = exp.impressions_a > 0 ? exp.conversions_a / exp.impressions_a : 0
  const cvB = exp.impressions_b > 0 ? exp.conversions_b / exp.impressions_b : 0
  const lift = cvA > 0 ? ((cvB - cvA) / cvA) * 100 : 0

  return {
    experiment: exp,
    conversionRateA: parseFloat((cvA * 100).toFixed(2)),
    conversionRateB: parseFloat((cvB * 100).toFixed(2)),
    lift: parseFloat(lift.toFixed(1)),
  }
}
