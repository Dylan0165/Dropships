// Verificatie Taak C — hoeveel CJ-calls kost een assortiment?
//
// Meet het ECHTE aantal /product/list-calls van CJAdapter.searchProducts, met
// een onderschepte fetch in plaats van CJ zelf. Twee configuraties, dezelfde
// code: de oude (alle 7 EU-warehouses + globale pass, alles ophalen) en de
// nieuwe (3 representatieve warehouses + globale pass, stoppen zodra er genoeg
// is). De tussenruimte staat op 0ms omdat er geen echt verkeer naar CJ gaat —
// op productie is dat 1100ms, en juist daar telt elke bespaarde call.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = path.join(os.tmpdir(), 'dropship-efficiency')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

process.env.DATABASE_PATH = path.join(TMP, 'test.db')
process.env.CJ_EMAIL = 'test@example.invalid'
process.env.CJ_API_KEY = 'test-key-not-real'
process.env.CJ_REQUEST_SPACING_MS = '0'      // alleen in deze test
process.env.CJ_BACKOFF_BASE_MS = '5'
process.env.LLM_API_KEY = ''

const REQUEST_SPACING_PROD_MS = 1100

// ── Nep-CJ ────────────────────────────────────────────────────────────────────
let httpListCalls = 0
let force429 = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  if (url.includes('/authentication/getAccessToken')) {
    const in30d = new Date(Date.now() + 30 * 864e5).toISOString()
    return json({ code: 200, result: true, message: 'ok', data: {
      accessToken: 'tok', accessTokenExpiryDate: in30d, refreshToken: 'ref', refreshTokenExpiryDate: in30d,
    } })
  }
  if (url.includes('/product/list')) {
    httpListCalls++
    if (force429 > 0) { force429--; return json({ code: 429, result: false, message: 'Too Many Requests', data: null }) }
    const q = new URL(url).searchParams
    const term = q.get('productNameEn') ?? 'item'
    const cc = q.get('countryCode') ?? 'CN'
    // Elke pass levert producten die het woordfilter halen (titel bevat de term).
    const list = Array.from({ length: 8 }, (_, i) => ({
      pid: `${term.replace(/\s+/g, '-')}-${cc}-${i}`,
      productNameEn: `${term} model ${i + 1}`,
      sellPrice: 5 + i,
      countryCode: cc,
    }))
    return json({ code: 200, result: true, message: 'ok', data: { pageNum: 1, pageSize: 20, total: 200, list } })
  }
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

const { CJAdapter, getCjSearchStats, resetCjSearchStats, currentRequestSpacingMs } =
  await import('../src/server/suppliers/cj-adapter.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

// 12 producttypes, zoals een assortiment voor "baard verzorging" ze oplevert
const TERMS = [
  'beard oil', 'beard balm', 'beard trimmer', 'beard comb', 'beard brush', 'beard shampoo',
  'beard scissors', 'beard growth serum', 'beard gift set', 'beard storage bag', 'beard roller', 'beard dye',
]

const adapter = new CJAdapter()

async function measure(label: string, envWarehouses: string | undefined, options: Record<string, number>) {
  if (envWarehouses) process.env.CJ_SEARCH_WAREHOUSES = envWarehouses
  else delete process.env.CJ_SEARCH_WAREHOUSES
  resetCjSearchStats()
  httpListCalls = 0
  const t0 = Date.now()
  let products = 0
  for (const term of TERMS) products += (await adapter.searchProducts(term, options)).length
  const stats = getCjSearchStats()
  say(`  ${label}`)
  say(`    warehouse-passes : ${envWarehouses ?? 'DE,FR,PL (default)'} + globale pass`)
  say(`    opties           : ${JSON.stringify(options)}`)
  say(`    /product/list    : ${stats.listCalls} calls (HTTP geteld: ${httpListCalls})`)
  say(`    per zoekterm     : ${(stats.listCalls / TERMS.length).toFixed(1)}`)
  say(`    producten        : ${products}`)
  say(`    wachttijd op productie: ${((stats.listCalls * REQUEST_SPACING_PROD_MS) / 1000).toFixed(1)}s (${Date.now() - t0}ms in deze test, spacing 0)`)
  return { calls: stats.listCalls, products }
}

say('═══ CJ-ZOEKOPDRACHTEN VOOR ÉÉN ASSORTIMENT (12 producttypes) ═══')
say('')
const oud = await measure('VOOR — alle EU-warehouses, alles ophalen', 'DE,NL,FR,IT,ES,PL,CZ', { maxResults: 30 })
say('')
const nieuw = await measure('NA — representatieve warehouses, genoeg-is-genoeg', undefined, { maxResults: 4, minResults: 2 })

say('')
say('═══ RESULTAAT ═══')
check('minder calls dan voorheen', nieuw.calls < oud.calls,
  `${oud.calls} → ${nieuw.calls} calls (${Math.round((1 - nieuw.calls / oud.calls) * 100)}% minder)`)
check('één call per producttype in het gunstige geval', nieuw.calls <= TERMS.length,
  `${nieuw.calls} calls voor ${TERMS.length} types`)
check('tijdwinst op productie', (oud.calls - nieuw.calls) * REQUEST_SPACING_PROD_MS > 30_000,
  `${(((oud.calls - nieuw.calls) * REQUEST_SPACING_PROD_MS) / 1000).toFixed(0)}s per assortiment`)
check('er komen nog steeds producten terug', nieuw.products >= TERMS.length,
  `${nieuw.products} producten over ${TERMS.length} zoektermen`)

// ── Cache ─────────────────────────────────────────────────────────────────────
say('')
say('═══ CACHE: DEZELFDE ZOEKTERM KOST GEEN TWEEDE CALL ═══')
resetCjSearchStats()
await adapter.searchProducts('beard oil', { maxResults: 4, minResults: 2 })
const na = getCjSearchStats()
check('herhaalde zoekopdracht raakt CJ niet', na.listCalls === 0 && na.cacheHits === 1,
  `${na.listCalls} calls, ${na.cacheHits} cache-treffer(s)`)

// ── Adaptieve spacing ─────────────────────────────────────────────────────────
say('')
say('═══ ADAPTIEVE SPACING NA EEN 429 ═══')
const voorSpacing = currentRequestSpacingMs()
force429 = 1
await adapter.searchProducts('beard wax', { maxResults: 4, minResults: 2 })
const naSpacing = currentRequestSpacingMs()
check('tussenruimte gaat omhoog na een rate limit', naSpacing > voorSpacing,
  `${voorSpacing}ms → ${naSpacing}ms (herstelt vanzelf na 60s zonder 429)`)

say('')
say(`═══ TOTAAL: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say('LET OP: dit meet onze eigen call-boekhouding tegen een onderschepte fetch —')
say('er is geen verkeer naar CJ gegaan. Wat bewezen is: hetzelfde aantal')
say('producttypes kost aantoonbaar minder calls, en de teller telt echte HTTP-calls.')

fs.writeFileSync(process.env.LOGFILE ?? 'search-efficiency.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
