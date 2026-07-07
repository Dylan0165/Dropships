import { z } from 'zod'
import { runAgent } from './agent.js'
import { runReviewer, type ReviewerOutputSchema } from './reviewer.js'
import { buildStore } from './store-builder.js'
import { deployStore, healthCheck, buildSubdomain } from './deployer.js'
import { validateAndBuild } from '../store-platform/build-validator.js'
import { saveStageOutput, claimPort, upsertStore, updateStoreHealth } from '../db.js'
import { v4 as uuid } from 'uuid'
import type { Stage } from './types.js'

// ─── Schemas per executor stage ──────────────────────────────────────────────

const TrendDiscoverySchema = z.object({
  niches: z.array(z.object({
    name: z.string(),
    trending_score: z.number().min(0).max(100),
    reasoning: z.string().optional(),
  })).min(1),
}).passthrough()

const ProductResearchSchema = z.object({
  products: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    price: z.number().positive(),
    cost_price: z.number().positive().optional(),
    compare_at_price: z.number().positive().optional(),
    margin: z.number().optional(),
    shipping_days: z.number().int().nonnegative().optional(),
    image: z.string().url().optional().or(z.literal('')),
    supplier: z.string().optional(),
  })).min(1).max(10),
}).passthrough()

const BrandSchema = z.object({
  brand_name: z.string().min(1),
  slogan: z.string().min(1),
  tone_of_voice: z.string().min(1),
  colors: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  }),
  usps: z.array(z.object({ title: z.string(), desc: z.string() })).min(3),
}).passthrough()

const ContentSchema = z.object({
  products: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().min(20),
    bullets: z.array(z.string()).min(3),
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  })).min(1),
}).passthrough()


// ─── Stage definitions ───────────────────────────────────────────────────────

export interface StageContext {
  runId: string
  niche: string
  previous: Record<string, unknown>
  onLog: (msg: string) => void
}

export interface StageOutput {
  ok: boolean
  output?: Record<string, unknown>
  error?: string
  verdict?: 'APPROVED' | 'REJECTED' | 'UNCERTAIN'
  reason?: string
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  meta?: Record<string, unknown>
}

// Executor stages: simply call runAgent with appropriate schema + skill
async function runExecutorStage(
  ctx: StageContext,
  stage: Stage,
  agentName: string,
  skillName: string,
  schema: z.ZodTypeAny,
  model: string = process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
): Promise<StageOutput> {
  const r = await runAgent({
    runId: ctx.runId, stage, agentName, skillName, model,
    input: { niche: ctx.niche, previous_agent_output: ctx.previous },
    outputSchema: schema,
    onLog: (lvl, m) => ctx.onLog(`[${lvl}] ${m}`),
  })
  if (!r.ok || !r.output) {
    return {
      ok: false, error: r.error ?? 'agent failed',
      tokensIn: r.inputTokens, tokensOut: r.outputTokens, costUsd: r.costUsd,
    }
  }
  saveStageOutput(ctx.runId, stage, r.output)
  return {
    ok: true, output: r.output,
    tokensIn: r.inputTokens, tokensOut: r.outputTokens, costUsd: r.costUsd,
  }
}

async function runReviewerStage(
  ctx: StageContext,
  stage: Stage,
  agentName: string,
  skillName: string,
): Promise<StageOutput> {
  const r = await runReviewer({
    runId: ctx.runId, stage, agentName, skillName,
    input: { niche: ctx.niche, previous_agent_output: ctx.previous },
    onLog: (lvl, m) => ctx.onLog(`[${lvl}] ${m}`),
  })
  if (!r.ok || !r.verdict) {
    return {
      ok: false, error: r.error ?? 'reviewer failed',
      tokensIn: r.inputTokens, tokensOut: r.outputTokens, costUsd: r.costUsd,
    }
  }
  saveStageOutput(ctx.runId, stage, r.output as Record<string, unknown>)
  return {
    ok: true, output: r.output as Record<string, unknown>,
    verdict: r.verdict.verdict,
    reason: r.verdict.reason,
    tokensIn: r.inputTokens, tokensOut: r.outputTokens, costUsd: r.costUsd,
  }
}

// ─── Per-stage runners ───────────────────────────────────────────────────────

export const STAGE_RUNNERS: Record<Stage, (ctx: StageContext) => Promise<StageOutput>> = {
  'trend-discovery': (ctx) =>
    runExecutorStage(ctx, 'trend-discovery', 'trend-agent', 'trend-agent', TrendDiscoverySchema, process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat'),

  'niche-review': (ctx) =>
    runReviewerStage(ctx, 'niche-review', 'niche-reviewer', 'niche-reviewer'),

  'product-research': (ctx) =>
    runExecutorStage(ctx, 'product-research', 'product-agent', 'product-agent', ProductResearchSchema, process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat'),

  'product-review': (ctx) =>
    runReviewerStage(ctx, 'product-review', 'product-reviewer', 'product-reviewer'),

  'brand-creation': (ctx) =>
    runExecutorStage(ctx, 'brand-creation', 'brand-agent', 'brand-agent', BrandSchema, process.env.LLM_MODEL_BRAND ?? 'deepseek-chat'),

  'content-generation': (ctx) =>
    runExecutorStage(ctx, 'content-generation', 'content-agent', 'content-agent', ContentSchema, process.env.LLM_MODEL_CONTENT ?? 'deepseek-chat'),

  'store-build': async (ctx) => {
    ctx.onLog('Calling store-builder...')
    const brand = (ctx.previous.brand_agent as Record<string, unknown>) ?? (ctx.previous.brand as Record<string, unknown>) ?? {}
    const productsRaw = ((ctx.previous.product_agent as Record<string, unknown>)?.products
      ?? (ctx.previous.products as unknown[])
      ?? []) as Array<Record<string, unknown>>
    const contentMap = new Map<string, Record<string, unknown>>()
    const contentProducts = ((ctx.previous.content_agent as Record<string, unknown>)?.products
      ?? []) as Array<Record<string, unknown>>
    for (const c of contentProducts) {
      const id = (c.id as string) ?? (c.title as string)
      if (id) contentMap.set(id, c)
    }

    const products = productsRaw.map(p => {
      const id = (p.id as string) ?? (p.title as string)
      const enriched = contentMap.get(id) ?? {}
      return {
        id: id ?? uuid(),
        title: (p.title as string) ?? (enriched.title as string) ?? 'Product',
        description: (enriched.description as string) ?? (p.description as string) ?? '',
        bullets: (enriched.bullets as string[]) ?? [],
        price: (p.price as number) ?? 29.99,
        compareAtPrice: p.compare_at_price as number | undefined,
        image: (p.image as string) ?? '',
        // Supplier koppeling (CJ pid/vid) — komt uit de wizard of product-research
        supplier: p.supplier as string | undefined,
        supplierProductId: (p.supplierProductId ?? p.supplier_product_id) as string | undefined,
        supplierVariantId: (p.supplierVariantId ?? p.supplier_variant_id) as string | undefined,
        costPrice: (p.costPrice ?? p.cost_price) as number | undefined,
      }
    })

    const build = await buildStore({
      runId: ctx.runId,
      niche: ctx.niche,
      brand: {
        name: brand.brand_name as string ?? brand.name as string,
        slogan: brand.slogan as string,
        colors: brand.colors as { primary?: string; secondary?: string; accent?: string },
      },
      products,
      onLog: (m) => ctx.onLog(m),
    })

    if (!build.ok) {
      return { ok: false, error: build.error ?? 'store-build failed' }
    }

    const output = {
      build_dir: build.buildDir,
      out_dir: build.outDir,
      template: build.templateName,
      brand_name: build.brandName,
      subdomain: buildSubdomain(build.brandName, ctx.runId),
      brief: build.brief,
    }
    saveStageOutput(ctx.runId, 'store-build', output)
    return { ok: true, output }
  },

  'build-validate': async (ctx) => {
    const buildDir = (ctx.previous.store_build as Record<string, unknown>)?.build_dir as string
    if (!buildDir) return { ok: false, error: 'no build_dir from store-build' }
    const result = await validateAndBuild(buildDir, ctx.onLog)
    saveStageOutput(ctx.runId, 'build-validate', { ok: result.ok, phase: result.phase, log: result.log.slice(-2000) })
    if (!result.ok) return { ok: false, error: `${result.phase}: ${result.log.slice(-500)}` }
    return { ok: true, output: { phase: result.phase } }
  },

  'deploy': async (ctx) => {
    const buildOut = ctx.previous.store_build as Record<string, unknown>
    const outDir   = buildOut?.out_dir as string
    const subdomain = buildOut?.subdomain as string
    if (!outDir || !subdomain) return { ok: false, error: 'no out_dir/subdomain from store-build' }

    // Deterministic storeId per run so port claims are idempotent on resume
    const storeId = `store-${ctx.runId}`
    const result = await deployStore(
      { subdomain, buildOutDir: outDir, storeId },
      ctx.onLog,
    )
    if (!result.ok) return { ok: false, error: result.error ?? 'deploy failed' }

    const output = {
      store_id: storeId,
      subdomain,
      port: result.port,
      release_dir: result.releaseDir,
      preview_url: result.previewUrl,
    }
    saveStageOutput(ctx.runId, 'deploy', output)
    upsertStore({
      storeId, runId: ctx.runId, subdomain, niche: ctx.niche,
      previewUrl: result.previewUrl, port: result.port, status: 'building',
    })
    return { ok: true, output, meta: { storeId, storeUrl: result.previewUrl } }
  },

  'health-check': async (ctx) => {
    const deployOut = ctx.previous.deploy as Record<string, unknown>
    const url = deployOut?.preview_url as string
    const storeId = deployOut?.store_id as string
    if (!url) return { ok: false, error: 'no preview_url from deploy' }
    const hc = await healthCheck(url)
    saveStageOutput(ctx.runId, 'health-check', { ...hc })
    if (storeId) {
      updateStoreHealth(storeId, {
        status: hc.ok ? 'live' : 'failed',
        healthStatus: hc.ok ? 'up' : 'down',
        error: hc.error,
      })
    }
    if (!hc.ok) return { ok: false, error: hc.error ?? `health check failed after ${hc.attempts} attempts` }
    return { ok: true, output: { url, attempts: hc.attempts, status_code: hc.statusCode } }
  },

}
