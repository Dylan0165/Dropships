// Verificatie — visuele kwaliteit: hero-beeld, componentbreedte, copy.
//
// Draait de echte renderer. Voor het gegenereerde sfeerbeeld wordt een lokale
// beeldprovider nagebootst (OPENAI_BASE_URL), zodat ook het pad mét key
// aantoonbaar werkt zonder een echte OpenAI-key.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'

const TMP = path.join(os.tmpdir(), 'dropship-quality')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'q.db')
process.env.STORES_WORKSPACE = path.join(TMP, 'stores')

// ── Nagebootste beeldprovider ─────────────────────────────────────────────────
// 1×1 webp-achtig bestand; het gaat om het pad, niet om de pixels.
const FAKE_IMG = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64')
let imageCalls = 0
let providerMode: 'ok' | 'fail' = 'ok'
const provider = http.createServer((req, res) => {
  if (req.url?.includes('/images/generations')) {
    imageCalls++
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      if (providerMode === 'fail') { res.writeHead(500); res.end('nope'); return }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ url: `http://127.0.0.1:4988/hero.webp` }] }))
    })
    return
  }
  if (req.url === '/hero.webp') { res.writeHead(200, { 'Content-Type': 'image/webp' }); res.end(FAKE_IMG); return }
  res.writeHead(404); res.end()
})
await new Promise<void>(r => provider.listen(4988, () => r()))

import type { StoreBrief } from '../src/server/pipeline/store-builder.js'
const { renderStore } = await import('../src/server/pipeline/store-builder.js')
const { resolveHeroVisual } = await import('../src/server/design/hero-visual.js')
const { deriveDesignDNA } = await import('../src/server/design/tokens.js')
const { catalogStats } = await import('../src/server/design/components/registry.js')
const { generateCtaBand, generateStory } = await import('../src/server/design/content-en.js')

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const brief = (name: string): StoreBrief => ({
  brand_name: name,
  slogan: 'Made for the way you actually use it',
  hero_headline: 'The upgrade you keep meaning to make',
  hero_subheadline: 'Chosen carefully, shipped from Europe.',
  hero_cta: 'Shop the collection',
  usps: [
    { title: 'Checked before listing', desc: 'We order and test everything ourselves first.' },
    { title: 'European stock', desc: 'Days, not weeks — with tracking from the start.' },
    { title: 'Honest answers', desc: 'A real reply within one working day.' },
  ],
  story_angle: 'We got tired of waiting six weeks for things that arrived wrong.',
  footer_tagline: 'A focused collection, delivered fast across Europe.',
} as unknown as StoreBrief)

function products(n: number, tag: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tag}-${i}`, title: `${tag} item ${i + 1}`, productType: `${tag} type ${i + 1}`,
    price: 19.95 + i * 5, image: `/img/pack-${i + 1}.svg`, description: 'Short honest description.',
    supplier: 'cj', supplierProductId: `pid-${tag}-${i}`, supplierVariantId: `vid-${tag}-${i}`,
  }))
}

function build(runId: string, name: string, niche: string, opts: { heroImage?: string | null; count?: number } = {}) {
  const logs: string[] = []
  const res = renderStore({
    runId, niche, brand: { name, tone: 'confident' },
    products: products(opts.count ?? 8, name.toLowerCase()),
    persona: { label: `${niche} buyer`, interests: [niche.split(' ')[0]], priceRange: { min: 20, max: 60 }, ageRange: '25-45' },
    heroImage: opts.heroImage ?? null,
    onLog: (m: string) => logs.push(m),
  } as never, brief(name))
  const page = fs.readFileSync(path.join(res.buildDir, 'app', 'page.tsx'), 'utf-8')
  const dna = JSON.parse(fs.readFileSync(path.join(res.buildDir, 'design-dna.json'), 'utf-8'))
  const visual = JSON.parse(page.match(/const HERO_VISUAL: any = (\{[\s\S]*?\});/)?.[1] ?? '{}')
  return { res, page, dna, logs, visual }
}

// ═══ 1. GEEN BEELDPROVIDER → PRODUCTFOTO OP SFEERLAAG ═══
say('═══ 1. ZONDER BEELDPROVIDER — PRODUCTFOTO WORDT GEPRESENTEERD, NIET UITGESNEDEN ═══')
const a = build('q-staged', 'Trailform', 'portable gym equipment')
say(`  hero-visual: ${JSON.stringify({ kind: a.visual.kind, fill: a.visual.fill, source: a.visual.source })}`)
check('soort beeld is "staged"', a.visual.kind === 'staged', `kind=${a.visual.kind}`)
check('wordt NIET bijgesneden', a.visual.fill === false, 'objectFit contain i.p.v. cover')
check('sfeerlaag uit het design-DNA', /gradient/.test(a.visual.backdrop ?? ''), (a.visual.backdrop ?? '').slice(0, 60) + '…')
check('donkere variant voor full-bleed hero\'s', /gradient/.test(a.visual.backdropDark ?? ''), 'backdropDark aanwezig')
check('geen hero die rechtstreeks de productfoto uitsnijdt',
  !/src=\{PRODUCTS\[0\]\.image\}/.test(a.page), 'PRODUCTS[0].image staat niet meer in de hero-JSX')
check('de productfoto is wél het getoonde beeld', a.visual.src === '/img/pack-1.svg', a.visual.src)
check('gedeeld component voor beide gevallen', /function HeroImg\(/.test(a.page), 'HeroImg in de pagina')

// ═══ 2. MET BEELDPROVIDER → ECHT SFEERBEELD ═══
say('')
say('═══ 2. MÉT BEELDPROVIDER — GEGENEREERD SFEERBEELD ═══')
process.env.OPENAI_API_KEY = 'test-key'
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:4988'
process.env.IMAGE_PROVIDER = 'openai'
const { generateHeroImage, hasImageProvider } = await import('../src/server/image-gen.js')
check('provider wordt herkend', hasImageProvider() === true, 'hasImageProvider()')
const heroFile = await generateHeroImage({ storeId: 'q-life', niche: 'portable gym equipment', brandName: 'Trailform' })
check('sfeerbeeld gegenereerd', !!heroFile && fs.existsSync(heroFile), heroFile ?? 'niets')
check('één provider-call, niet meer', imageCalls === 1, `${imageCalls} call(s)`)

const b = build('q-life', 'Nightwell', 'sleep and wellness aids', { heroImage: heroFile })
say(`  hero-visual: ${JSON.stringify({ kind: b.visual.kind, fill: b.visual.fill, src: b.visual.src, source: b.visual.source })}`)
check('soort beeld is "lifestyle"', b.visual.kind === 'lifestyle', `kind=${b.visual.kind}`)
check('mag wél bijgesneden worden', b.visual.fill === true, 'cover — daar is een sfeerfoto voor')
check('beeld staat IN de store, niet op een verlopende provider-url',
  b.visual.src.startsWith('/img/hero'), b.visual.src)
check('bestand is echt meegekopieerd', fs.existsSync(path.join(b.res.buildDir, 'public', 'img', path.basename(b.visual.src))),
  `public${b.visual.src}`)

// ═══ 3. PROVIDER FAALT → GEEN LEGE HERO ═══
say('')
say('═══ 3. PROVIDER FAALT — TERUGVAL, NOOIT EEN LEGE HERO ═══')
providerMode = 'fail'
const failed = await generateHeroImage({ storeId: 'q-fail', niche: 'x', brandName: 'y', timeoutMs: 4000 })
check('geen exception, gewoon null', failed === null, `${failed}`)
const c = build('q-fail', 'Petloop', 'dog walking accessories', { heroImage: failed })
check('winkel wordt gewoon gebouwd', c.res.ok === true, `ok=${c.res.ok}`)
check('terugval op de sfeerlaag', c.visual.kind === 'staged', `kind=${c.visual.kind}`)

say('')
say('  zonder ENKELE productfoto:')
const noImg = resolveHeroVisual({ dna: deriveDesignDNA({ persona: { label: 'x' }, niche: 'x', seed: 'x' }), products: [{}] })
check('nog steeds geen gebroken beeld', noImg.src === '' && !!noImg.backdrop, `src="${noImg.src}", sfeerlaag aanwezig`)

// ═══ 4. COMPONENTBREEDTE ═══
say('')
say('═══ 4. COMPONENTBREEDTE OVER OPEENVOLGENDE WINKELS ═══')
const stats = catalogStats()
const seen = new Set<string>()
const perStore: string[][] = []
const NICHES = ['home coffee brewing', 'indoor plant care', 'commuter cycling', 'desk accessories', 'kids craft supplies', 'camping gear']
for (let i = 0; i < NICHES.length; i++) {
  const r = build(`q-breadth-${i}`, `Breadth${i}`, NICHES[i])
  const used = (r.dna.components?.used ?? []).map((u: string) => u.replace(/\[.*\]$/, ''))
  perStore.push(used)
  used.forEach((u: string) => seen.add(u))
}
say(`  ${NICHES.length} winkels → ${seen.size} unieke componenten van ${stats.total}`)
perStore.forEach((u, i) => say(`    ${NICHES[i].padEnd(22)} ${u.length} componenten`))
const gemiddeld = perStore.reduce((a, u) => a + u.length, 0) / perStore.length
check('elke winkel gebruikt 8+ componenten', perStore.every(u => u.length >= 8), `gemiddeld ${gemiddeld.toFixed(1)}`)
check('geen twee winkels met dezelfde nav', new Set(perStore.map(u => u.find(x => x.startsWith('nav.')))).size === perStore.length,
  perStore.map(u => u.find(x => x.startsWith('nav.'))).join(' · '))
check('geen twee winkels met dezelfde footer', new Set(perStore.map(u => u.find(x => x.startsWith('footer.')))).size === perStore.length,
  perStore.map(u => u.find(x => x.startsWith('footer.'))).join(' · '))
check('de zes winkels raken minstens 35 componenten', seen.size >= 35, `${seen.size} van ${stats.total}`)

// ═══ 5. COPY ═══
say('')
say('═══ 5. COPY — CONCREET IN PLAATS VAN GENERIEK ═══')
const bands = new Set<string>()
const stories = new Set<string>()
for (let i = 0; i < 40; i++) {
  bands.add(generateCtaBand(i * 7919).title)
  stories.add(generateStory({ brandName: 'Probe', niche: 'x', tone: 'minimal', seed: i * 104729 }).body)
}
say(`  cta-banden: ${bands.size} verschillende koppen over 40 seeds`)
check('meer variatie in cta-banden', bands.size >= 6, [...bands].slice(0, 3).join(' | '))
check('geen verzonnen klantaantallen meer', ![...bands].some(b => /thousands|customers/i.test(b)),
  'geen "join thousands of happy customers"')
check('brand-story varieert', stories.size >= 12, `${stories.size} verschillende verhalen over 40 seeds`)
const generiek = ['quality products', 'best price', 'wide range', 'one-stop']
const alleCopy = [...bands, ...stories].join(' ').toLowerCase()
check('geen generieke vulzinnen', !generiek.some(g => alleCopy.includes(g)), generiek.join(', '))

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
provider.close()
fs.writeFileSync(process.env.LOGFILE ?? 'store-quality.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
