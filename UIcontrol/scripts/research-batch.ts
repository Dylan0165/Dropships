// CLI voor het offline batch-onderzoek.
//
//   npm run research:batch -- --categories=5
//   npm run research:batch -- --categories=40 --spacing=3000 --max-calls=1500
//   npm run research:batch -- --list          (toont wat er in de bibliotheek staat)
//   npm run research:batch -- --skips         (toont overgeslagen categorieën + reden)
//
// Draait bewust als los proces: dit mag uren duren en hoort niet in de webserver.
import { runBatchResearch } from '../src/server/research/batch-research.js'
import { listPresets, listSkips, presetStats } from '../src/server/research/preset-store.js'

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
function num(name: string, fallback?: number): number | undefined {
  const v = arg(name)
  if (v == null) return fallback
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  if (flag('list')) {
    const stats = presetStats()
    console.log(`presets: ${stats.total} (${stats.real} echt, ${stats.mock} mock) · ` +
      `${stats.batch} uit batch, ${stats.fallback} uit wizard · ` +
      `${stats.products} producten, gemiddeld ${stats.avgProducts} per preset · ${stats.skips} overgeslagen categorieën`)
    console.log('')
    for (const p of listPresets({ includeMock: true, limit: 200 })) {
      console.log(`${p.isMock ? '[MOCK] ' : ''}${p.slug}`)
      console.log(`  niche      : ${p.niche}  (${p.productCount} producten, ${p.distinctTypes} types, gem. score ${p.avgScore ?? '—'})`)
      console.log(`  herkomst   : ${p.source}${p.categoryName ? ` · ${p.parentName} › ${p.categoryName}` : ''} · ${p.createdAt.slice(0, 16).replace('T', ' ')}`)
      console.log(`  waarom     : ${p.rationale}`)
      if (p.problem) console.log(`  probleem   : ${p.problem}`)
      console.log(`  gebruikt   : ${p.usedCount}×`)
      console.log('')
    }
    return
  }

  if (flag('skips')) {
    for (const s of listSkips()) {
      console.log(`${s.categoryName.padEnd(28)} ${String(s.found).padStart(2)} gevonden — ${s.reason}`)
    }
    return
  }

  const opts = {
    maxCategories: num('categories', 5),
    minProducts: num('min', 7),
    maxProducts: num('max', 15),
    perTypeCandidates: num('per-type', 8),
    spacingMs: num('spacing', 2500),
    maxCalls: num('max-calls', 2000),
    refresh: flag('refresh'),
  }
  console.log(`start batch-onderzoek: ${JSON.stringify(opts)}`)
  console.log('')

  const stop = { aborted: false }
  process.on('SIGINT', () => {
    console.log('\nafbreken aangevraagd — de huidige categorie wordt nog afgemaakt…')
    stop.aborted = true
  })

  const res = await runBatchResearch({ ...opts, signal: stop })

  console.log('')
  console.log('═══ SAMENVATTING ═══')
  console.log(`  categorieën behandeld : ${res.scanned}`)
  console.log(`  presets aangemaakt    : ${res.presets}`)
  console.log(`  overgeslagen          : ${res.skipped}`)
  console.log(`  mislukt               : ${res.failed}`)
  console.log(`  CJ /product/list-calls: ${res.cjCalls}`)
  console.log(`  duur                  : ${Math.round(res.durationMs / 1000)}s`)
  if (res.isMock) {
    console.log('')
    console.log('  ⚠ MOCK-MODUS: deze presets zijn gemaakt op nagebootste data en worden')
    console.log('    NOOIT aan een echte wizard-run geserveerd. Draai dit op de VPS met')
    console.log('    een geldige CJ_API_KEY voor bruikbare presets.')
  }
  if (res.budgetExhausted) console.log('  ⚠ call-begroting bereikt — draai opnieuw om verder te gaan')
  console.log('')
  for (const e of res.entries) {
    const mark = e.status === 'preset' ? '✓' : e.status === 'failed' ? '✗' : '·'
    console.log(`  ${mark} ${e.categoryName.padEnd(26)} ${e.status.padEnd(12)} ${e.niche ?? ''}${e.products != null ? ` (${e.products} producten)` : ''}${e.reason ? ` — ${e.reason.slice(0, 80)}` : ''}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
