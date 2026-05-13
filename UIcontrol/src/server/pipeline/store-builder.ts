import path from 'path'
import fs from 'fs'
import os from 'os'
import { runAgent, z } from './agent.js'
import { applyTemplate, buildLayoutSharedFiles, buildTemplateVars, selectTemplate } from '../store-platform/template-engine.js'
import type { TemplateName } from '../store-platform/template-engine.js'

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
}).passthrough()

export type StoreBrief = z.infer<typeof StoreBriefSchema>

export interface StoreBuildInput {
  runId: string
  niche: string
  brand: {
    name?: string
    slogan?: string
    colors?: { primary?: string; secondary?: string; accent?: string }
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
    model: 'deepseek-reasoner',
    input: {
      niche: input.niche,
      previous_agent_output: { brand: input.brand, products: input.products },
    },
    outputSchema: StoreBriefSchema,
    timeoutMs: 240_000,
    retries: 3,
    onLog: input.onLog ? (lvl, m) => input.onLog!(`[${lvl}] ${m}`) : undefined,
  })

  if (!result.ok || !result.parsed) return null
  return result.parsed
}

// Render the brief into a Next.js project on disk
export function renderStore(input: StoreBuildInput, brief: StoreBrief): StoreBuildOutput {
  const ws = ensureWorkspace()
  const brandName = brief.brand_name || input.brand.name || input.niche
  const subdomain = slugify(brandName) || `store-${input.runId.slice(0, 8)}`
  const buildDir = path.join(ws, `${input.runId}-${subdomain}`)

  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true })
  fs.mkdirSync(buildDir, { recursive: true })

  const templateName = selectTemplate(input.niche)
  const products = input.products.slice(0, 3).map((p, i) => ({
    id:             p.id ?? `product-${i + 1}`,
    title:          p.title,
    price:          p.price,
    compareAtPrice: p.compareAtPrice,
    image:          p.image ?? '',
    badge:          p.badge ?? (i === 0 ? 'Bestseller' : i === 1 ? 'Nieuw' : ''),
    description:    p.description ?? '',
    bullets:        p.bullets ?? [],
  }))

  const vars = buildTemplateVars({
    brandName,
    slogan:        brief.slogan,
    niche:         input.niche,
    primary:       brief.colors.primary,
    secondary:     brief.colors.secondary,
    accent:        brief.colors.accent,
    products,
    usps:          brief.usps.map(u => ({ title: u.title, desc: u.desc })),
    heroHeadline:  brief.hero_headline,
    fontUrl:       'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Playfair+Display:wght@700&display=swap',
    headingFont:   '"Playfair Display", serif',
    bodyFont:      '"Inter", system-ui, sans-serif',
  })

  applyTemplate(buildDir, templateName, vars)
  buildLayoutSharedFiles(buildDir, vars)

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
