// Bouwt een "kitchen sink"-store waarin ELK component uit de registry minstens
// één keer voorkomt, in elke stijl-variant die het ondersteunt, en draait er
// `next build` op. Zo compileert elke handgeschreven JSX-generator aantoonbaar —
// niet alleen de handvol die een willekeurige store toevallig kiest.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { allComponents } from './components/registry.js'
import { assemblePage } from './components/assemble.js'
import { deriveDesignDNA, fallbackPersona } from './tokens.js'
import { selectMotionProfile } from './anime-presets.js'
import { buildLayoutSharedFiles, buildCheckoutAndInfoPages, buildTemplateVars } from '../store-platform/template-engine.js'
import type { ComponentSelection } from './components/types.js'

const OUTDIR = path.join(os.tmpdir(), 'dropship-allcomponents')

const products = Array.from({ length: 9 }, (_, i) => ({
  id: `p-${i + 1}`, title: `Test product ${i + 1}`, price: 24.95 + i * 3,
  image: `https://example.invalid/p${i + 1}.jpg`, description: 'A short description used for layout testing.',
  compareAtPrice: 34.95, badge: i === 0 ? 'New' : undefined,
}))

function main() {
  const dna = deriveDesignDNA({ persona: fallbackPersona('test niche'), niche: 'test niche', seed: 'all-components' })
  const motion = selectMotionProfile(dna.tone, dna.seed)
  const all = allComponents()

  // Elke component × elke ondersteunde stijl → één instantie
  const instances: ComponentSelection[] = []
  for (const def of all) {
    for (const style of def.styles) {
      instances.push({ id: def.id, style, anim: def.anims.includes('expressive') ? 'expressive' : def.anims[0], props: { iconTheme: 'sport' } })
    }
  }

  const navs = instances.filter(s => s.id.startsWith('nav.'))
  const footers = instances.filter(s => s.id.startsWith('footer.'))
  const topbars = instances.filter(s => s.id.startsWith('topbar.'))
  const body = instances.filter(s => !/^(nav|footer|topbar)\./.test(s.id))

  console.log(`${all.length} componenten → ${instances.length} stijl-instanties`)

  if (fs.existsSync(OUTDIR)) fs.rmSync(OUTDIR, { recursive: true, force: true })
  fs.mkdirSync(OUTDIR, { recursive: true })

  // Eén pagina per nav/footer/topbar-instantie is niet nodig; we stapelen ze
  // allemaal als losse pagina's zodat ook chrome-varianten compileren.
  const vars = buildTemplateVars({
    brandName: 'Testshop', slogan: 'Testing every component', niche: 'test niche',
    primary: dna.palette.primary, secondary: dna.palette.secondary, accent: dna.palette.accent,
    products, usps: [{ title: 'One', desc: 'First' }, { title: 'Two', desc: 'Second' }, { title: 'Three', desc: 'Third' }],
    heroHeadline: 'All components', fontUrl: dna.typography.fontUrl,
    headingFont: dna.typography.heading, bodyFont: dna.typography.body,
    storeId: 'all-components', subdomain: 'allcomponents', runId: 'all-components',
  })

  buildLayoutSharedFiles(OUTDIR, vars)
  buildCheckoutAndInfoPages(OUTDIR, vars)

  // Hoofdpagina: alle body-componenten achter elkaar
  const main = assemblePage({
    dna, brandName: 'Testshop', topbar: topbars[0], nav: navs[0],
    sections: body, footer: footers[0], products, defaultStyle: 'minimal', motion,
  })
  fs.writeFileSync(path.join(OUTDIR, 'app', 'page.tsx'), main.page, 'utf-8')
  console.log(`hoofdpagina: ${main.usedComponents.length} instanties, ${main.cssConflicts.length} CSS-conflicten`)
  for (const w of main.warnings) console.log('  ⚠ ' + w)

  // Extra pagina's voor elke chrome-combinatie (nav × footer × topbar)
  const chromeCount = Math.max(navs.length, footers.length, topbars.length)
  for (let i = 0; i < chromeCount; i++) {
    const page = assemblePage({
      dna, brandName: 'Testshop',
      topbar: topbars[i % topbars.length], nav: navs[i % navs.length],
      sections: body.slice(0, 3), footer: footers[i % footers.length],
      products, defaultStyle: 'minimal', motion,
    })
    const dir = path.join(OUTDIR, 'app', `chrome-${i}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'page.tsx'), page.page, 'utf-8')
  }
  console.log(`${chromeCount} chrome-pagina's geschreven`)
  console.log(`\nBUILD_DIR=${OUTDIR}`)
}
main()
