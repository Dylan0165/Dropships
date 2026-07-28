// Verificatie Taak D — het VOLLEDIGE assortiment door de componentcatalogus.
//
// Bouwt echte stores met renderStore() (zelfde pad als de pipeline) en
// controleert per store: blijft de renderer de componentcatalogus, staan ALLE
// producten in de pagina, en wordt een collectie met meerdere producttypes ook
// echt per categorie navigeerbaar?
import fs from 'node:fs'
import path from 'node:path'
import { renderStore, type StoreBrief } from '../src/server/pipeline/store-builder.js'

let pass = 0, fail = 0
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const check = (n: string, ok: boolean, d: string) => {
  if (ok) { pass++; say(`  ✓ ${n} — ${d}`) } else { fail++; say(`  ✗ FAIL ${n} — ${d}`) }
}

const BEARD_TYPES = [
  'beard oil', 'beard balm', 'beard trimmer', 'beard comb', 'beard brush', 'beard shampoo',
  'beard scissors', 'beard growth serum', 'beard gift set', 'beard storage bag', 'beard roller', 'shaving razor',
]

function assortment(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `beard-${i + 1}`,
    title: `${BEARD_TYPES[i % BEARD_TYPES.length]} premium edition ${i + 1}`,
    productType: BEARD_TYPES[i % BEARD_TYPES.length],
    price: 14.95 + i * 4,
    image: `https://example.invalid/beard-${i + 1}.jpg`,
    description: 'An honest short description of this product.',
    supplier: 'cj', supplierProductId: `pid-beard-${i}`, supplierVariantId: `vid-beard-${i}`,
  }))
}

function brief(name: string, components?: Record<string, unknown>): StoreBrief {
  return {
    brand_name: name,
    slogan: 'For the beard you actually maintain',
    hero_headline: 'Everything your beard needs, in one place',
    hero_subheadline: 'Oils, balms, trimmers and brushes — shipped from Europe.',
    hero_cta: 'Shop the collection',
    usps: [
      { title: 'Tested first', desc: 'We order and try everything before listing it.' },
      { title: 'European stock', desc: 'Days, not weeks, with tracking from the start.' },
      { title: 'Honest answers', desc: 'A real reply within one working day.' },
    ],
    story_angle: 'Most beard shops sell one oil and call it a range.',
    footer_tagline: 'A complete beard routine, delivered across Europe.',
    ...(components ? { components } : {}),
  } as unknown as StoreBrief
}

function build(runId: string, name: string, count: number, components?: Record<string, unknown>) {
  const logs: string[] = []
  const res = renderStore({
    runId, niche: 'baard verzorging',
    brand: { name, tone: 'confident' },
    products: assortment(count),
    persona: { label: 'Man met een verzorgde baard', interests: ['grooming'], priceRange: { min: 15, max: 60 }, ageRange: '25-45' },
    onLog: (m: string) => logs.push(m),
  } as never, brief(name, components))
  const dir = res.buildDir
  const page = fs.readFileSync(path.join(dir, 'app', 'page.tsx'), 'utf-8')
  const dna = JSON.parse(fs.readFileSync(path.join(dir, 'design-dna.json'), 'utf-8'))
  return { res, page, dna, logs, dir }
}

// ═══ 1. VOLLE COLLECTIE (12 producten, 12 types) ═══
say('═══ 1. VOLLE COLLECTIE — 12 PRODUCTEN, 12 PRODUCTTYPES ═══')
const big = build('verify-beardfull-0001', 'Beardworks', 12)
const meta = big.dna.components ?? {}
say(`  renderer: ${meta.renderer} · bron: ${meta.source}`)
say(`  componenten: ${(meta.used ?? []).join(', ')}`)
say(`  collectie-meta: ${JSON.stringify(meta.collection)}`)
for (const l of big.logs.filter(l => /assemble|producten/.test(l))) say(`  ${l}`)

check('renderer blijft de componentcatalogus', meta.renderer === 'component-catalog',
  `renderer=${meta.renderer} (terugval zou "render-page (fallback)" zijn)`)
const titlesInPage = assortment(12).filter(p => big.page.includes(p.title))
check('ALLE 12 producten staan in de pagina', titlesInPage.length === 12,
  `${titlesInPage.length}/12 producttitels gevonden in app/page.tsx`)
check('elk producttype staat in de paginadata', BEARD_TYPES.every(t => big.page.includes(`"productType":"${t}"`)),
  `${BEARD_TYPES.filter(t => big.page.includes(`"productType":"${t}"`)).length}/12 types in PRODUCTS`)
const productComponent = (meta.used ?? []).find((u: string) => u.startsWith('products.'))
check('een productweergave voor grote, diverse collecties', productComponent?.startsWith('products.category-tabs'),
  `gekozen: ${productComponent}`)
check('de collectie is per categorie te doorlopen', big.page.includes('p.productType===list[t]'),
  'ProductTabs filtert op het echte producttype')
check('meta legt de collectie vast', meta.collection?.products === 12 && meta.collection?.types?.length === 12,
  JSON.stringify(meta.collection))

// ═══ 2. KLEINE COLLECTIE ═══
say('')
say('═══ 2. KLEINE COLLECTIE — 4 PRODUCTEN ═══')
const small = build('verify-beardsmall-0001', 'Shortbeard', 4)
const smallMeta = small.dna.components ?? {}
const smallProductComponent = (smallMeta.used ?? []).find((u: string) => u.startsWith('products.'))
say(`  renderer: ${smallMeta.renderer} · productweergave: ${smallProductComponent}`)
check('renderer blijft de componentcatalogus', smallMeta.renderer === 'component-catalog', `renderer=${smallMeta.renderer}`)
check('geen catalogus-weergave voor 4 producten',
  !['products.grid-4', 'products.masonry', 'products.category-tabs'].some(id => smallProductComponent?.startsWith(id)),
  `gekozen: ${smallProductComponent}`)
check('alle 4 producten zichtbaar', assortment(4).every(p => small.page.includes(p.title)), '4/4 titels in page.tsx')

// ═══ 3. LLM KIEST EEN WEERGAVE DIE NIET PAST ═══
say('')
say('═══ 3. LLM KIEST "few-products" VOOR 12 PRODUCTEN → GECORRIGEERD ═══')
const mismatch = build('verify-beardmismatch-0001', 'Beardline', 12, {
  style: 'editorial',
  nav: 'nav.classic',
  footer: 'footer.simple',
  sections: [
    { id: 'hero.split-left' },
    { id: 'products.editorial-list' },       // few-products, 12 producten = eindeloze muur
    { id: 'testimonials.cards-grid' },
    { id: 'cta.gradient-banner' },
  ],
})
const mmMeta = mismatch.dna.components ?? {}
const mmProduct = (mmMeta.used ?? []).find((u: string) => u.startsWith('products.'))
for (const l of mismatch.logs.filter(l => /past niet|assemble\]/.test(l))) say(`  ${l}`)
check('de mismatch is gecorrigeerd', !mmProduct?.startsWith('products.editorial-list'),
  `LLM koos products.editorial-list → ${mmProduct}`)
check('de correctie is gelogd', (mmMeta.notes ?? []).some((n: string) => /past niet bij 12 producten/.test(n)),
  (mmMeta.notes ?? []).join(' · ') || 'geen notitie')
check('renderer blijft de componentcatalogus', mmMeta.renderer === 'component-catalog', `renderer=${mmMeta.renderer}`)
check('alle 12 producten nog steeds zichtbaar', assortment(12).every(p => mismatch.page.includes(p.title)), '12/12 titels')

// ═══ 4. LLM-KEUZE DIE WÉL PAST BLIJFT STAAN ═══
say('')
say('═══ 4. PASSENDE LLM-KEUZE BLIJFT ONGEMOEID ═══')
const ok = build('verify-beardok-0001', 'Beardgrid', 12, {
  style: 'bold', nav: 'nav.classic', footer: 'footer.simple',
  sections: [{ id: 'hero.centered' }, { id: 'products.grid-4' }, { id: 'badges.trust-row' }, { id: 'testimonials.avatar-row' }],
})
const okMeta = ok.dna.components ?? {}
const okProduct = (okMeta.used ?? []).find((u: string) => u.startsWith('products.'))
check('grid-4 blijft grid-4 bij 12 producten', okProduct?.startsWith('products.grid-4'), `gekozen: ${okProduct}`)
check('geen onnodige correctie gelogd', !(okMeta.notes ?? []).some((n: string) => /past niet/.test(n)),
  (okMeta.notes ?? []).join(' · ') || 'geen notities')

say('')
say(`═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
say('')
say(`build-dirs:\n  ${[big.dir, small.dir, mismatch.dir, ok.dir].join('\n  ')}`)

fs.writeFileSync(process.env.LOGFILE ?? 'collection-render.txt', out.join('\n'), 'utf-8')
process.exit(fail === 0 ? 0 : 1)
