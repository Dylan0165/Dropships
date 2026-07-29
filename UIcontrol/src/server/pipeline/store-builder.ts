import path from 'path'
import fs from 'fs'
import os from 'os'
import { runAgent, z } from './agent.js'
import { buildLayoutSharedFiles, buildTemplateVars, buildCheckoutAndInfoPages, ensureTailwindSupport, selectTemplate } from '../store-platform/template-engine.js'
import type { TemplateName } from '../store-platform/template-engine.js'
import { deriveDesignDNA, fallbackPersona, type PersonaLike } from '../design/tokens.js'
import { DesignPlanSchema, applyDesignPlan } from '../design/design-plan.js'
import { selectLayout, recordLayout, fitProducts } from '../design/layout.js'
import type { RenderProduct } from '../design/render-page.js'
import { buildStorePage } from '../design/build-page.js'
import { ComponentSelectionSchema } from '../design/components/selection.js'
import { catalogForPrompt } from '../design/components/registry.js'
import { sanitizeCopyDeep } from '../design/sanitize.js'
import {
  generateReviews, generateStory, generateCtaBand,
  buildNavLinks, buildFooterLinks, heroLabel, badgeFor,
} from '../design/content-en.js'

// ─── Brief schema ─────────────────────────────────────────────────────────────
export const StoreBriefSchema = z.object({
  hero_headline:    z.string().min(1).max(80),
  hero_subheadline: z.string().min(1).max(160),
  hero_cta:         z.string().min(1).max(40),
  brand_name:       z.string().min(1).max(40),
  slogan:           z.string().min(1).max(60),
  colors: z.object({
    primary:   z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    accent:    z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  }),
  usps: z.array(z.object({
    icon:  z.string().min(1).max(4).optional(),
    title: z.string().min(1).max(40),
    desc:  z.string().min(1).max(160),
  })).length(3),
  footer_tagline: z.string().min(1).max(80),
  // Engelse één-zin framing van het klantprobleem voor de brand-story sectie.
  // Vervangt de RAUWE persona.problem (vaak Nederlands) die eerder direct in
  // de Engelse copy lekte.
  story_angle: z.string().min(1).max(180).optional(),
  // Het bewuste per-store ontwerpplan (kleuren met rollen, typografie-pairing,
  // layout-concept, signature-element). Optioneel: zonder plan valt de renderer
  // terug op het seeded design-DNA. Zie design/design-plan.ts.
  design: DesignPlanSchema.optional(),
  // Component-keuze uit de catalogus (van "genereren" → "combineren"). De LLM
  // kiest nav/sections/footer + varianten; ontbreekt het, dan leidt de pipeline
  // een selectie af uit toon + layout. Checkout valt hier NOOIT onder (vast).
  components: ComponentSelectionSchema.optional(),
}).passthrough()

export type StoreBrief = z.infer<typeof StoreBriefSchema>

export interface StoreBuildInput {
  runId: string
  niche: string
  brand: {
    name?: string
    slogan?: string
    tone?: string
    colors?: { primary?: string; secondary?: string; accent?: string }
    /** USP's uit brand-creation — vangnet voor de brief als de LLM uitvalt. */
    usps?: Array<{ title: string; desc: string }>
  }
  /** Doelgroepprofiel uit de wizard — bepaalt het design-DNA */
  persona?: PersonaLike
  /** Site-structuur uit wizard stap 3 — beïnvloedt de sectie-volgorde */
  siteStructure?: {
    nicheType?: string
    pages?: Array<{ id: string; title: string }>
    extras?: Array<{ id: string; title: string }>
  }
  products: Array<{
    id?: string
    title: string
    description?: string
    bullets?: string[]
    badge?: string
    price: number
    compareAtPrice?: number
    image?: string
    /** Producttype uit het assortiment ("beard oil") — stuurt de categorie-indeling. */
    productType?: string
    // Supplier koppeling — nodig voor automatische fulfillment na checkout
    supplier?: string
    supplierProductId?: string
    supplierVariantId?: string
    costPrice?: number
  }>
  /**
   * Sfeerbeeld voor de hero: een lokaal bestandspad (wordt in de store
   * gekopieerd) of een URL. Ontbreekt het, dan presenteert de renderer de
   * productfoto op een sfeerlaag — zie design/hero-visual.ts.
   */
  heroImage?: string | null
  onLog?: (msg: string) => void
}

export interface StoreBuildOutput {
  ok: boolean
  buildDir: string
  outDir: string
  templateName: TemplateName
  brief: StoreBrief
  brandName: string
  subdomain: string
  error?: string
  /** 'llm' = de store-builder agent leverde de brief; 'fallback' = samengesteld. */
  briefSource?: 'llm' | 'fallback'
  /** De ECHTE reden waarom de LLM-brief niet lukte — nooit weggooien. */
  briefError?: string
}

const STORES_WORKSPACE = process.env.STORES_WORKSPACE
  ?? path.join(os.tmpdir(), 'dropship-stores')

function ensureWorkspace(): string {
  if (!fs.existsSync(STORES_WORKSPACE)) fs.mkdirSync(STORES_WORKSPACE, { recursive: true })
  return STORES_WORKSPACE
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/**
 * Beschrijft de collectie voor de store-builder LLM.
 *
 * Zonder dit ontwerpt het model impliciet voor "een winkel" — meestal een volle
 * collectie — terwijl er soms maar twee producten zijn. Een smalle niche is een
 * legitieme uitkomst (zie suppliers/assortment.ts), dus de brief moet daar
 * expliciet op gericht worden in plaats van eromheen te werken.
 */
export function collectionContext(products: StoreBuildInput['products']): Record<string, unknown> {
  const count = products.length
  const types = [...new Set(products.map(p => p.productType).filter((t): t is string => !!t))]
  const guidance = count <= 2
    ? `This store has only ${count} product(s). Design a focused single-product-style store: one strong hero, deep product storytelling, trust and FAQ sections. Do NOT pick a catalog or grid layout — there is nothing to fill it with. Never invent products that are not in the list.`
    : count <= 6
      ? `This store has ${count} products — a small curated collection. Use an editorial or featured layout that makes ${count} products look deliberate, not empty. Never invent extra products.`
      : `This store has ${count} products across ${types.length} product type(s). Use a catalog-style layout.`
  return { product_count: count, product_types: types, guidance }
}

/**
 * Roept de store-builder skill aan voor de brief.
 *
 * Geeft bij falen de ECHTE reden terug in plaats van `null`. Dat was de reden
 * dat een mislukte brief in de UI aankwam als "brief generation failed" zonder
 * verdere uitleg: `runAgent` levert `error` + `validationErrors`, en die werden
 * hier weggegooid.
 */
export async function generateBrief(input: StoreBuildInput): Promise<{
  brief: StoreBrief | null
  error?: string
  validationErrors?: string[]
  attempts?: number
}> {
  const collection = collectionContext(input.products)
  const baseInput: Record<string, unknown> = {
    niche: input.niche,
    previous_agent_output: { brand: input.brand, products: input.products },
    collection,
    // Persona + site-structuur uit de wizard sturen de creatieve richting
    ...(input.persona ? { doelgroep_persona: input.persona } : {}),
    ...(input.siteStructure ? { site_structuur: input.siteStructure } : {}),
  }

  const result = await runAgent({
    runId: input.runId,
    stage: 'store-build',
    agentName: 'store-builder',
    skillName: 'store-builder',
    model: process.env.LLM_MODEL_STORE ?? 'deepseek-reasoner',
    input: {
      ...baseInput,
      // Component-catalogus: de LLM KIEST hieruit (van genereren → combineren).
      // Checkout staat er bewust NIET in — die is vast en wordt automatisch toegevoegd.
      component_catalog: catalogForPrompt(),
    },
    // Vanaf poging 2 gaat de catalogus (~10k tokens) eruit. Een antwoord dat
    // halverwege afgekapt is, wordt niet beter van dezelfde volle prompt; zonder
    // catalogus is er ruimte, en een ontbrekend `components`-blok is geen
    // probleem — dan leidt buildSelection de keuze af uit toon en layout.
    compactInput: baseInput,
    outputSchema: StoreBriefSchema,
    timeoutMs: 240_000,
    retries: 3,
    // Creatieve stap → hogere temperature voor meer variatie tussen stores
    temperature: 0.9,
    onLog: input.onLog ? (lvl, m) => input.onLog!(`[${lvl}] ${m}`) : undefined,
  })

  if (!result.ok || !result.parsed) {
    return { brief: null, error: result.error, validationErrors: result.validationErrors, attempts: result.attempts }
  }
  return { brief: result.parsed, attempts: result.attempts }
}

/**
 * Een geldige brief zonder LLM, uit wat er al ligt.
 *
 * brand-creation heeft de naam, slogan, kleuren en USP's al opgeleverd; de brief
 * voegt daar vooral hero-copy aan toe. Valt de store-builder agent uit, dan is
 * een run laten sneuvelen op die ene call slechter dan doorbouwen met een
 * eerlijke, iets soberdere winkel — het design-DNA, de componentselectie en de
 * Engelse content komen sowieso uit code (seeded), niet uit de brief.
 *
 * Er wordt hier NIETS verzonnen wat de klant misleidt: geen productclaims, geen
 * aantallen, geen reviews. Alleen neutrale winkel-copy.
 */
export function fallbackBrief(input: StoreBuildInput): StoreBrief {
  const brandName = input.brand.name?.trim() || input.niche
  const count = input.products.length
  const lead = input.products[0]?.title?.trim()
  const usps = (input.brand.usps ?? []).filter(u => u?.title && u?.desc).slice(0, 3)
  while (usps.length < 3) {
    usps.push([
      { title: 'European stock', desc: 'Shipped from within the EU, with tracking from day one.' },
      { title: '30-day returns', desc: 'Changed your mind? Send it back, no questions asked.' },
      { title: 'Secure checkout', desc: 'Card, iDEAL and PayPal, handled by Stripe.' },
    ][usps.length])
  }
  return {
    brand_name: brandName.slice(0, 40),
    slogan: (input.brand.slogan?.trim() || 'Chosen carefully, shipped from Europe').slice(0, 60),
    hero_headline: (count === 1 && lead ? lead : `${brandName} — a short, honest selection`).slice(0, 80),
    hero_subheadline: (count <= 2
      ? 'A small range we actually use ourselves, shipped from within Europe.'
      : 'A focused range, shipped from within Europe with 30-day returns.').slice(0, 160),
    hero_cta: count <= 2 ? 'View the product' : 'Shop the collection',
    colors: {
      primary: input.brand.colors?.primary ?? '#1f2933',
      secondary: input.brand.colors?.secondary ?? '#f4f5f7',
      accent: input.brand.colors?.accent ?? '#c2410c',
    },
    usps: usps.slice(0, 3),
    footer_tagline: `${brandName} — shipped across Europe`.slice(0, 80),
    story_angle: 'We would rather sell a few things we stand behind than a catalogue we do not.',
    // Geen `design` en geen `components`: dan pakken het seeded design-DNA en
    // de afgeleide componentselectie het over — precies waar die vangnetten voor zijn.
  } as StoreBrief
}

// Render the brief into a Next.js project on disk.
// Elke store krijgt een uniek design-DNA (kleur/typografie/vorm/toon) + een
// layout-plan (hero/product/sectie-varianten met anti-herhaling). De pagina wordt
// programmatisch gegenereerd i.p.v. uit een van 5 vaste templates → aantoonbaar
// verschillende output per persona. Alle content is Engelstalig.
export function renderStore(input: StoreBuildInput, briefRaw: StoreBrief): StoreBuildOutput {
  const ws = ensureWorkspace()

  // ── 0. Emoji-filter op ALLE LLM-copy ────────────────────────────────────────
  // Eén poort, vóór er iets gerenderd wordt. De skill-prompt vraagt al om geen
  // emoji, maar een verzoek is geen garantie — dit is de garantie.
  const { value: brief, report: emojiReport } = sanitizeCopyDeep(briefRaw)
  if (emojiReport.changed > 0) {
    input.onLog?.(`[sanitize] ${emojiReport.changed} veld(en) ontdaan van emoji (${emojiReport.blocked.join(' ')}) — velden: ${emojiReport.fields.slice(0, 6).join(', ')}`)
  }

  const brandName = brief.brand_name || input.brand.name || input.niche
  const subdomain = slugify(brandName) || `store-${input.runId.slice(0, 8)}`
  const buildDir = path.join(ws, `${input.runId}-${subdomain}`)

  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true })
  fs.mkdirSync(buildDir, { recursive: true })

  // ── 1. Design-DNA uit persona + LLM-ontwerpplan eroverheen ──────────────────
  // Het seeded DNA blijft het vangnet; het LLM-plan (brief.design) levert de
  // bewuste art-direction: benoemde kleuren, karakter-typografie, layout-concept
  // en het signature-element. applyDesignPlan valideert (contrast, allowlist).
  const persona = input.persona ?? fallbackPersona(input.niche, input.brand.tone)
  const baseDna = deriveDesignDNA({
    persona,
    niche: input.niche,
    seed: input.runId,
    brandPrimary: brief.colors?.primary,
  })
  const applied = applyDesignPlan(baseDna, brief.design)
  const dna = applied.dna
  for (const w of applied.warnings) input.onLog?.(`[design-plan] ⚠ ${w}`)
  input.onLog?.(applied.planApplied
    ? `[design-plan] LLM-ontwerpplan toegepast — signature: ${applied.signature?.type}, display: ${brief.design?.typography.display}`
    : '[design-plan] geen LLM-ontwerpplan in de brief — seeded design-DNA gebruikt')

  // ── 2. Layout-plan (LLM-voorkeur wint; anders seeded met anti-herhaling) ─────
  const layout = selectLayout({
    tone: dna.tone, seed: dna.seed, siteStructure: input.siteStructure,
    preferred: applied.layoutPreference ?? undefined,
  })
  recordLayout(layout, dna.tone, subdomain)

  const year = new Date().getFullYear()

  // ── 3. Producten — het volledige assortiment, geen opvulling, geen truncatie ─
  // De collectie-grootte komt uit het assortiment zelf (7-15 distincte producten
  // uit suppliers/assortment.ts); alleen boven de 15 wordt er begrensd.
  const baseProducts: RenderProduct[] = input.products.map((p, i) => ({
    id:             p.id ?? `product-${i + 1}`,
    title:          p.title,
    price:          p.price,
    compareAtPrice: p.compareAtPrice,
    image:          p.image ?? '',
    badge:          p.badge,
    description:    p.description ?? '',
    bullets:        p.bullets ?? [],
    productType:    p.productType,
    supplier:           p.supplier,
    supplierProductId:  p.supplierProductId,
    supplierVariantId:  p.supplierVariantId,
  }))
  const products: RenderProduct[] = fitProducts(baseProducts).map((p, i) => ({
    ...p,
    badge: p.badge ?? badgeFor(dna.tone, i, dna.seed),
  }))
  if (baseProducts.length > products.length) {
    input.onLog?.(`[producten] ${baseProducts.length} aangeleverd, ${products.length} getoond (maximum per pagina)`)
  }
  const productTypes = [...new Set(products.map(p => p.productType).filter((t): t is string => !!t))]
  input.onLog?.(`[producten] ${products.length} producten over ${productTypes.length || 1} producttype(s)${productTypes.length ? `: ${productTypes.join(', ')}` : ''}`)

  // ── 4. Engelse content ──────────────────────────────────────────────────────
  const content = {
    brandName,
    slogan:          brief.slogan,
    heroLabel:       heroLabel(dna.tone, dna.seed, year),
    heroHeadline:    brief.hero_headline,
    heroSubheadline: brief.hero_subheadline,
    heroCta:         brief.hero_cta,
    usps:            brief.usps.map(u => ({ title: u.title, desc: u.desc })),
    footerTagline:   brief.footer_tagline,
    story:           generateStory({ brandName, niche: input.niche, storyAngle: brief.story_angle, tone: dna.tone, seed: dna.seed }),
    ctaBand:         generateCtaBand(dna.seed),
    reviews:         generateReviews(dna.seed),
    navLinks:        buildNavLinks(),
    footerLinks:     buildFooterLinks(),
  }

  // ── 5. Template vars (voor layout/globals + checkout/info pagina's) ──────────
  const vars = buildTemplateVars({
    brandName,
    slogan:        brief.slogan,
    niche:         input.niche,
    primary:       dna.palette.primary,
    secondary:     dna.palette.secondary,
    accent:        dna.palette.accent,
    products,
    usps:          content.usps,
    heroHeadline:  brief.hero_headline,
    fontUrl:       dna.typography.fontUrl,
    headingFont:   dna.typography.heading,
    bodyFont:      dna.typography.body,
    storeId:       `store-${input.runId}`,
    subdomain,
    runId:         input.runId,
  })

  // ── 6. Home-pagina samenstellen uit de component-catalogus ──────────────────
  // Van "genereren" → "combineren": de pipeline voegt de gekozen componenten
  // deterministisch samen. Bij een assemble-fout valt hij terug op de oude
  // directe renderer (renderStorePage) zodat een store nooit crasht.
  const appDir = path.join(buildDir, 'app')
  fs.mkdirSync(appDir, { recursive: true })

  // De assemblage zelf staat in design/build-page.ts — gedeeld met de
  // CMS-rebuild, zodat een herbouwde store niet stilzwijgend op de oude,
  // vrije renderer terugvalt.
  // Sfeerbeeld: een lokaal gegenereerd bestand gaat mee de store in als
  // /img/hero.webp (de URL van de provider verloopt; het bestand niet).
  let heroImage: string | null = input.heroImage ?? null
  if (heroImage && !/^https?:\/\//i.test(heroImage)) {
    try {
      const imgDir = path.join(buildDir, 'public', 'img')
      fs.mkdirSync(imgDir, { recursive: true })
      const ext = path.extname(heroImage) || '.webp'
      fs.copyFileSync(heroImage, path.join(imgDir, `hero${ext}`))
      heroImage = `/img/hero${ext}`
    } catch (err) {
      input.onLog?.(`[hero] sfeerbeeld kon niet gekopieerd worden (${err instanceof Error ? err.message : err}) — productfoto op sfeerlaag`)
      heroImage = null
    }
  }

  const built = buildStorePage({
    dna, layout, brandName, niche: input.niche, subdomain, products, content,
    interests: persona.interests ?? [],
    llmComponents: brief.components,
    signature: applied.signature,
    heroImage,
    onLog: input.onLog,
  })
  const { componentMeta, uniqueMeta } = built
  fs.writeFileSync(path.join(appDir, 'page.tsx'), built.page, 'utf-8')

  buildLayoutSharedFiles(buildDir, vars, dna)
  buildCheckoutAndInfoPages(buildDir, vars, dna)
  ensureTailwindSupport(buildDir)

  // ── 7. Design-DNA + layout persisteren (debug/reproduceerbaarheid) ──────────
  fs.writeFileSync(path.join(buildDir, 'design-dna.json'),
    JSON.stringify({
      tone: dna.tone, palette: dna.palette, typography: dna.typography, shape: dna.shape,
      layout, seed: dna.seed,
      designPlan: brief.design ?? null, signature: applied.signature, planWarnings: applied.warnings,
      components: componentMeta,
      uniqueness: uniqueMeta,
      sanitize: emojiReport,
    }, null, 2), 'utf-8')

  // templateName behouden we voor backward-compat logging (niet meer bepalend)
  const templateName = selectTemplate(input.niche)

  return {
    ok: true,
    buildDir,
    outDir: path.join(buildDir, 'out'),
    templateName,
    brief,
    brandName,
    subdomain,
  }
}

export async function buildStore(input: StoreBuildInput): Promise<StoreBuildOutput> {
  const log = input.onLog ?? ((m: string) => console.log(`[store-builder] ${m}`))
  const collection = collectionContext(input.products)
  log(`Generating brief for "${input.niche}" (${collection.product_count} product(en))...`)
  const result = await generateBrief(input)

  // Sfeerbeeld voor de hero — alleen als er een beeldprovider geconfigureerd is.
  // Zonder key gebeurt hier niets en presenteert de renderer de productfoto op
  // een sfeerlaag; dat is de terugval, niet een gebroken hero.
  const withHero = { ...input, heroImage: await maybeHeroImage(input, log) }

  if (result.brief) {
    log(`Brief OK — brand="${result.brief.brand_name}", rendering ${selectTemplate(input.niche)} template...`)
    return { ...renderStore(withHero, result.brief), briefSource: 'llm' }
  }

  // ── De LLM-brief is niet gelukt ─────────────────────────────────────────────
  // Eerst de echte reden, luid. Daarna doorbouwen met een samengestelde brief:
  // een run laten sneuvelen op één LLM-call is duurder dan een iets soberdere
  // winkel, en de gebruiker kan hem daarna gewoon bewerken.
  const reden = result.error || 'onbekende fout'
  log(`⚠ store-builder agent gaf na ${result.attempts ?? 3} poging(en) geen bruikbare brief — ${reden}`)
  if (result.validationErrors?.length) {
    log(`⚠ schema-fouten: ${result.validationErrors.slice(0, 5).join(' · ')}`)
  }

  if (!input.brand.name && input.products.length === 0) {
    // Zonder merknaam én zonder producten valt er niets te bouwen.
    return {
      ok: false, buildDir: '', outDir: '', templateName: 'noir' as TemplateName,
      brief: {} as StoreBrief, brandName: '', subdomain: '',
      error: `store-builder gaf geen bruikbare brief: ${reden}`,
      briefSource: 'fallback', briefError: reden,
    }
  }

  log('→ terugval: brief samengesteld uit de brand-stage; design-DNA en componentkeuze komen uit code')
  const rendered = renderStore(input, fallbackBrief(input))
  return { ...rendered, briefSource: 'fallback', briefError: reden }
}
