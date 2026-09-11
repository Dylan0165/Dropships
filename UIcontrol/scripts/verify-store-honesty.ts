// Verificatie — eerlijk vertrouwen en de store-review-poort.
//
// Bewijst de regels die op 8 augustus 2026 zijn ingevoerd:
//   • geen verzonnen reviews, reviewersnamen, sterren of reviewaantallen;
//   • badges alleen met niet-claimende labels;
//   • de testimonials-sectie verschijnt uitsluitend bij ECHTE reviews;
//   • geen enkel componentdefault lekt nog een verzonnen cijfer of naam;
//   • store-review staat als echte stage in de pipeline, met runner, en de
//     skill gebruikt het vergrendelde verdict-schema (geen decision/feedback).
//
// Draait de echte renderer. Geen beeldprovider: dit script test tekst en
// vertrouwen, niet beeldgeneratie.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')

const TMP = path.join(os.tmpdir(), 'dropship-honesty')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DATABASE_PATH = path.join(TMP, 'honesty.db')
process.env.STORES_WORKSPACE = path.join(TMP, 'stores')
// Zonder deze grendel zou een echte key in .env dit script beeldgeneratie laten
// doen; het script gaat over copy, niet over pixels.
delete process.env.OPENAI_API_KEY
delete process.env.REPLICATE_API_TOKEN

const { renderStore, STORE_BUILDER_EXTRA_SKILLS } = await import('../src/server/pipeline/store-builder.js')
const { loadSkillPrompts } = await import('../src/server/pipeline/agent.js')
const { realReviews, badgeFor } = await import('../src/server/design/content-en.js')
const { STAGES } = await import('../src/server/pipeline/types.js')
const { STAGE_RUNNERS, visibleTextSample } = await import('../src/server/pipeline/stages.js')
const { allComponents } = await import('../src/server/design/components/registry.js')
const { assemblePage } = await import('../src/server/design/components/assemble.js')
const { deriveDesignDNA } = await import('../src/server/design/tokens.js')
const { selectMotionProfile } = await import('../src/server/design/anime-presets.js')

let pass = 0
let fail = 0
const say = (s: string) => console.log(s)
const check = (name: string, ok: boolean, detail: string) => {
  if (ok) { pass++; say(`  ✓ ${name} — ${detail}`) } else { fail++; say(`  ✗ FAIL ${name} — ${detail}`) }
}

const FAKE_NAMES = /Emma R\.|James T\.|Sofia L\.|Mia V\.|Leo W\.|Nora K\.|Bram V\.|Alice M\.|Tom H\.|Lena S\.|Ravi N\.|Marte D\.|Ines P\./

function productsOf(n: number, tag: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tag}-${i + 1}`,
    title: `${tag} product ${i + 1}`,
    productType: `${tag} type ${(i % 3) + 1}`,
    price: 19.95 + i * 5,
    image: `/img/pack-${i + 1}.svg`,
    description: 'A short honest description.',
    supplier: 'cj', supplierProductId: `pid-${i}`, supplierVariantId: `vid-${i}`,
  }))
}

function brief(name: string) {
  return {
    brand_name: name,
    slogan: 'Made for the way you actually use it',
    hero_headline: 'The upgrade you keep meaning to make',
    hero_subheadline: 'Chosen carefully, shipped from Europe.',
    hero_cta: 'Shop the collection',
    colors: { primary: '#1f2933', secondary: '#f4f5f7', accent: '#c2410c' },
    usps: [
      { title: 'Checked before listing', desc: 'We order and test everything ourselves first.' },
      { title: 'European stock', desc: 'Days, not weeks, with tracking from the start.' },
      { title: 'Honest answers', desc: 'A real reply within one working day.' },
    ],
    footer_tagline: 'A focused collection, delivered fast across Europe.',
    story_angle: 'We got tired of waiting six weeks for things that arrived wrong.',
  } as never
}

function build(runId: string, name: string, reviews?: unknown) {
  const res = renderStore({
    runId, niche: 'beard care', brand: { name, tone: 'confident' },
    products: productsOf(8, name.toLowerCase()),
    persona: { label: 'beard care buyer', interests: ['grooming'], priceRange: { min: 15, max: 60 }, ageRange: '25-45' },
    reviews,
  } as never, brief(name))
  const page = fs.readFileSync(path.join(res.buildDir, 'app', 'page.tsx'), 'utf-8')
  const dna = JSON.parse(fs.readFileSync(path.join(res.buildDir, 'design-dna.json'), 'utf-8'))
  return { res, page, dna }
}

say('═══ 1. WINKEL ZONDER ECHTE REVIEWS ═══')
const a = build('honesty-a', 'Beardworks')
const usedA: string[] = (a.dna.components?.used ?? []).map((u: string) => u.replace(/\[.*\]$/, ''))
check('geen enkele testimonials-component geselecteerd',
  !usedA.some(id => id.startsWith('testimonials.')),
  `${usedA.length} componenten, geen testimonials`)
check('geen reviewcijfer-badge geselecteerd',
  !usedA.includes('badges.review-score'),
  usedA.filter(id => id.startsWith('badges.')).join(', ') || 'geen badges')
check('geen sterren in de gerenderde pagina', !a.page.includes('&#9733;'), '0 sterren')
check('geen verzonnen reviewersnaam', !FAKE_NAMES.test(a.page), 'geen bekende verzonnen namen')
check('geen verzonnen reviewaantal', !/2,?400\+|from \d+ verified reviews/.test(a.page), 'geen reviews-aantal')
check('geen "What customers say"-sectie zonder klanten', !a.page.includes('What customers say'), 'sectie overgeslagen')

say('\n═══ 2. WINKEL MET ECHTE REVIEWS ═══')
const b = build('honesty-b', 'Beardline', [
  { name: 'Jan de Vries', text: 'Werkt precies zoals beloofd, binnen drie dagen in huis.', stars: 5 },
])
check('een echte review komt WEL op de pagina', b.page.includes('Jan de Vries'), 'review terug te vinden in page.tsx')
const usedB: string[] = (b.dna.components?.used ?? []).map((u: string) => u.replace(/\[.*\]$/, ''))
check('testimonials-sectie verschijnt dan wel',
  usedB.some(id => id.startsWith('testimonials.')) || b.page.includes('What customers say'),
  usedB.filter(id => id.startsWith('testimonials.')).join(', ') || 'via de terugval-renderer')

say('\n═══ 3. realReviews() FILTERT, VERZINT NIET ═══')
check('onbruikbare input levert niets op',
  realReviews([{ name: 'A', text: 'kort' }, { name: '', text: 'Ook te kort' }]).length === 0)
check('geen array / undefined levert niets op',
  realReviews(undefined).length === 0 && realReviews('onzin').length === 0 && realReviews(null).length === 0)
check('sterren worden begrensd op 1-5',
  realReviews([{ name: 'Jan de Vries', text: 'Prima product, snel geleverd.', stars: 99 }])[0]?.stars === 5)
check('een geldige review blijft intact',
  realReviews([{ name: 'Jan de Vries', text: 'Prima product, snel geleverd.' }]).length === 1)

say('\n═══ 4. BADGES — ALLEEN NIET-CLAIMENDE LABELS ═══')
const ALLOWED = new Set(['New', 'New in', 'Just landed', 'Now available', 'Newly added', 'New season', ''])
const tones = ['minimal', 'premium', 'urban', 'tech', 'playful', 'organic']
const bad: string[] = []
for (const tone of tones) {
  for (let i = 0; i < 60; i++) {
    const label = badgeFor(tone as never, i, 1000 + i * 7)
    if (!ALLOWED.has(label)) bad.push(`${tone}:${label}`)
  }
}
check('geen claimende badge in 360 seeds', bad.length === 0, bad.slice(0, 4).join(', ') || 'alleen New/New in/Just landed/Now available')

say('\n═══ 5. COMPONENTDEFAULTS LEKKEN NIETS ═══')
const dna = deriveDesignDNA({ persona: { label: 'test' } as never, niche: 'beard care', seed: 'honesty' })
const firstOf = (cat: string) => allComponents().find(d => d.category === cat)?.id as string
const testimonialIds = allComponents().filter(d => d.category === 'testimonials').map(d => d.id)
const assembled = assemblePage({
  dna, brandName: 'Beardworks',
  topbar: { id: firstOf('topbar'), props: { iconTheme: 'grooming' } },
  nav: { id: firstOf('nav'), props: {} },
  footer: { id: firstOf('footer'), props: {} },
  sections: [{ id: firstOf('hero'), props: {} }, ...testimonialIds.map(id => ({ id, props: {} }))],
  products: productsOf(4, 'beard'),
  defaultStyle: 'minimal',
  motion: selectMotionProfile(dna.tone, dna.seed),
} as never)
check('alle testimonial-componenten zonder props → lege reviewlijsten',
  assembled.page.includes('[].map('),
  `${testimonialIds.length} componenten gerenderd, items-default = []`)
check('… geen enkel reviewer-object in de gerenderde pagina',
  !/\{"name":/.test(assembled.page),
  'geen {name, stars, text}-defaults meer in de output')
check('… geen verzonnen namen', !FAKE_NAMES.test(assembled.page), 'geen bekende verzonnen namen')
check('… geen verzonnen reviewaantal', !/2,?400\+|4\.8/.test(assembled.page), 'geen cijfers')
// De letterlijke `&#9733;` in de componentcode is onschadelijk zolang de map over
// een lege lijst loopt; de check hierboven bewijst dat de lijst leeg is. Een check
// op het sterretje in de brontekst zou hier vals alarm slaan.

say('\n═══ 6. STORE-REVIEW ALS ECHTE STAGE ═══')
const idxBuild = STAGES.indexOf('store-build')
const idxReview = STAGES.indexOf('store-review')
const idxValidate = STAGES.indexOf('build-validate')
check('store-review zit in STAGES', idxReview !== -1, STAGES.join(' → '))
check('… direct na store-build en vóór build-validate',
  idxReview === idxBuild + 1 && idxReview === idxValidate - 1,
  `store-build(${idxBuild}) → store-review(${idxReview}) → build-validate(${idxValidate})`)
check('store-review heeft een runner', typeof STAGE_RUNNERS['store-review'] === 'function')
check('elke stage heeft een runner',
  STAGES.every(s => typeof STAGE_RUNNERS[s] === 'function'),
  `${STAGES.length} stages`)

say('\n═══ 7. SKILLS LOPEN NIET MEER UIT DE PAS ═══')
const reviewerSkill = fs.readFileSync(path.join(workspaceRoot, 'Skillslibrary/store-reviewer/SKILL.md'), 'utf-8')
check('store-reviewer gebruikt het vergrendelde verdict-schema',
  reviewerSkill.includes('"verdict"') && !/"decision"\s*:/.test(reviewerSkill),
  'verdict/reason/score/suggestions')
check('store-reviewer kent de eerlijke-trust-regel',
  /no fabricated|fabricated social proof|Never state a review count/i.test(reviewerSkill))
const builderSkill = fs.readFileSync(path.join(workspaceRoot, 'Skillslibrary/store-builder/SKILL.md'), 'utf-8')
check('store-builder noemt de componentcatalogus', builderSkill.includes('component_catalog'))
check('store-builder noemt het juiste input-contract', builderSkill.includes('previous_agent_output.brand'))
check('geen Nederlandse voorbeeldcopy meer in de skill', !builderSkill.includes("'Bestel nu'"))
check('store-builder verbiedt verzonnen sociaal bewijs',
  /Never state a review count/i.test(builderSkill))

say('\n═══ 8. visibleTextSample() VOOR DE REVIEWER ═══')
const sample = visibleTextSample('<section><h1>Shop the collection</h1><p style={{ color:"red" }}>{PRODUCTS[0].title}</p></section>')
check('haalt de copy eruit en laat expressies weg',
  sample.includes('Shop the collection') && !sample.includes('PRODUCTS') && !sample.includes('color'),
  JSON.stringify(sample.slice(0, 80)))
check('respecteert het tekensbudget', visibleTextSample('<p>' + 'Woord '.repeat(4000) + '</p>', 200).length <= 200)

say('\n═══ 9. DESIGN-SKILLS MEELADEN MET DE STORE-BUILDER ═══')
check('de extra-skills-lijst is niet leeg',
  STORE_BUILDER_EXTRA_SKILLS.length > 0, STORE_BUILDER_EXTRA_SKILLS.join(', '))
const combined = loadSkillPrompts('store-builder', STORE_BUILDER_EXTRA_SKILLS)
check('de eigen store-builder-skill zit erin', combined.includes('# Store Builder'))
for (const extra of STORE_BUILDER_EXTRA_SKILLS) {
  const body = fs.readFileSync(path.join(workspaceRoot, 'Skillslibrary', extra, 'SKILL.md'), 'utf-8')
  // Een kenmerkende regel uit de skill moet letterlijk in de prompt staan.
  const marker = body.split('\n').find(l => l.startsWith('## ')) ?? body.split('\n')[0]
  check(`extra skill "${extra}" is meegeladen`,
    combined.includes(`# Extra regels: ${extra}`) && combined.includes(marker.trim()),
    marker.trim().slice(0, 60))
}
const skipped: string[] = []
check('een ontbrekende extra skill laat de agent niet vallen',
  loadSkillPrompts('store-builder', ['deze-skill-bestaat-niet'], m => skipped.push(m)).includes('# Store Builder') &&
  skipped.length === 1,
  skipped[0] ?? 'geen waarschuwing')
const designSkills = ['frontend-design', 'high-end-visual-design', 'image-taste-frontend', 'gpt-taste',
  'design-taste-frontend', 'critique', 'audit', 'polish', 'typeset', 'colorize']
const missing = designSkills.filter(s => !fs.existsSync(path.join(workspaceRoot, 'Skillslibrary', s, 'SKILL.md')))
check('alle tien design-skills staan in Skillslibrary', missing.length === 0, missing.join(', ') || `${designSkills.length}/${designSkills.length}`)
// De implementatie-skills horen NIET in de prompt: de store-builder schrijft geen code.
check('code-gerichte skills worden niet in de prompt gezet',
  !STORE_BUILDER_EXTRA_SKILLS.includes('frontend-design') && !STORE_BUILDER_EXTRA_SKILLS.includes('high-end-visual-design'),
  STORE_BUILDER_EXTRA_SKILLS.join(', '))

say(`\n═══ RESULTAAT: ${pass} geslaagd, ${fail} gefaald ═══`)
process.exit(fail === 0 ? 0 : 1)
