// Audit: bouwt teststores met de ECHTE pipeline-renderer en meet objectief
// waar de visuele kwaliteit vandaan komt. Geen aannames — alles wat hier staat
// komt uit de gegenereerde `app/page.tsx` en `design-dna.json`.
//
// Productfoto's zijn lokale SVG-pakshots op wit: dat is wat CJ in de praktijk
// levert. Precies dáár gaat het mis als zo'n foto full-bleed in een hero wordt
// uitgesneden — met een toevallige lifestyle-foto (zoals sculpt-fade die had)
// valt het niet op.
import fs from 'node:fs'
import path from 'node:path'
import { renderStore, type StoreBrief } from '../src/server/pipeline/store-builder.js'
import { allComponents, catalogStats } from '../src/server/design/components/registry.js'
import { buildSelection } from '../src/server/design/components/selection.js'
import { deriveDesignDNA } from '../src/server/design/tokens.js'
import { selectLayout } from '../src/server/design/layout.js'

const OUT = process.env.AUDIT_OUT ?? path.join(process.cwd(), 'audit')
const LABEL = process.env.AUDIT_LABEL ?? 'baseline'

export interface StoreMetrics {
  brand: string
  niche: string
  dir: string
  tone: string
  fonts: string
  palette: string
  heroComponent: string
  heroVisual: string
  heroUsesProductPhoto: boolean
  heroImageEqualsGridImage: boolean
  productComponent: string
  components: string[]
  componentCount: number
  copy: { headline: string; sub: string; cta: string; story: string; ctaBand: string; reviews: string[] }
  genericHits: string[]
}

// ── Pakshot zoals een leverancier hem levert: wit, gecentreerd, veel lucht ─────
function packShotSvg(seed: number, label: string): string {
  const hue = (seed * 47) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <rect width="800" height="800" fill="#ffffff"/>
  <ellipse cx="400" cy="640" rx="150" ry="22" fill="#000" opacity="0.07"/>
  <rect x="310" y="230" width="180" height="380" rx="26" fill="hsl(${hue} 45% 52%)"/>
  <rect x="345" y="150" width="110" height="90" rx="12" fill="hsl(${hue} 35% 34%)"/>
  <rect x="330" y="360" width="140" height="120" rx="8" fill="#ffffff" opacity="0.92"/>
  <text x="400" y="428" font-family="Helvetica,Arial" font-size="26" font-weight="700" text-anchor="middle" fill="hsl(${hue} 45% 40%)">${label}</text>
  <text x="400" y="700" font-family="Helvetica,Arial" font-size="18" text-anchor="middle" fill="#9ca3af">800 × 800 · pack shot</text>
</svg>`
}

export const NICHES = [
  { key: 'trailform', brand: 'Trailform', niche: 'portable gym equipment', interests: ['fitness', 'training'], price: { min: 25, max: 70 }, types: ['resistance band', 'jump rope', 'ab roller', 'grip trainer', 'yoga mat', 'foam roller', 'kettlebell', 'door bar'] },
  { key: 'mealkind', brand: 'Mealkind', niche: 'kitchen prep tools', interests: ['cooking', 'kitchen'], price: { min: 15, max: 45 }, types: ['vegetable chopper', 'garlic press', 'herb scissors', 'mandoline slicer', 'salad spinner', 'measuring set', 'peeler set'] },
  { key: 'nightwell', brand: 'Nightwell', niche: 'sleep and wellness aids', interests: ['wellness', 'sleep'], price: { min: 30, max: 95 }, types: ['sleep mask', 'white noise machine', 'weighted blanket', 'aroma diffuser', 'sunrise alarm', 'pillow spray'] },
  { key: 'petloop', brand: 'Petloop', niche: 'dog walking accessories', interests: ['dogs', 'outdoors'], price: { min: 12, max: 55 }, types: ['dog leash', 'harness', 'treat pouch', 'poop bag holder', 'collapsible bowl', 'reflective collar', 'paw cleaner'] },
  { key: 'deskline', brand: 'Deskline', niche: 'desk setup accessories', interests: ['tech', 'workspace'], price: { min: 18, max: 80 }, types: ['monitor stand', 'cable organiser', 'laptop riser', 'desk mat', 'usb hub', 'headphone stand', 'wrist rest'] },
]

export const NEW_NICHES = [
  { key: 'brewhand', brand: 'Brewhand', niche: 'home coffee brewing gear', interests: ['coffee', 'mornings'], price: { min: 20, max: 90 }, types: ['pour over kettle', 'hand grinder', 'coffee scale', 'dripper', 'milk frother', 'storage canister', 'tamper'] },
  { key: 'rootside', brand: 'Rootside', niche: 'indoor plant care', interests: ['plants', 'home'], price: { min: 14, max: 60 }, types: ['watering can', 'moisture meter', 'grow light', 'pruning shears', 'plant mister', 'repotting mat', 'plant stand'] },
  { key: 'sidestreet', brand: 'Sidestreet', niche: 'commuter cycling gear', interests: ['cycling', 'city'], price: { min: 16, max: 75 }, types: ['bike light', 'phone mount', 'saddle bag', 'mini pump', 'chain lock', 'bell', 'mudguard'] },
]

const GENERIC_PHRASES = [
  'quality products', 'best price', 'high quality', 'top quality', 'great products',
  'wide range', 'for everyone', 'the best', 'amazing', 'unbeatable', 'premium quality',
  'your one-stop', 'shop now for', 'we offer', 'customer satisfaction', 'wide selection',
]

function brief(brand: string, niche: string): StoreBrief {
  return {
    brand_name: brand,
    slogan: 'Made for the way you actually use it',
    hero_headline: `The ${niche} upgrade you keep meaning to make`,
    hero_subheadline: 'Chosen carefully, shipped from Europe, returnable for 30 days.',
    hero_cta: 'Shop the collection',
    usps: [
      { title: 'Checked before listing', desc: 'We order and test everything ourselves first.' },
      { title: 'European stock', desc: 'Days, not weeks — with tracking from the start.' },
      { title: 'Honest answers', desc: 'A real reply within one working day.' },
    ],
    story_angle: 'We got tired of waiting six weeks for things that arrived wrong.',
    footer_tagline: 'A focused collection, delivered fast across Europe.',
  } as unknown as StoreBrief
}

export function auditStore(spec: typeof NICHES[number], index: number): StoreMetrics {
  const runId = `audit-${LABEL}-${spec.key}`
  const products = spec.types.map((t, i) => ({
    id: `${spec.key}-${i + 1}`,
    title: `${t} — ${spec.brand} edition`,
    productType: t,
    price: 14.95 + i * 6,
    image: `/img/pack-${i + 1}.svg`,
    description: `A ${t} we picked after trying the cheap ones.`,
    supplier: 'cj', supplierProductId: `pid-${spec.key}-${i}`, supplierVariantId: `vid-${spec.key}-${i}`,
  }))

  const logs: string[] = []
  const res = renderStore({
    runId, niche: spec.niche,
    brand: { name: spec.brand, tone: 'confident' },
    products,
    persona: { label: `${spec.niche} buyer`, interests: spec.interests, priceRange: spec.price, ageRange: '25-45' },
    onLog: (m: string) => logs.push(m),
  } as never, brief(spec.brand, spec.niche))

  // Pakshots erbij zetten zodat de gebouwde store echte afbeeldingen toont
  const imgDir = path.join(res.buildDir, 'public', 'img')
  fs.mkdirSync(imgDir, { recursive: true })
  products.forEach((p, i) => {
    fs.writeFileSync(path.join(imgDir, `pack-${i + 1}.svg`), packShotSvg(index * 13 + i, p.productType.split(' ')[0]), 'utf-8')
  })

  const page = fs.readFileSync(path.join(res.buildDir, 'app', 'page.tsx'), 'utf-8')
  const dna = JSON.parse(fs.readFileSync(path.join(res.buildDir, 'design-dna.json'), 'utf-8'))
  const used: string[] = (dna.components?.used ?? []).map((u: string) => u.replace(/\[.*\]$/, ''))

  const heroComponent = used.find(u => u.startsWith('hero.')) ?? 'geen'
  const productComponent = used.find(u => u.startsWith('products.')) ?? 'geen'
  // Waar haalt de hero z'n beeld vandaan? PRODUCTS[0].image = de kale pakshot.
  const heroUsesProductPhoto = /PRODUCTS\[0\]\s*&&\s*PRODUCTS\[0\]\.image/.test(page) || /src=\{PRODUCTS\[0\]\.image\}/.test(page)
  const heroVisualMatch = page.match(/const HERO_VISUAL: any = (\{[\s\S]*?\});/)
  const heroVisual = heroVisualMatch ? (JSON.parse(heroVisualMatch[1]).kind ?? 'onbekend') : 'geen (kale productfoto)'

  const copyBlob = `${dna.contentSample ?? ''}`
  const story = page.match(/<h2[^>]*>([^<]{6,80})<\/h2>/)?.[1] ?? ''
  const reviews = [...page.matchAll(/text:\s*"([^"]{20,120})"/g)].map(m => m[1]).slice(0, 3)
  const allCopy = (page.match(/>[^<>{}]{12,180}</g) ?? []).join(' ').toLowerCase() + copyBlob.toLowerCase()
  const genericHits = GENERIC_PHRASES.filter(p => allCopy.includes(p))

  return {
    brand: spec.brand, niche: spec.niche, dir: res.buildDir,
    tone: dna.tone, fonts: `${dna.typography?.heading} / ${dna.typography?.body}`,
    palette: `${dna.palette?.bg} · ${dna.palette?.primary} · ${dna.palette?.accent}`,
    heroComponent, heroVisual, heroUsesProductPhoto,
    heroImageEqualsGridImage: heroUsesProductPhoto,
    productComponent,
    components: used, componentCount: used.length,
    copy: {
      headline: brief(spec.brand, spec.niche).hero_headline,
      sub: brief(spec.brand, spec.niche).hero_subheadline,
      cta: brief(spec.brand, spec.niche).hero_cta,
      story, ctaBand: '', reviews,
    },
    genericHits,
  }
}

/**
 * Hoeveel van de catalogus bereikt de afgeleide selectie in de praktijk?
 * Geen code-analyse maar een echte steekproef: 24 winkels met verschillende
 * persona's en seeds, en tellen hoeveel unieke componenten daar samen uit komen.
 */
export function derivedReach(): { reachable: string[]; total: number } {
  const seen = new Set<string>()
  const tones = ['fitness gear', 'coffee brewing', 'kids toys', 'smart home tech', 'skincare', 'office desk setup']
  for (let i = 0; i < 24; i++) {
    const niche = tones[i % tones.length]
    const dna = deriveDesignDNA({
      persona: { label: `${niche} buyer`, interests: [niche.split(' ')[0]], ageRange: i % 2 ? '20-30' : '35-55', priceRange: { min: 10 + i, max: 30 + i * 4 } },
      niche, seed: `reach-probe-${i}`,
    })
    const layout = selectLayout({ tone: dna.tone, seed: dna.seed })
    const sel = buildSelection(dna, layout, {
      brandName: 'Probe', eyebrow: 'New', headline: 'H', subheadline: 'S', cta: 'Shop',
      usps: [{ title: 'a', desc: 'b' }, { title: 'c', desc: 'd' }, { title: 'e', desc: 'f' }],
      storyTitle: 'T', storyBody: 'B', reviews: [{ name: 'X', stars: 5, text: 'y' }], footerTagline: 'F',
    }, undefined, { niche, seed: dna.seed, productCount: 6 + (i % 8), productTypes: ['a', 'b', 'c'].slice(0, i % 4) })
    for (const s of [sel.topbar.id, sel.nav.id, sel.footer.id, ...sel.sections.map(x => x.id)]) seen.add(s)
  }
  return { reachable: [...seen].sort(), total: allComponents().length }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const specs = LABEL === 'na' ? NEW_NICHES : NICHES
  const stats = catalogStats()
  const results: StoreMetrics[] = []

  console.log(`═══ AUDIT (${LABEL}) — ${specs.length} stores, catalogus ${stats.total} componenten ═══\n`)
  specs.forEach((s, i) => {
    const m = auditStore(s, i)
    results.push(m)
    console.log(`── ${m.brand} (${m.niche})`)
    console.log(`   toon ${m.tone} · fonts ${m.fonts}`)
    console.log(`   hero        : ${m.heroComponent}`)
    console.log(`   hero-beeld  : ${m.heroVisual}${m.heroUsesProductPhoto ? '  ← kale productfoto uit het grid' : ''}`)
    console.log(`   producten   : ${m.productComponent}`)
    console.log(`   componenten : ${m.componentCount} — ${m.components.join(', ')}`)
    if (m.genericHits.length) console.log(`   generieke copy: ${m.genericHits.join(', ')}`)
  })

  const union = new Set(results.flatMap(r => r.components))
  const reach = derivedReach()
  console.log(`\n═══ COMPONENT-BREEDTE ═══`)
  console.log(`  gebruikt over ${results.length} stores : ${union.size} van ${stats.total} (${Math.round(union.size / stats.total * 100)}%)`)
  console.log(`  bereikbaar via de afgeleide selectie: ${reach.reachable.length} van ${reach.total} (${Math.round(reach.reachable.length / reach.total * 100)}%)`)
  const perCat: Record<string, number> = {}
  for (const id of union) perCat[id.split('.')[0]] = (perCat[id.split('.')[0]] ?? 0) + 1
  console.log(`  per categorie: ${Object.entries(perCat).sort().map(([k, v]) => `${k} ${v}/${stats.byCategory[k]}`).join(' · ')}`)

  const heroProduct = results.filter(r => r.heroUsesProductPhoto).length
  console.log(`\n═══ HERO-BEELD ═══`)
  console.log(`  ${heroProduct}/${results.length} stores tonen de kale productfoto als hero-beeld`)

  fs.writeFileSync(path.join(OUT, `audit-${LABEL}.json`), JSON.stringify({
    label: LABEL, catalog: stats.total, stores: results,
    union: [...union].sort(), unionCount: union.size,
    derivedReach: reach.reachable, derivedReachCount: reach.reachable.length,
  }, null, 2))
  fs.writeFileSync(path.join(OUT, `dirs-${LABEL}.txt`), results.map(r => r.dir).join('\n'))
  console.log(`\nmanifest: ${path.join(OUT, `audit-${LABEL}.json`)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
