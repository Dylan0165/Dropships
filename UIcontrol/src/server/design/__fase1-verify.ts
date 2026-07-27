// Verificatiescript Fase 1 — genereert 3 teststores zonder LLM (mock-brief) en
// bewijst: unieke combinatie-hashes, Anime.js in de output + package.json, en
// dat de emoji-filter daadwerkelijk blokkeert.
import fs from 'node:fs'
import path from 'node:path'
import { renderStore } from '../pipeline/store-builder.js'
import { sanitizeCopyDeep, containsAiEmoji, stripAiEmoji } from './sanitize.js'
import { catalogStats } from './components/registry.js'
import { listCombinations } from './uniqueness.js'
import type { StoreBrief } from '../pipeline/stages.js'

const OUT: string[] = []
const say = (s: string) => { console.log(s); OUT.push(s) }

function brief(name: string, niche: string): StoreBrief {
  return {
    brand_name: name,
    slogan: 'Built for the way you actually live',
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
    products: [],
  } as unknown as StoreBrief
}

const NICHES = [
  { niche: 'portable gym equipment', brand: 'Trailform', interests: ['fitness', 'training'], price: { min: 25, max: 70 } },
  { niche: 'kitchen prep tools', brand: 'Mealkind', interests: ['cooking', 'kitchen'], price: { min: 15, max: 45 } },
  { niche: 'sleep and wellness aids', brand: 'Nightwell', interests: ['wellness', 'sleep'], price: { min: 30, max: 95 } },
]

function products(n: number, tag: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tag}-${i + 1}`, title: `${tag} item ${i + 1}`, price: 19.95 + i * 5,
    image: `https://example.invalid/${tag}-${i + 1}.jpg`, description: 'A short honest description of the product.',
    supplier: 'cj', supplierProductId: `pid-${tag}-${i}`,
  }))
}

async function main() {
  const stats = catalogStats()
  say('═══ 1. CATALOGUS ═══')
  say(`totaal: ${stats.total} componenten`)
  say(Object.entries(stats.byCategory).sort().map(([k, v]) => `  ${k.padEnd(13)}${v}`).join('\n'))
  const tooSmall = Object.entries(stats.byCategory).filter(([, v]) => v < 8)
  say(tooSmall.length ? `✗ categorieën onder 8: ${tooSmall.map(([k]) => k).join(', ')}` : '✓ elke categorie heeft minstens 8 varianten')

  say('\n═══ 2. EMOJI-FILTER ═══')
  const dirty = 'Boost your workout 🚀✨ — the ultimate gear 🔥 you need 💯'
  say(`input : ${dirty}`)
  say(`output: ${stripAiEmoji(dirty)}`)
  say(`bevat nog emoji: ${containsAiEmoji(stripAiEmoji(dirty))}`)
  const deep = sanitizeCopyDeep({ hero: 'Fast delivery 🚀', usps: [{ title: 'Quality ✅', desc: 'Real 💯 value' }], price: 19.95 })
  say(`diep object → ${JSON.stringify(deep.value)}`)
  say(`rapport: ${deep.report.changed} velden, geblokkeerd: ${deep.report.blocked.join(' ')} , paden: ${deep.report.fields.join(', ')}`)
  const keptTypography = stripAiEmoji('Only EUR 19.95 — 100% cotton, ©2026')
  say(`legitieme tekens blijven staan: "${keptTypography}"`)

  say('\n═══ 3. DRIE STORES GENEREREN ═══')
  const results: Array<{ brand: string; dir: string }> = []
  for (const n of NICHES) {
    const runId = `verify-${n.brand.toLowerCase()}-0001`
    const out = renderStore({
      runId,
      niche: n.niche,
      brand: { name: n.brand, tone: 'confident' },
      products: products(8, n.brand.toLowerCase()),
      persona: { label: `${n.niche} buyer`, interests: n.interests, priceRange: n.price, ageRange: '25-45' },
      onLog: (m: string) => { if (/uniqueness|assemble|sanitize/.test(m)) say(`   ${n.brand}: ${m}`) },
    } as never, brief(n.brand, n.niche))
    if (!out.ok || !out.buildDir) { say(`✗ ${n.brand} faalde`); continue }
    results.push({ brand: n.brand, dir: out.buildDir })
  }

  say('\n═══ 4. COMBINATIE-HASHES (moeten uniek zijn) ═══')
  const seen = new Map<string, string>()
  let dupe = false
  for (const r of results) {
    const dna = JSON.parse(fs.readFileSync(path.join(r.dir, 'design-dna.json'), 'utf-8'))
    const u = dna.uniqueness ?? {}
    const c = u.combination ?? {}
    say(`${r.brand.padEnd(10)} hash=${u.hash}`)
    say(`           hero=${c.hero}  topbar=${c.topbar}  motion=${c.motion}`)
    say(`           fonts=${c.fonts}  palette=${c.palette}`)
    say(`           layout=${c.layout}  (rotaties: ${(u.rotated ?? []).join(',') || 'geen'})`)
    if (seen.has(u.hash)) { dupe = true; say(`✗ BOTSING met ${seen.get(u.hash)}`) }
    seen.set(u.hash, r.brand)
  }
  say(dupe ? '✗ niet alle hashes uniek' : `✓ ${seen.size} unieke combinatie-hashes`)
  say(`DB bevat nu ${listCombinations(100).length} vastgelegde combinaties`)

  say('\n═══ 5. ANIME.JS DAADWERKELIJK IN DE OUTPUT ═══')
  for (const r of results) {
    const page = fs.readFileSync(path.join(r.dir, 'app', 'page.tsx'), 'utf-8')
    const pkg = JSON.parse(fs.readFileSync(path.join(r.dir, 'package.json'), 'utf-8'))
    const dataAm = (page.match(/data-am=/g) ?? []).length
    say(`${r.brand.padEnd(10)} package.json animejs=${pkg.dependencies?.animejs ?? 'ONTBREEKT'}`)
    say(`           import('animejs') aanwezig: ${page.includes("import('animejs')")}`)
    say(`           data-am markeringen: ${dataAm}`)
    say(`           reduced-motion afgevangen: ${page.includes('prefers-reduced-motion')}`)
    say(`           failsafe (am-armed verwijderen): ${page.includes('am-armed')}`)
    const plan = page.match(/const AM_PLAN: any = (\{.*?\});/s)?.[1]
    say(`           AM_PLAN families: ${plan ? Object.keys(JSON.parse(plan)).join(',') : 'geen'}`)
  }

  say('\n═══ 6. GEEN EMOJI IN DE GEGENEREERDE PAGINA\'S ═══')
  for (const r of results) {
    const page = fs.readFileSync(path.join(r.dir, 'app', 'page.tsx'), 'utf-8')
    say(`${r.brand.padEnd(10)} emoji in page.tsx: ${containsAiEmoji(page)}`)
  }

  const target = path.join(process.cwd(), '..', 'memory', 'logs', 'fase-1-componenten-en-animatie.md')
  fs.writeFileSync(target, '# Fase 1 — verificatie-output\n\n```\n' + OUT.join('\n') + '\n```\n', 'utf-8')
  say(`\nlog weggeschreven: ${target}`)
  console.log('\nBUILD-DIRS:\n' + results.map(r => r.dir).join('\n'))
}
main().catch(e => { console.error(e); process.exit(1) })
