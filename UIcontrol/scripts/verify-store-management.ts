// Verificatie Fase 4 — store-beheer.
// Draait tegen de database (poort-allocatie, prijzen, overrides) en tegen een
// draaiende server voor de verwijder-flow met bevestiging.
import fs from 'node:fs'
import { generateSync } from 'otplib'
import db, { allocatePort, releasePort } from '../src/server/db.js'
import { mergedStore, saveOverrides, applyPriceChange, applyAiEdit, parseAiEdit } from '../src/server/store-admin.js'
import { recordCombination, combinationHash, combinationTaken } from '../src/server/design/uniqueness.js'

const B = process.env.TEST_BASE ?? 'http://127.0.0.1:3313'

// Store-beheer zit achter de 2FA-gate — dat is het punt. De test logt dus echt
// in met een wegwerp-account en houdt de sessiecookie vast.
const jar = new Map<string, string>()
async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
  const r = await fetch(B + path, {
    method: opts.method ?? 'GET',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=')
    const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim()
    if (v === '') jar.delete(n); else jar.set(n, v)
  }
  const t = await r.text()
  let j: Record<string, unknown> | null = null
  try { j = JSON.parse(t) } catch { /* html */ }
  return { status: r.status, json: j }
}

const LOGIN_USER = process.env.TEST_USER ?? 'fernando'
const LOGIN_PW = 'StoreBeheerTest99!'

async function login(): Promise<boolean> {
  const begin = await api('/api/auth/setup/begin', { method: 'POST', body: { username: LOGIN_USER, password: LOGIN_PW } })
  if (begin.status !== 200) return false
  const secret = String(begin.json?.secret ?? '')
  const used: string[] = []
  const fresh = async () => {
    let c = generateSync({ secret })
    for (let i = 0; i < 35 && used.includes(c); i++) { await new Promise(r => setTimeout(r, 1000)); c = generateSync({ secret }) }
    used.push(c); return c
  }
  await api('/api/auth/setup/complete', { method: 'POST', body: { username: LOGIN_USER, password: LOGIN_PW, token: await fresh() } })
  await api('/api/auth/login', { method: 'POST', body: { username: LOGIN_USER, password: LOGIN_PW } })
  const two = await api('/api/auth/verify-2fa', { method: 'POST', body: { token: await fresh() } })
  return two.status === 200
}
let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const IDS = ['sm-a', 'sm-b', 'sm-c', 'sm-d']
const CATALOG = [
  { id: 'p-1', title: 'Alpha', description: 'First product.', price: 20, supplier: 'cj', supplierProductId: 'CJ-1', supplierVariantId: 'V1' },
  { id: 'p-2', title: 'Beta', description: 'Second product.', price: 33.33, supplier: 'cj', supplierProductId: 'CJ-2', supplierVariantId: 'V2' },
  { id: 'p-3', title: 'Gamma', description: 'Third product.', price: 9.5, supplier: 'cj', supplierProductId: 'CJ-3', supplierVariantId: 'V3' },
]

function seed() {
  const now = new Date().toISOString()
  db.prepare(`INSERT OR IGNORE INTO runs (run_id,niche,status,started_at,updated_at) VALUES ('sm-run','store mgmt','completed',?,?)`).run(now, now)
  for (const id of IDS) {
    db.prepare(`INSERT OR REPLACE INTO stores (store_id,run_id,subdomein,niche,preview_url,created_at,status,port,store_data,custom_data)
                VALUES (?, 'sm-run', ?, 'test niche', '', ?, 'live', NULL, ?, NULL)`)
      .run(id, id, now, JSON.stringify({ brand_name: id.toUpperCase(), slogan: 'Test slogan', products: CATALOG }))
  }
}
function cleanup() {
  try {
    for (const id of IDS) { releasePort(id); db.prepare(`DELETE FROM stores WHERE store_id = ?`).run(id) }
    db.prepare(`DELETE FROM store_combinations WHERE store_key LIKE 'sm-%'`).run()
    db.prepare(`DELETE FROM market_deals WHERE title = 'SM testdeal'`).run()
    db.prepare(`DELETE FROM runs WHERE run_id='sm-run'`).run()
  } catch { /* opruimen bepaalt de uitslag niet */ }
}

/**
 * De LLM-aanroep zelf zit niet in deze test — daar is een geldige DeepSeek-key
 * voor nodig. Wat hier getest wordt is het deel dat de LLM in toom houdt:
 * schemavalidatie, hallucinatie eruit filteren, emoji strippen en de diff.
 * Dat is precies het deel waar een fout schade doet.
 */
async function aiEditSection() {
  const store = mergedStore('sm-b')!

  const raw = {
    slogan: 'Sharper than before',
    products: [
      { id: 'p-1', title: 'Alpha Pro 🚀', description: 'Shorter, sharper copy.', price: 27.5 },
      { id: 'p-2', price: 39.99 },
      { id: 'bestaat-niet', title: 'Verzonnen product', price: 1 },
      { id: 'p-3', title: 'Gamma' },
    ],
    summary: 'Beschrijvingen ingekort en twee prijzen aangepast.',
  }

  const parsed = parseAiEdit(raw)
  check('LLM-antwoord voldoet aan het schema', parsed.ok, parsed.ok ? 'gevalideerd' : parsed.error)
  if (!parsed.ok) return

  const before = store.products.map(p => `${p.id}=${p.price}`).join(' ')
  const r = applyAiEdit('sm-b', store, parsed.edit)
  check('bewerking toegepast', r.ok && r.applied!.products === 2,
    `${r.applied!.products} producten gewijzigd (van de 4 die de LLM noemde)`)
  check('verzonnen product genegeerd', !r.diff!.some(d => d.id === 'bestaat-niet'),
    'onbekend id komt niet in de diff')
  check('ongewijzigd veld levert geen diff', !r.diff!.some(d => d.id === 'p-3'),
    'p-3 kreeg dezelfde titel terug → geen wijziging')

  const after = mergedStore('sm-b')!
  const alpha = after.products.find(p => p.id === 'p-1')!
  check('emoji uit de LLM-output geweerd', alpha.title === 'Alpha Pro',
    `LLM stuurde "Alpha Pro 🚀" → opgeslagen "${alpha.title}"`)
  check('prijzen uit de bewerking overgenomen', alpha.price === 27.5 && after.products[1].price === 39.99,
    `${before} → ${after.products.map(p => `${p.id}=${p.price}`).join(' ')}`)
  check('slogan bijgewerkt', after.slogan === 'Sharper than before', `"${after.slogan}"`)
  check('supplier-velden onaangeroerd', alpha.supplierProductId === 'CJ-1', `${alpha.supplierProductId}`)
  say(`  diff (${r.diff!.length} regels): ${r.diff!.map(d => `${d.id}.${d.field}`).join(', ')}`)
  say(`  samenvatting van de AI: "${r.summary}"`)

  // Een antwoord dat het schema schendt hoort te stranden vóór het de database raakt
  const badPrice = parseAiEdit({ products: [{ id: 'p-1', price: -5 }] })
  check('negatieve prijs afgekeurd door het schema', !badPrice.ok, badPrice.ok ? 'DOORGELATEN' : badPrice.error)
  const noId = parseAiEdit({ products: [{ title: 'zonder id' }] })
  check('product zonder id afgekeurd', !noId.ok, noId.ok ? 'DOORGELATEN' : noId.error)
}

async function main() {
  cleanup()
  seed()

  say('═══ 1. POORT-ALLOCATIE: ALTIJD DE LAAGSTE VRIJE ═══')
  const pa = allocatePort('sm-a')
  const pb = allocatePort('sm-b')
  const pc = allocatePort('sm-c')
  say(`  drie stores gedeployed → poorten ${pa}, ${pb}, ${pc}`)
  check('oplopend vanaf de onderkant van de range', pb === pa + 1 && pc === pb + 1, `${pa} < ${pb} < ${pc}`)

  check('idempotent per store', allocatePort('sm-a') === pa, `sm-a vraagt opnieuw → ${allocatePort('sm-a')}`)

  releasePort('sm-b')
  say(`  middelste store (sm-b, poort ${pb}) verwijderd`)
  const pd = allocatePort('sm-d')
  check('volgende deploy krijgt de vrijgekomen poort', pd === pb,
    `nieuwe store kreeg ${pd} — niet ${pc + 1}, maar het gat op ${pb}`)

  releasePort('sm-d')
  const pd2 = allocatePort('sm-d')
  check('opnieuw vrijgeven en pakken werkt', pd2 === pb, `${pd2}`)

  say('')
  say('═══ 2. PRIJZEN IN BULK ═══')
  const up = applyPriceChange('sm-a', { percent: 10 })
  check('procentuele verhoging', up.ok && up.changes.length === 3,
    up.changes.map(c => `${c.title} ${c.from}→${c.to}`).join(', '))
  // Niet `c.to * 100 === Math.round(c.to * 100)` gebruiken: 36.66 * 100 is in
  // drijvende komma 3665.999…, dus die check faalt op correcte prijzen.
  check('afronding op twee decimalen', up.changes.every(c => /^\d+(\.\d{1,2})?$/.test(String(c.to))),
    up.changes.map(c => c.to).join(', '))

  const round = applyPriceChange('sm-a', { roundTo: 0.95 })
  check('charme-afronding', round.ok && round.changes.every(c => Math.abs(c.to % 1 - 0.95) < 0.001),
    round.changes.map(c => `${c.from}→${c.to}`).join(', '))

  const crash = applyPriceChange('sm-a', { percent: -99 })
  check('prijzen worden nooit onder EUR 1 gezet', crash.ok && crash.changes.length === 0,
    `${crash.changes.length} wijzigingen bij -99%`)

  const noop = applyPriceChange('sm-a', {})
  check('lege opdracht geweigerd', !noop.ok, `"${noop.error}"`)

  const single = applyPriceChange('sm-a', { delta: 5, productIds: ['p-3'] })
  check('alleen het gekozen product', single.changes.length === 1 && single.changes[0].id === 'p-3',
    single.changes.map(c => `${c.id} ${c.from}→${c.to}`).join(', '))

  say('')
  say('═══ 3. OVERRIDES LATEN DE ORIGINELE DATA INTACT ═══')
  saveOverrides('sm-c', { slogan: 'Nieuwe slogan', products: [{ id: 'p-1', title: 'Alpha Pro' }] })
  const merged = mergedStore('sm-c')!
  const raw = db.prepare(`SELECT store_data, custom_data FROM stores WHERE store_id='sm-c'`)
    .get() as { store_data: string; custom_data: string }
  const base = JSON.parse(raw.store_data) as { slogan: string; products: Array<{ id: string; title: string; supplierProductId: string }> }
  check('merged toont de bewerking', merged.slogan === 'Nieuwe slogan' && merged.products[0].title === 'Alpha Pro',
    `slogan="${merged.slogan}" titel="${merged.products[0].title}"`)
  check('originele store_data ongewijzigd', base.slogan === 'Test slogan' && base.products[0].title === 'Alpha',
    `basis blijft "${base.products[0].title}" / "${base.slogan}"`)
  check('supplier-velden overleven de bewerking', merged.products[0].supplierProductId === 'CJ-1',
    `supplierProductId=${merged.products[0].supplierProductId}`)
  check('niet-bewerkte producten ongemoeid', merged.products[1].title === 'Beta', `${merged.products[1].title}`)

  say('')
  say('═══ 3b. AI-BEWERKING — NABEWERKING VAN HET LLM-ANTWOORD ═══')
  await aiEditSection()

  say('')
  say('═══ 4. VERWIJDEREN VIA DE API ═══')
  // Combinatie en deal koppelen zodat we kunnen zien dat ze meegaan
  const combo = { layout: 'a', hero: 'hero.centered', topbar: 'topbar.simple-line', motion: 'crisp-snap', palette: 'x', fonts: 'y' }
  recordCombination(combinationHash(combo), combo, 'sm-c')
  db.prepare(`INSERT INTO market_deals (store_id,title,subtitle,label,url,active,sort_order,created_at) VALUES (?,?,?,?,?,1,0,?)`)
    .run('sm-c', 'SM testdeal', '', '', '', new Date().toISOString())

  const anon = await fetch(`${B}/api/stores/sm-c`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'sm-c' }),
  })
  check('verwijderen zonder sessie geweigerd', anon.status === 401, `HTTP ${anon.status}`)

  const loggedIn = await login()
  check('ingelogd met 2FA voor de beheeracties', loggedIn, loggedIn ? `als ${LOGIN_USER}` : 'INLOGGEN MISLUKT — account bestaat mogelijk al')
  if (!loggedIn) { say('  (rest van sectie 4 overgeslagen)'); fail++; }

  const noConfirm = await api('/api/stores/sm-c', { method: 'DELETE', body: {} })
  check('zonder bevestiging geweigerd', noConfirm.status === 428,
    `HTTP ${noConfirm.status}, verwacht "${noConfirm.json?.expected}"`)

  const wrong = await api('/api/stores/sm-c', { method: 'DELETE', body: { confirm: 'sm-verkeerd' } })
  check('verkeerde bevestiging geweigerd', wrong.status === 428, `HTTP ${wrong.status}`)
  check('store staat er nog', !!db.prepare(`SELECT 1 FROM stores WHERE store_id='sm-c'`).get(), 'rij aanwezig')

  const del = await api('/api/stores/sm-c', { method: 'DELETE', body: { confirm: 'sm-c' } })
  const delBody = (del.json ?? {}) as { deleted?: boolean; steps?: string[] }
  check('met de juiste naam verwijderd', del.status === 200 && delBody.deleted === true, `HTTP ${del.status}`)
  say(`  opruimstappen: ${(delBody.steps ?? []).join(' | ')}`)
  check('uit de database', !db.prepare(`SELECT 1 FROM stores WHERE store_id='sm-c'`).get(), 'rij weg')
  check('poort vrijgegeven', !db.prepare(`SELECT 1 FROM port_allocations WHERE store_id='sm-c' AND released_at IS NULL`).get(), 'geen actieve allocatie')
  check('design-combinatie vrijgegeven', !combinationTaken(combinationHash(combo), 'iemand-anders'), 'hash weer beschikbaar')
  check('deal van het kopers-dashboard gehaald', !db.prepare(`SELECT 1 FROM market_deals WHERE store_id='sm-c'`).get(), 'geen deals meer')
  const market = await (await fetch(`${B}/api/market/stores`)).json() as Array<{ storeId: string }>
  check('uit de publieke etalage', !market.some(s => s.storeId === 'sm-c'), `${market.length} winkels in de etalage`)

  say('')
  say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
  cleanup()
  fs.writeFileSync(process.env.LOGFILE ?? 'store-management.txt', out.join('\n'), 'utf-8')
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); cleanup(); process.exit(1) })
