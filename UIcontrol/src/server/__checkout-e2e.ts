// Verificatie van de centrale checkout-gateway tegen een draaiende server.
import fs from 'node:fs'
import db from './db.js'

const B = process.env.TEST_BASE ?? 'http://127.0.0.1:3312'
const GOOD = 'https://trailform.clynado.com'
let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (name: string, ok: boolean, detail: string) => {
  if (ok) { pass++; say(`  ✓ ${name} — ${detail}`) } else { fail++; say(`  ✗ FAIL ${name} — ${detail}`) }
}

async function post(body: unknown, origin?: string) {
  const r = await fetch(`${B}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  })
  const t = await r.text()
  let j: Record<string, unknown> | null = null
  try { j = JSON.parse(t) } catch { /* html */ }
  return { status: r.status, json: j, cors: r.headers.get('access-control-allow-origin'), vary: r.headers.get('vary') }
}

const CATALOG = [
  { id: 'p-1', title: 'Folding kettlebell', price: 49.95, supplier: 'cj', supplierProductId: 'CJ-AAA', supplierVariantId: 'V1' },
  { id: 'p-2', title: 'Travel mat', price: 24.5, supplier: 'cj', supplierProductId: 'CJ-BBB', supplierVariantId: 'V2' },
]

const lastOrder = () => db.prepare(
  `SELECT amount_eur, items_json, store_id, subdomain FROM checkout_orders ORDER BY id DESC LIMIT 1`,
).get() as { amount_eur: number; items_json: string; store_id: string; subdomain: string }

function seed() {
  const now = new Date().toISOString()
  db.prepare(`INSERT OR IGNORE INTO runs (run_id,niche,status,started_at,updated_at) VALUES ('co-run','checkout test','completed',?,?)`).run(now, now)
  db.prepare(`INSERT OR REPLACE INTO stores (store_id,run_id,subdomein,niche,preview_url,created_at,status,port,store_data)
              VALUES ('co-live','co-run','trailform','portable gym equipment','',?,'live',NULL,?)`)
    .run(now, JSON.stringify({ brand_name: 'Trailform', products: CATALOG }))
  db.prepare(`INSERT OR REPLACE INTO stores (store_id,run_id,subdomein,niche,preview_url,created_at,status,port,store_data)
              VALUES ('co-dead','co-run','oldshop','old','',?,'killed',NULL,?)`)
    .run(now, JSON.stringify({ brand_name: 'Oldshop', products: CATALOG }))
}

function cleanup() {
  try {
    db.prepare(`DELETE FROM checkout_orders WHERE store_id IN ('co-live','co-dead')`).run()
    db.prepare(`DELETE FROM stores WHERE store_id IN ('co-live','co-dead')`).run()
    db.prepare(`DELETE FROM runs WHERE run_id='co-run'`).run()
  } catch { /* opruimen mag nooit de uitslag bepalen */ }
}

async function main() {
  seed()

  say('═══ 1. ORIGIN-CONTROLE ═══')
  const noOrigin = await post({ storeId: 'co-live', items: [{ id: 'p-1' }] })
  check('zonder Origin geweigerd', noOrigin.status === 403, `HTTP ${noOrigin.status}`)

  for (const bad of ['https://evil.com', 'https://clynado.com.evil.com', 'http://trailform.clynado.com', 'https://notclynado.com']) {
    const r = await post({ storeId: 'co-live', items: [{ id: 'p-1' }] }, bad)
    check(`vreemde origin geweigerd: ${bad}`, r.status === 403 && r.cors === null, `HTTP ${r.status}, ACAO=${r.cors}`)
  }
  const apex = await post({ storeId: 'co-live', items: [{ id: 'p-1' }] }, 'https://clynado.com')
  check('apex-origin toegestaan', apex.status === 200, `HTTP ${apex.status}`)

  say('')
  say('═══ 2. WINKEL-CONTROLE ═══')
  const unknown = await post({ storeId: 'bestaat-niet', items: [{ id: 'p-1' }] }, GOOD)
  check('onbekende winkel → 404', unknown.status === 404, `HTTP ${unknown.status} "${unknown.json?.error}"`)
  const dead = await post({ storeId: 'co-dead', items: [{ id: 'p-1' }] }, GOOD)
  check('verwijderde winkel → 409', dead.status === 409, `HTTP ${dead.status} "${dead.json?.error}"`)

  say('')
  say('═══ 3. PRIJS KOMT UIT DE CATALOGUS, NIET VAN DE CLIENT ═══')
  const before = (db.prepare(`SELECT COUNT(*) c FROM checkout_orders`).get() as { c: number }).c

  const tamper = await post({ storeId: 'co-live', items: [{ id: 'p-1', price: 0.01, quantity: 2 }] }, GOOD)
  const row = lastOrder()
  check('poging tot prijsmanipulatie afgeslagen', tamper.status === 200 && row.amount_eur === 99.9,
    `client vroeg 2x EUR 0.01 → opgeslagen EUR ${row.amount_eur.toFixed(2)} (2 x 49.95)`)
  const items = JSON.parse(row.items_json) as Array<Record<string, string>>
  check('supplier-velden uit de catalogus', items[0].supplierProductId === 'CJ-AAA' && items[0].supplierVariantId === 'V1',
    `supplierProductId=${items[0].supplierProductId} variant=${items[0].supplierVariantId}`)
  check('order gekoppeld aan de juiste winkel', row.store_id === 'co-live' && row.subdomain === 'trailform',
    `store=${row.store_id} sub=${row.subdomain}`)

  const spoof = await post({ storeId: 'co-live', items: [{ id: 'p-2', supplierProductId: 'CJ-HACKED' }] }, GOOD)
  const spoofItems = JSON.parse(lastOrder().items_json) as Array<Record<string, string>>
  check('client kan supplier-id niet overschrijven', spoof.status === 200 && spoofItems[0].supplierProductId === 'CJ-BBB',
    `client stuurde CJ-HACKED → opgeslagen ${spoofItems[0].supplierProductId}`)

  const foreign = await post({ storeId: 'co-live', items: [{ id: 'niet-van-deze-winkel', price: 10 }] }, GOOD)
  check('product van een andere winkel geweigerd', foreign.status === 400, `HTTP ${foreign.status} "${foreign.json?.error}"`)

  const huge = await post({ storeId: 'co-live', items: [{ id: 'p-1', quantity: 999 }] }, GOOD)
  check('aantal wordt afgetopt op 20', huge.status === 200 && lastOrder().amount_eur === 999,
    `999 stuks gevraagd → EUR ${lastOrder().amount_eur} (20 x 49.95)`)

  say('')
  say('═══ 4. MEERDERE PRODUCTEN IN ÉÉN BESTELLING ═══')
  const multi = await post({ storeId: 'co-live', items: [{ id: 'p-1', quantity: 1 }, { id: 'p-2', quantity: 3 }] }, GOOD)
  const rowMulti = lastOrder()
  check('bedrag opgeteld uit de catalogus', multi.status === 200 && rowMulti.amount_eur === 123.45,
    `1x49.95 + 3x24.50 = EUR ${rowMulti.amount_eur}`)
  check('beide items bewaard voor fulfillment', (JSON.parse(rowMulti.items_json) as unknown[]).length === 2,
    `${(JSON.parse(rowMulti.items_json) as unknown[]).length} items in items_json`)

  say('')
  say('═══ 5. CORS-HEADERS ═══')
  const pre = await fetch(`${B}/api/checkout/session`, { method: 'OPTIONS', headers: { Origin: GOOD } })
  check('preflight vanaf een store → 204', pre.status === 204,
    `HTTP ${pre.status}, ACAO=${pre.headers.get('access-control-allow-origin')}`)
  const preBad = await fetch(`${B}/api/checkout/session`, { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } })
  check('preflight vanaf een vreemde origin → 403', preBad.status === 403, `HTTP ${preBad.status}`)
  const good = await post({ storeId: 'co-live', items: [{ id: 'p-1' }] }, GOOD)
  check('Vary: Origin gezet', (good.vary ?? '').toLowerCase().includes('origin'), `Vary=${good.vary}`)
  check('ACAO exact de aanvragende store', good.cors === GOOD, `ACAO=${good.cors}`)

  say('')
  say('═══ 6. GATE — checkout publiek, admin dicht ═══')
  const health = await fetch(`${B}/api/health`)
  const admin = await fetch(`${B}/api/stores`)
  check('/api/checkout/session niet door de auth-gate geblokkeerd', good.status !== 401 && good.status !== 302, `HTTP ${good.status}`)
  check('/api/stores nog steeds achter de gate', admin.status === 401, `HTTP ${admin.status}`)
  check('/api/health publiek', health.status === 200, `HTTP ${health.status}`)

  const after = (db.prepare(`SELECT COUNT(*) c FROM checkout_orders`).get() as { c: number }).c
  say('')
  say(`Orders aangemaakt tijdens de test: ${after - before}`)
  say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)

  cleanup()
  fs.writeFileSync(process.env.LOGFILE ?? 'checkout-e2e.txt', out.join('\n'), 'utf-8')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); cleanup(); process.exit(1) })
