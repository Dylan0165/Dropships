import path from 'path'
import fs from 'fs'
import os from 'os'
import { runAgent, z } from './agent.js'
import { buildLayoutSharedFiles, buildTemplateVars, buildCheckoutAndInfoPages, ensureTailwindSupport, selectTemplate } from '../store-platform/template-engine.js'
import type { TemplateName } from '../store-platform/template-engine.js'
import { deriveDesignDNA, fallbackPersona, type PersonaLike } from '../design/tokens.js'
import { DesignPlanSchema, applyDesignPlan } from '../design/design-plan.js'
import { selectLayout, recordLayout, deriveProductCount, fitProducts } from '../design/layout.js'
import { renderStorePage, type RenderProduct } from '../design/render-page.js'
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
    // Supplier koppeling — nodig voor automatische fulfillment na checkout
    supplier?: string
    supplierProductId?: string
    supplierVariantId?: string
    costPrice?: number
  }>
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

// Call store-builder skill to generate the brief
export async function generateBrief(input: StoreBuildInput): Promise<StoreBrief | null> {
  const result = await runAgent({
    runId: input.runId,
    stage: 'store-build',
    agentName: 'store-builder',
    skillName: 'store-builder',
    model: process.env.LLM_MODEL_STORE ?? 'deepseek-reasoner',
    input: {
      niche: input.niche,
      previous_agent_output: { brand: input.brand, products: input.products },
      // Persona + site-structuur uit de wizard sturen de creatieve richting
      ...(input.persona ? { doelgroep_persona: input.persona } : {}),
      ...(input.siteStructure ? { site_structuur: input.siteStructure } : {}),
    },
    outputSchema: StoreBriefSchema,
    timeoutMs: 240_000,
    retries: 3,
    // Creatieve stap → hogere temperature voor meer variatie tussen stores
    temperature: 0.9,
    onLog: input.onLog ? (lvl, m) => input.onLog!(`[${lvl}] ${m}`) : undefined,
  })

  if (!result.ok || !result.parsed) return null
  return result.parsed
}

// Render the brief into a Next.js project on disk.
// Elke store krijgt een uniek design-DNA (kleur/typografie/vorm/toon) + een
// layout-plan (hero/product/sectie-varianten met anti-herhaling). De pagina wordt
// programmatisch gegenereerd i.p.v. uit een van 5 vaste templates → aantoonbaar
// verschillende output per persona. Alle content is Engelstalig.
export function renderStore(input: StoreBuildInput, brief: StoreBrief): StoreBuildOutput {
  const ws = ensureWorkspace()
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

  // ── 3. Producten — collectie-grootte varieert 6-15 per store ────────────────
  const targetCount = deriveProductCount(dna.seed, input.siteStructure?.nicheType)
  const baseProducts: RenderProduct[] = input.products.map((p, i) => ({
    id:             p.id ?? `product-${i + 1}`,
    title:          p.title,
    price:          p.price,
    compareAtPrice: p.compareAtPrice,
    image:          p.image ?? '',
    badge:          p.badge,
    description:    p.description ?? '',
    bullets:        p.bullets ?? [],
    supplier:           p.supplier,
    supplierProductId:  p.supplierProductId,
    supplierVariantId:  p.supplierVariantId,
  }))
  const products: RenderProduct[] = fitProducts(baseProducts, targetCount, dna.seed).map((p, i) => ({
    ...p,
    badge: p.badge ?? badgeFor(dna.tone, i, dna.seed),
  }))

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

  // ── 6. Schrijf de gegenereerde page + shared files ──────────────────────────
  const appDir = path.join(buildDir, 'app')
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(path.join(appDir, 'page.tsx'), renderStorePage(dna, layout, content, products, applied.signature), 'utf-8')

  buildLayoutSharedFiles(buildDir, vars)
  buildCheckoutAndInfoPages(buildDir, vars)
  ensureTailwindSupport(buildDir)

  // ── 7. Design-DNA + layout persisteren (debug/reproduceerbaarheid) ──────────
  fs.writeFileSync(path.join(buildDir, 'design-dna.json'),
    JSON.stringify({ tone: dna.tone, palette: dna.palette, typography: dna.typography, shape: dna.shape, layout, seed: dna.seed }, null, 2), 'utf-8')

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
  log(`Generating brief for "${input.niche}"...`)
  const brief = await generateBrief(input)
  if (!brief) {
    return {
      ok: false, buildDir: '', outDir: '', templateName: 'noir' as TemplateName,
      brief: {} as StoreBrief, brandName: '', subdomain: '',
      error: 'brief generation failed',
    }
  }
  log(`Brief OK — brand="${brief.brand_name}", rendering ${selectTemplate(input.niche)} template...`)
  return renderStore(input, brief)
}
