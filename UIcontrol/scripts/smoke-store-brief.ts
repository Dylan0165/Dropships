// Smoke-test van de store-builder brief — DOE ÉÉN ECHTE LLM-CALL.
//
// Dit script is met opzet GEEN onderdeel van de verify-suite: het kost geld en
// heeft een werkende API-key nodig. Het bestaat omdat de verify-scripts de
// LLM-aanroep juist vermijden, en daardoor niet kunnen aantonen dat de prompt
// nog steeds geldige JSON oplevert. Dat is precies het risico zodra je de
// system-prompt uitbreidt (FASE 1 laadt drie design-skills mee, ~15 KB).
//
// Gebruik:
//   npm run smoke:brief                 # één winkel in de standaard niche
//   SMOKE_NICHE="desk setup" npm run smoke:brief
import '../src/server/load-env.js'
import { generateBrief, STORE_BUILDER_EXTRA_SKILLS } from '../src/server/pipeline/store-builder.js'

const niche = process.env.SMOKE_NICHE ?? 'beard care for men 25-45'

const products = [
  { id: 'p1', title: 'Beard oil with jojoba and argan', productType: 'beard oil', price: 19.95, costPrice: 6.1, image: '', supplier: 'cj' },
  { id: 'p2', title: 'Boar bristle beard brush', productType: 'beard brush', price: 14.95, costPrice: 4.2, image: '', supplier: 'cj' },
  { id: 'p3', title: 'Stainless steel beard comb', productType: 'beard comb', price: 12.95, costPrice: 3.4, image: '', supplier: 'cj' },
  { id: 'p4', title: 'Beard trimmer with ceramic blades', productType: 'beard trimmer', price: 39.95, costPrice: 15.8, image: '', supplier: 'cj' },
  { id: 'p5', title: 'Beard shampoo bar, fragrance free', productType: 'beard shampoo', price: 11.95, costPrice: 3.1, image: '', supplier: 'cj' },
  { id: 'p6', title: 'Beard balm with shea butter', productType: 'beard balm', price: 16.95, costPrice: 5.0, image: '', supplier: 'cj' },
]

console.log(`niche: ${niche}`)
console.log(`extra skills: ${STORE_BUILDER_EXTRA_SKILLS.join(', ')}`)
console.log(`model: ${process.env.LLM_MODEL_STORE ?? 'deepseek-reasoner'} (fallback ${process.env.LLM_MODEL_STORE_FALLBACK ?? 'deepseek-chat'})`)
console.log('--- echte API-call ---')

const runId = `smoke-${Date.now()}`
// De agent-executielog heeft een foreign key naar `runs`; zonder deze rij faalt
// het wegschrijven van de kosten en zie je een FK-fout in plaats van het
// resultaat van de call.
const { default: db } = await import('../src/server/db.js')
const now = new Date().toISOString()
db.prepare(`INSERT OR IGNORE INTO runs (run_id, niche, status, data, started_at, updated_at) VALUES (?,?,?,?,?,?)`)
  .run(runId, niche, 'running', '{}', now, now)

const t0 = Date.now()
const result = await generateBrief({
  runId,
  niche,
  brand: { name: '', tone: 'confident' },
  products,
  persona: { label: 'man 25-45, verzorgd maar niet ijdel', interests: ['grooming', 'beard care'], priceRange: { min: 12, max: 40 } },
  siteStructure: { nicheType: 'considered', pages: [{ id: 'home', title: 'Home' }] },
  onLog: (m) => console.log(`  ${m}`),
})

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`--- klaar in ${secs}s ---`)

if (!result.brief) {
  console.error(`✗ geen bruikbare brief: ${result.error ?? 'onbekende fout'}`)
  if (result.validationErrors?.length) console.error(`  schema-fouten: ${result.validationErrors.join(' · ')}`)
  process.exit(1)
}

const b = result.brief
console.log(`✓ brief na ${result.attempts ?? '?'} poging(en)`)
console.log(`  brand_name       : ${b.brand_name}`)
console.log(`  hero_headline    : ${b.hero_headline}`)
console.log(`  hero_subheadline : ${b.hero_subheadline}`)
console.log(`  hero_cta         : ${b.hero_cta}`)
console.log(`  slogan           : ${b.slogan}`)
console.log(`  story_angle      : ${b.story_angle ?? '(niet gezet)'}`)
console.log(`  usps             : ${b.usps.map(u => u.title).join(' | ')}`)
console.log(`  design-plan      : ${b.design ? `JA — ${b.design.palette?.length ?? 0} kleuren, ${b.design.typography?.display}/${b.design.typography?.body}, signature ${b.design.signature_element?.type}` : 'NEE (vangnet-DNA)'}`)
if (b.design?.design_rationale) console.log(`  rationale        : ${b.design.design_rationale.slice(0, 240)}`)
console.log(`  componentkeuze   : ${b.components ? `JA — ${b.components.sections?.length ?? 0} secties, nav ${b.components.nav}, footer ${b.components.footer}` : 'NEE (afgeleide selectie)'}`)

// De twee dingen die deze smoke-test moet bewijzen.
const problems: string[] = []
if (!b.design) problems.push('geen design-plan in de brief — de design-skills hebben niets opgeleverd')
if (!b.components) problems.push('geen componentkeuze in de brief — de agent heeft de catalogus genegeerd')
if (/\b(bestel|koop|ontdek|kwaliteit)\b/i.test(JSON.stringify(b))) problems.push('Nederlandse copy in een Engelse winkel')
if (problems.length) {
  console.error('\n✗ ' + problems.join('\n✗ '))
  process.exit(1)
}
console.log('\n✓ design-plan én componentkeuze aanwezig, copy is Engels')
