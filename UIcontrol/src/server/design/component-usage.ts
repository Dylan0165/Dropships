// ═══════ Component-gebruik over alle winkels ═══════
//
// De catalogus telt 106 componenten, maar de audit van 29 juli 2026 liet zien
// dat vijf winkels er samen 28 gebruikten — en dat vier van de vijf dezelfde
// nav, footer en gallery kregen. Reden: de afgeleide selectie koos uit
// hardgecodeerde lijstjes van 3-4 id's per gleuf, en de seed bepaalde alleen
// wélke van die drie.
//
// Dit bestand houdt bij wat er al gebruikt is, zodat de volgende winkel eerst de
// nog ongebruikte varianten pakt. Zelfde principe als `layout_history` voor
// layouts, maar dan per component.

import db from '../db.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS component_usage (
    component_id TEXT PRIMARY KEY,
    uses         INTEGER NOT NULL DEFAULT 0,
    last_used    TEXT
  );
`)

/** Telt één store-build mee voor elk gebruikt component. */
export function recordComponentUse(ids: readonly string[]): void {
  if (ids.length === 0) return
  const stmt = db.prepare(`
    INSERT INTO component_usage (component_id, uses, last_used) VALUES (?, 1, ?)
    ON CONFLICT(component_id) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used
  `)
  const now = new Date().toISOString()
  const tx = db.transaction((list: readonly string[]) => {
    for (const id of list) stmt.run(id.replace(/\[.*\]$/, ''), now)
  })
  try { tx(ids) } catch (err) {
    console.warn('[component-usage] bijhouden mislukt:', err instanceof Error ? err.message : err)
  }
}

/** Hoe vaak elk component al gebruikt is. Ontbrekend = nog nooit. */
export function componentUsage(): Map<string, number> {
  try {
    const rows = db.prepare('SELECT component_id, uses FROM component_usage').all() as Array<{ component_id: string; uses: number }>
    return new Map(rows.map(r => [r.component_id, r.uses]))
  } catch {
    return new Map()
  }
}

/**
 * Kiest uit `pool` bij voorkeur iets dat nog niet (of het minst) gebruikt is.
 * Binnen de groep minst-gebruikten beslist de seed, zodat twee winkels die
 * tegelijk gebouwd worden niet allebei hetzelfde pakken.
 */
export function pickFresh<T extends string>(pool: readonly T[], usage: Map<string, number>, seed: number, offset = 0): T {
  if (pool.length === 0) throw new Error('[component-usage] lege pool')
  let min = Infinity
  for (const id of pool) min = Math.min(min, usage.get(id) ?? 0)
  const freshest = pool.filter(id => (usage.get(id) ?? 0) === min)
  return freshest[Math.abs(seed + offset) % freshest.length]
}

/** Voor de LLM-prompt: hoe vaak dit component al ergens in het netwerk staat. */
export function usageForPrompt(): Record<string, number> {
  return Object.fromEntries(componentUsage())
}
