// Verificatie — een te klein assortiment mag de run niet omleggen.
//
// Draait de ECHTE `buildStore` (pipeline/store-builder.ts → agent.ts) tegen een
// lokaal nagebootst LLM-endpoint. Zo is elk faalpad reproduceerbaar zonder een
// geldige DeepSeek-key: prose in plaats van JSON, alleen redenering terug, of
// gewoon een goede brief.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'

const TMP = path.join(os.tmpdir(), 'dropship-smallassortment')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'test.db')
process.env.STORES_WORKSPACE = path.join(TMP, 'stores')
process.env.LLM_API_KEY = 'test-key'
process.env.LLM_MODEL_STORE = 'deepseek-reasoner'

// ── Nagebootst LLM-endpoint ───────────────────────────────────────────────────
type Mode = 'prose' | 'reasoning-only' | 'valid'
let mode: Mode = 'valid'
const requests: Array<{ body: string }> = []

function validBrief(brand: string) {
  return JSON.stringify({
    brand_name: brand,
    slogan: 'Two things we actually stand behind',
    hero_headline: 'The beard routine, stripped back to what works',
    hero_subheadline: 'Two products, chosen after testing a lot of bad ones.',
    hero_cta: 'View the product',
    colors: { primary: '#1c1917', secondary: '#faf9f7', accent: '#b45309' },
    usps: [
      { title: 'Tested first', desc: 'We order and use everything before listing it.' },
      { title: 'European stock', desc: 'Days, not weeks, with tracking from the start.' },
      { title: 'Honest answers', desc: 'A real reply within one working day.' },
    ],
    footer_tagline: 'A short, honest range shipped across Europe.',
    story_angle: 'Most beard shops sell a shelf of near-identical oils.',
  })
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    requests.push({ body })
    const brand = 'Bristlework'
    const message = mode === 'valid'
      ? { role: 'assistant', content: validBrief(brand) }
      : mode === 'reasoning-only'
        ? { role: 'assistant', content: '', reasoning_content: 'Laat me nadenken over de merknaam. De niche is smal, er zijn maar twee producten, dus ik moet een ' + 'compacte layout kiezen. '.repeat(40) }
        : { role: 'assistant', content: 'Hier is mijn voorstel voor de winkel: ik zou beginnen met een rustige hero en daaronder de twee producten tonen.' }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 12000, completion_tokens: 7980 } }))
  })
})
await new Promise<void>(r => server.listen(4977, () => r()))
process.env.LLM_BASE_URL = 'http://127.0.0.1:4977'

const { buildStore, collectionContext, fallbackBrief } = await import('../src/server/pipeline/store-builder.js')
const { default: db } = await import('../src/server/db.js')

// De agent logt elke uitvoering tegen een run-rij; zonder die rijen valt de
// foreign key en vult de output zich met ruis die niets met deze test te maken heeft.
const nu = new Date().toISOString()
for (const id of ['verify-small-prose', 'verify-small-reasoning', 'verify-small-valid', 'verify-small-zes']) {
  db.prepare('INSERT OR IGNORE INTO runs (run_id, niche, status, started_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, 'verificatie', 'running', nu, nu)
}

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

// Het echte scenario van de bugmelding: een smalle niche die na 24 doorzochte
// producttypes terecht maar 2 relevante producten opleverde.
const NICHE = 'baard groei stimuleren en verzorging voor bestaande baard + minoxidil'
const TWEE = [
  { id: 'cj-minox-1', title: 'Minoxidil Beard Growth Roller 0.5mm', productType: 'beard roller', price: 24.95, image: 'https://example.invalid/a.jpg', description: 'Derma roller for beard growth routines.', supplier: 'cj', supplierProductId: 'p1', supplierVariantId: 'v1' },
  { id: 'cj-oil-1', title: 'Beard Growth Oil 30ml Biotin', productType: 'beard oil', price: 27.95, image: 'https://example.invalid/b.jpg', description: 'Daily conditioning oil with biotin.', supplier: 'cj', supplierProductId: 'p2', supplierVariantId: 'v2' },
]
const BRAND = {
  name: 'Bristlework', slogan: 'Grow it properly', tone: 'nuchter',
  colors: { primary: '#1c1917', secondary: '#faf9f7', accent: '#b45309' },
  usps: [
    { title: 'Tested first', desc: 'We use everything ourselves before listing it.' },
    { title: 'European stock', desc: 'Days, not weeks, with tracking.' },
    { title: 'Honest answers', desc: 'A real reply within one working day.' },
  ],
}

function makeInput(runId: string, products: typeof TWEE) {
  const logs: string[] = []
  return {
    input: {
      runId, niche: NICHE, brand: BRAND, products,
      persona: { label: 'Man die z\'n baard vol wil krijgen', interests: ['grooming'], priceRange: { min: 20, max: 60 }, ageRange: '25-40' },
      onLog: (m: string) => logs.push(m),
    },
    logs,
  }
}

// ═══ 1. COLLECTIE-CONTEXT ═══
say('═══ 1. DE BRIEF WEET NU HOE GROOT DE COLLECTIE IS ═══')
const ctx2 = collectionContext(TWEE)
const ctx12 = collectionContext(Array.from({ length: 12 }, (_, i) => ({ ...TWEE[0], id: `p${i}`, productType: `type ${i}` })))
say(`  2 producten  → ${String(ctx2.guidance).slice(0, 150)}…`)
say(`  12 producten → ${String(ctx12.guidance).slice(0, 110)}…`)
check('collectie-grootte staat in de prompt', ctx2.product_count === 2, `product_count=${ctx2.product_count}`)
check('kleine collectie krijgt eigen instructie', /only 2 product/i.test(String(ctx2.guidance)), 'expliciet "only 2 product(s)"')
check('geen catalogus-layout bij 2 producten', /Do NOT pick a catalog/i.test(String(ctx2.guidance)), 'staat er letterlijk')
check('grote collectie krijgt catalogus-instructie', /catalog-style/i.test(String(ctx12.guidance)), 'catalog-style layout')

// ═══ 2. LLM GEEFT PROZA I.P.V. JSON ═══
say('')
say('═══ 2. STORE-BUILDER AGENT FAALT (proza i.p.v. JSON), 2 PRODUCTEN ═══')
mode = 'prose'
requests.length = 0
const t0 = Date.now()
const a = makeInput('verify-small-prose', TWEE)
const rProse = await buildStore(a.input as never)
const duurA = ((Date.now() - t0) / 1000).toFixed(1)
for (const l of a.logs.filter(l => /⚠|terugval|Brief|poging/.test(l))) say(`  ${l.slice(0, 160)}`)

check('de run gaat NIET onderuit', rProse.ok === true, `ok=${rProse.ok} (was: ok=false, "brief generation failed")`)
check('brief komt uit het vangnet', rProse.briefSource === 'fallback', `briefSource=${rProse.briefSource}`)
check('de ECHTE reden is bewaard', !!rProse.briefError && !/^brief generation failed$/.test(rProse.briefError),
  `"${(rProse.briefError ?? '').slice(0, 110)}"`)
check('de reden is diagnosticeerbaar', /geen parseerbare JSON|output-tokens/.test(rProse.briefError ?? ''),
  'noemt wat er terugkwam en hoeveel tokens')
const pageProse = fs.readFileSync(path.join(rProse.buildDir, 'app', 'page.tsx'), 'utf-8')
check('beide producten staan in de winkel', TWEE.every(p => pageProse.includes(p.title)), '2/2 producttitels')
const dnaProse = JSON.parse(fs.readFileSync(path.join(rProse.buildDir, 'design-dna.json'), 'utf-8'))
check('renderer blijft de componentcatalogus', dnaProse.components?.renderer === 'component-catalog',
  `renderer=${dnaProse.components?.renderer}`)
const prodComp = (dnaProse.components?.used ?? []).find((u: string) => u.startsWith('products.'))
check('een weergave die bij 2 producten past', !['products.grid-4', 'products.masonry', 'products.category-tabs'].some(id => prodComp?.startsWith(id)),
  `gekozen: ${prodComp}`)
say(`  duur: ${duurA}s (3 pogingen + backoff), daarna gewoon een winkel`)

// ═══ 3. VERKORTE INVOER OP DE RETRY ═══
say('')
say('═══ 3. RETRY MET VERKORTE INVOER ═══')
check('drie pogingen gedaan', requests.length === 3, `${requests.length} calls naar het LLM-endpoint`)
const heeftCatalogus = requests.map(r => r.body.includes('component_catalog'))
say(`  component_catalog per poging: ${heeftCatalogus.map((b, i) => `${i + 1}=${b ? 'ja' : 'nee'}`).join(' · ')}`)
check('poging 1 heeft de volledige catalogus', heeftCatalogus[0] === true, 'component_catalog aanwezig')
check('poging 2 en 3 niet meer', heeftCatalogus.slice(1).every(b => b === false),
  'minder invoer = ruimte voor het antwoord')
const size1 = requests[0].body.length, size2 = requests[1].body.length
check('de prompt is aantoonbaar kleiner', size2 < size1 * 0.6,
  `${Math.round(size1 / 1000)}k → ${Math.round(size2 / 1000)}k tekens`)

// ═══ 4. ALLEEN REDENERING TERUG ═══
say('')
say('═══ 4. MODEL GEEFT ALLEEN REDENERING TERUG (max_tokens op) ═══')
mode = 'reasoning-only'
const b = makeInput('verify-small-reasoning', TWEE)
const rReason = await buildStore(b.input as never)
check('ook hier geen crash', rReason.ok === true, `ok=${rReason.ok}, briefSource=${rReason.briefSource}`)
check('de melding wijst naar de oorzaak', /alleen redenering/.test(rReason.briefError ?? ''),
  `"${(rReason.briefError ?? '').slice(0, 130)}"`)

// ═══ 5. NORMALE WEG BLIJFT NORMAAL ═══
say('')
say('═══ 5. GOEDE BRIEF → GEEN VANGNET ═══')
mode = 'valid'
const c = makeInput('verify-small-valid', TWEE)
const rOk = await buildStore(c.input as never)
check('brief van de agent gebruikt', rOk.briefSource === 'llm', `briefSource=${rOk.briefSource}`)
check('geen foutmelding', !rOk.briefError, rOk.briefError ?? 'geen')
check('merknaam uit de brief', rOk.brandName === 'Bristlework', rOk.brandName)
const pageOk = fs.readFileSync(path.join(rOk.buildDir, 'app', 'page.tsx'), 'utf-8')
check('beide producten zichtbaar', TWEE.every(p => pageOk.includes(p.title)), '2/2')

// ═══ 6. 6 PRODUCTEN ═══
say('')
say('═══ 6. ZES PRODUCTEN (bovenkant van "klein") ═══')
const ZES = Array.from({ length: 6 }, (_, i) => ({
  ...TWEE[i % 2], id: `cj-zes-${i}`, title: `Beard care item ${i + 1}`, productType: `beard type ${i + 1}`,
  supplierProductId: `p-zes-${i}`, supplierVariantId: `v-zes-${i}`,
}))
const d = makeInput('verify-small-zes', ZES)
const rZes = await buildStore(d.input as never)
check('build slaagt', rZes.ok === true, `ok=${rZes.ok}`)
const pageZes = fs.readFileSync(path.join(rZes.buildDir, 'app', 'page.tsx'), 'utf-8')
check('alle 6 producten zichtbaar', ZES.every(p => pageZes.includes(p.title)), '6/6 titels')
const dnaZes = JSON.parse(fs.readFileSync(path.join(rZes.buildDir, 'design-dna.json'), 'utf-8'))
check('renderer blijft de componentcatalogus', dnaZes.components?.renderer === 'component-catalog',
  `renderer=${dnaZes.components?.renderer}`)

// ═══ 7. HET VANGNET IS EEN GELDIGE BRIEF ═══
say('')
say('═══ 7. DE SAMENGESTELDE BRIEF ZELF ═══')
const fb = fallbackBrief(makeInput('x', TWEE).input as never)
say(`  brand="${fb.brand_name}" · hero="${fb.hero_headline}" · cta="${fb.hero_cta}"`)
check('gebruikt de USP\'s uit de brand-stage', fb.usps[0].title === BRAND.usps[0].title, fb.usps.map(u => u.title).join(' · '))
check('geen design/components → seeded DNA neemt het over',
  !(fb as Record<string, unknown>).design && !(fb as Record<string, unknown>).components, 'beide afwezig')
check('verzint geen producten', !JSON.stringify(fb).includes('product_'), 'geen productclaims in de copy')

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say(`build-dir van scenario 2 (vangnet, 2 producten):\n  ${rProse.buildDir}`)

server.close()
fs.writeFileSync(process.env.LOGFILE ?? 'small-assortment.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
