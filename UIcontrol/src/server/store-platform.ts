/**
 * Store deployment platform.
 *
 * Two modes:
 *   - LOCAL  (default, no STORE_SERVER_HOST set):
 *       Writes a generated static store to ./data/stores/{subdomain}/ and serves
 *       it from http://localhost:{PLATFORM_PORT}/preview/{subdomain}.
 *       status = 'local'.
 *
 *   - REMOTE (STORE_SERVER_HOST set):
 *       Generates a Next.js project scaffold in the OS tmp dir, runs
 *       `npm install && next build`, scp's the build artefacts to the store VPS,
 *       writes an nginx vhost, and reloads nginx via SSH.
 *       status = 'live'.
 *
 * Templates are copied from Websitecomponentscodes/ and have these placeholders
 * replaced: {{BRAND_NAME}}, {{SLOGAN}}, {{PRIMARY_COLOR}}, {{PRODUCTS_JSON}}.
 */
import './load-env.js'
import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import db, { saveAgentOutput as _saveAgentOutput, allocatePort, reservePort } from './db.js'
import {
  buildLayoutSharedFiles, buildTemplateVars,
  buildCheckoutAndInfoPages, ensureTailwindSupport, esc,
} from './store-platform/template-engine.js'
import { deriveDesignDNA, fallbackPersona } from './design/tokens.js'
import { selectLayout, recordLayout, deriveProductCount, fitProducts } from './design/layout.js'
import { renderStorePage, type RenderProduct } from './design/render-page.js'
import {
  generateReviews, generateStory, generateCtaBand,
  buildNavLinks, buildFooterLinks, heroLabel, badgeFor,
} from './design/content-en.js'
import { validateAndBuild } from './store-platform/build-validator.js'
import { atomicDeploy, scanDeployedStores } from './store-platform/deploy.js'
void _saveAgentOutput

// ── Supplier Adapter Pattern ──────────────────────────────────────────────────
// De supplier-laag (CJ Dropshipping e.a.) leeft in ./suppliers/ en wordt hier
// ge-re-exporteerd zodat store-platform het canonieke importpunt is:
//   import { getSupplier, type SupplierAdapter } from './store-platform.js'
export { getSupplier, listSuppliers, CJAdapter } from './suppliers/index.js'
export type {
  SupplierAdapter, SupplierProduct, SupplierOrderData,
  PlacedOrder, TrackingInfo, InventoryInfo, ProductSearchOptions,
} from './suppliers/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../')
const PORT = parseInt(process.env.PLATFORM_PORT ?? '3002', 10)
const STORE_SERVER_HOST = process.env.STORE_SERVER_HOST || ''
const STORE_SERVER_USER = process.env.STORE_SERVER_USER || 'deploy'
const STORE_SSH_KEY_PATH = process.env.STORE_SSH_KEY_PATH || ''
const STORE_BASE_DOMAIN = process.env.STORE_BASE_DOMAIN || 'localhost'
const LOCAL_STORES_DIR = path.resolve(workspaceRoot, 'UIcontrol/data/stores')
const TMP_BUILD_DIR = path.join(os.tmpdir(), 'stores')

// Max producten per store — collectie varieert per store (6-15). Deze cap is de
// bovengrens op wat er de renderer in gaat; de renderer kiest het exacte aantal.
const MAX_PRODUCTS_PER_STORE = parseInt(process.env.MAX_PRODUCTS_PER_STORE ?? '15', 10)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreProduct {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
  // Supplier koppeling voor automatische fulfillment
  supplier?: string
  supplierProductId?: string
  supplierVariantId?: string
}

export interface StoreData {
  brand_name: string
  niche: string
  slogan: string
  primary_color?: string   // hex, e.g. '#7c3aed'
  products: StoreProduct[]
  subdomain?: string       // optional override; auto-generated from brand_name otherwise
  runId?: string           // optional pipeline run association
  storeId?: string         // pre-assigned store ID (filled in after uuid generation)
  checkoutUrl?: string     // Mollie checkout URL — replaces {{CHECKOUT_URL}}
  imageUrls?: string[]     // Flux image URLs — replaces {{PRODUCT_IMAGE_1}} etc.
}

export interface DeployedStore {
  storeId: string
  subdomain: string
  niche: string
  status: 'local' | 'live' | 'building' | 'failed'
  previewUrl: string
  filesPath: string
  createdAt: string
  errorMessage?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// esc komt uit template-engine — de ENIGE escaping-definitie in de codebase.
// Nooit lokaal her-definiëren; dat veroorzaakte eerder "esc is not defined"
// drift tussen versies van dit bestand en de template-engine.

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'store'
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function rmDirRecursive(p: string): void {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

// CMS-rebuild / standalone deploy pad. Gebruikt dezelfde design-DNA +
// variant-renderer als de pipeline (renderStore), zodat óók herbouwde stores
// uniek + Engelstalig zijn — geen vaste .tmpl templates meer.
async function writeNextScaffold(targetDir: string, data: StoreData): Promise<void> {
  ensureDir(path.join(targetDir, 'app'))
  ensureDir(path.join(targetDir, 'public'))

  const d = data as StoreData & { colors?: Record<string, string>; hero_headline?: string }
  const primary = d.colors?.primary ?? d.primary_color ?? undefined

  // Geen persona beschikbaar in dit pad → afgeleid van de niche (seeded op subdomain)
  const persona = fallbackPersona(data.niche)
  const seed = data.runId || data.storeId || data.subdomain || data.brand_name
  const dna = deriveDesignDNA({ persona, niche: data.niche, seed, brandPrimary: primary })
  const layout = selectLayout({ tone: dna.tone, seed: dna.seed })
  recordLayout(layout, dna.tone, data.subdomain ?? data.brand_name)

  const year = new Date().getFullYear()
  // Collectie-grootte varieert 6-15 per store (zelfde logica als de pipeline)
  const targetCount = deriveProductCount(dna.seed)
  const baseProducts: RenderProduct[] = data.products.map(p => ({
    id: p.id, title: p.title, image: p.image ?? '', price: p.price,
    compareAtPrice: p.compareAtPrice, badge: p.badge,
    supplier: p.supplier, supplierProductId: p.supplierProductId, supplierVariantId: p.supplierVariantId,
  }))
  const products: RenderProduct[] = fitProducts(baseProducts, targetCount, dna.seed).map((p, i) => ({
    ...p,
    badge: p.badge ?? badgeFor(dna.tone, i, dna.seed),
  }))

  const content = {
    brandName:       data.brand_name,
    slogan:          data.slogan,
    heroLabel:       heroLabel(dna.tone, dna.seed, year),
    heroHeadline:    d.hero_headline ?? data.slogan ?? data.brand_name,
    heroSubheadline: data.slogan ?? '',
    heroCta:         'Shop now',
    usps:            defaultUspsEn(),
    footerTagline:   data.slogan ?? data.brand_name,
    // Geen storyAngle hier (CMS-rebuild heeft geen LLM-brief) → generieke
    // Engelse fallback. NOOIT persona.problem doorgeven: dat is rauwe
    // (vaak Nederlandse) wizard-input.
    story:           generateStory({ brandName: data.brand_name, niche: data.niche, tone: dna.tone, seed: dna.seed }),
    ctaBand:         generateCtaBand(dna.seed),
    reviews:         generateReviews(dna.seed),
    navLinks:        buildNavLinks(),
    footerLinks:     buildFooterLinks(),
  }

  const vars = buildTemplateVars({
    brandName:    data.brand_name,
    slogan:       data.slogan,
    niche:        data.niche,
    primary:      dna.palette.primary,
    secondary:    dna.palette.secondary,
    accent:       dna.palette.accent,
    products:     data.products,
    usps:         content.usps,
    heroHeadline: content.heroHeadline,
    fontUrl:      dna.typography.fontUrl,
    headingFont:  dna.typography.heading,
    bodyFont:     dna.typography.body,
    storeId:      data.storeId ?? (data.subdomain ? `store-${data.subdomain}` : 'store'),
    subdomain:    data.subdomain ?? '',
    runId:        data.runId ?? '',
  })

  fs.writeFileSync(path.join(targetDir, 'app', 'page.tsx'), renderStorePage(dna, layout, content, products), 'utf-8')
  buildLayoutSharedFiles(targetDir, vars)
  buildCheckoutAndInfoPages(targetDir, vars)
  ensureTailwindSupport(targetDir)

  console.log(`[store-platform] Store gegenereerd (tone=${dna.tone}, hero=${layout.hero}) voor ${data.brand_name}`)
}

function defaultUspsEn(): Array<{ title: string; desc: string }> {
  return [
    { title: 'Free EU shipping', desc: 'On every order across NL, BE, DE and FR.' },
    { title: '30-day returns', desc: 'Not for you? Send it back, no hassle.' },
    { title: 'Secure checkout', desc: 'iDEAL, Bancontact, credit card and PayPal.' },
  ]
}

// ── SEO assets ───────────────────────────────────────────────────────────────

function buildSitemapXml(subdomain: string, baseUrl: string): string {
  const now = new Date().toISOString().slice(0, 10)
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/products</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/about</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`
}

function buildRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`
}

function buildJsonLd(data: StoreData, baseUrl: string): string {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: data.brand_name,
    url: baseUrl,
    description: data.slogan,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
  return JSON.stringify(org, null, 2)
}

function writeSeoFiles(targetDir: string, data: StoreData, baseUrl: string): void {
  fs.writeFileSync(path.join(targetDir, 'sitemap.xml'), buildSitemapXml(data.subdomain ?? '', baseUrl), 'utf-8')
  fs.writeFileSync(path.join(targetDir, 'robots.txt'), buildRobotsTxt(baseUrl), 'utf-8')
  fs.writeFileSync(path.join(targetDir, 'schema.json'), buildJsonLd(data, baseUrl), 'utf-8')
}

/** Static fallback HTML used by local preview when there is no Next.js build. */
function buildStaticPreviewHtml(data: StoreData): string {
  const color = data.primary_color || '#7c3aed'
  const productsHtml = data.products.map(p => `
    <article class="card">
      ${p.image ? `<img src="${p.image}" alt="${esc(p.title)}" />` : ''}
      <div class="card-body">
        <h3>${esc(p.title)}</h3>
        <div class="price">€${p.price.toFixed(2)}${p.compareAtPrice ? ` <s>€${p.compareAtPrice.toFixed(2)}</s>` : ''}</div>
        <button>Add to cart</button>
      </div>
    </article>`).join('\n')

  const canonicalUrl = data.subdomain
    ? `https://${data.subdomain}.${STORE_BASE_DOMAIN}`
    : `http://localhost:${PORT}/preview/${slugify(data.brand_name)}`
  const firstImage = data.imageUrls?.[0] ?? ''
  const clarityId  = process.env.CLARITY_PROJECT_ID ?? ''
  const clarityScript = clarityId
    ? `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}");</script>`
    : ''

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.brand_name)} — ${esc(data.slogan)}</title>
<meta name="description" content="${esc(data.slogan)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(data.brand_name)}">
<meta property="og:description" content="${esc(data.slogan)}">
<meta property="og:url" content="${canonicalUrl}">
${firstImage ? `<meta property="og:image" content="${firstImage}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(data.brand_name)}">
<meta name="twitter:description" content="${esc(data.slogan)}">
<script type="application/ld+json">
${buildJsonLd(data, canonicalUrl)}
</script>
${clarityScript}
<style>
  :root { --brand: ${color}; }
  * { box-sizing: border-box }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; background: #fff }
  header { padding: 1rem 2rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center }
  .brand { font-weight: 700; font-size: 1.25rem; color: var(--brand) }
  .hero { padding: 5rem 2rem; text-align: center; background: linear-gradient(135deg, var(--brand), #1e293b); color: white }
  .hero h1 { font-size: clamp(2rem, 5vw, 4rem); margin: 0 0 1rem }
  .hero p { font-size: 1.25rem; opacity: 0.9; margin: 0 0 2rem }
  .cta { background: white; color: var(--brand); padding: 0.75rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block }
  .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); padding: 4rem 2rem; max-width: 1200px; margin: 0 auto }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; transition: box-shadow .2s }
  .card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.08) }
  .card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; background: #f1f5f9 }
  .card-body { padding: 1rem }
  .card h3 { margin: 0 0 0.5rem; font-size: 1rem }
  .price { font-weight: 700; margin-bottom: 0.75rem }
  .price s { font-weight: 400; color: #94a3b8; margin-left: 0.5rem }
  button { width: 100%; background: var(--brand); color: white; border: 0; padding: 0.6rem; border-radius: 6px; font-weight: 600; cursor: pointer }
  footer { padding: 2rem; border-top: 1px solid #e5e7eb; text-align: center; color: #64748b; font-size: 0.875rem }
</style></head>
<body>
<header><span class="brand">${esc(data.brand_name)}</span><nav>Shop · About · Contact</nav></header>
<section class="hero">
  <h1>${esc(data.brand_name)}</h1>
  <p>${esc(data.slogan)}</p>
  <a href="#products" class="cta">Shop now</a>
</section>
<section id="products"><div class="grid">${productsHtml}</div></section>
<footer>© ${new Date().getFullYear()} ${esc(data.brand_name)} — ${data.niche}</footer>
</body></html>`
}

// ── Sub-process helpers (with timeout) ───────────────────────────────────────

function runCmd(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(cmd, args, { cwd: options.cwd, shell: false })
    let stdout = '', stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: stderr + `\n[timeout after ${options.timeoutMs}ms]` })
    }, options.timeoutMs ?? 120_000)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + `\n[spawn error: ${err.message}]` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

// ── Remote deploy helpers (SSH for reconcileStores) ──────────────────────────

async function sshExec(command: string): Promise<{ ok: boolean; output: string }> {
  const sshArgs = STORE_SSH_KEY_PATH ? ['-i', STORE_SSH_KEY_PATH] : []
  const result = await runCmd('ssh', [...sshArgs, `${STORE_SERVER_USER}@${STORE_SERVER_HOST}`, command], { timeoutMs: 30_000 })
  return { ok: result.code === 0, output: result.stdout + result.stderr }
}

// ── Duplicate product guard ────────────────────────────────────────────────────
// Haal alle ECHTE supplier product IDs op die al in gebruik zijn door andere
// actieve stores. Leest uit store_data (de kolom die persistStore daadwerkelijk
// schrijft — de oude query las het nooit-geschreven products_json en draaide dus
// op verouderde/legacy data). Mock-producten (mock-*) tellen niet mee: hun IDs
// zijn deterministisch per niche, waardoor elke tweede run op hetzelfde idee
// onterecht "alles al in gebruik" gaf.
function getDeployedProductIds(): Set<string> {
  const used = new Set<string>()
  try {
    const rows = db.prepare(
      `SELECT store_data FROM stores WHERE status IN ('local','live') AND store_data IS NOT NULL`,
    ).all() as { store_data: string }[]
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.store_data) as { products?: Array<{ id?: string; supplierProductId?: string }> }
        for (const p of parsed.products ?? []) {
          const pid = p.supplierProductId ?? p.id
          if (pid && !pid.startsWith('mock-')) used.add(pid)
        }
      } catch { /* corrupte store_data overslaan */ }
    }
  } catch (err) {
    console.error('[store-platform] getDeployedProductIds failed:', err)
  }
  return used
}

export async function deployStore(storeData: StoreData): Promise<DeployedStore> {
  const storeId = uuid()
  const createdAt = new Date().toISOString()
  const subdomain = storeData.subdomain ?? slugify(storeData.brand_name)

  // ── Branded subdomain check: mag niet de niche zelf zijn ──────────────────
  // bijv. brand_name "VeloFlex" → subdomain "veloflex" ✓
  //       brand_name "Voetbal"  → subdomain "voetbal"  ✗ te generiek
  if (slugify(storeData.brand_name) === slugify(storeData.niche)) {
    console.warn(`[store-platform] Waarschuwing: brand_name "${storeData.brand_name}" is gelijk aan niche. Brand-agent moet een onderscheidende merknaam genereren.`)
  }

  // ── Max producten per store ────────────────────────────────────────────────
  const limitedProducts = storeData.products.slice(0, MAX_PRODUCTS_PER_STORE)
  if (storeData.products.length > MAX_PRODUCTS_PER_STORE) {
    console.log(`[store-platform] ${storeData.products.length} producten → beperkt tot ${MAX_PRODUCTS_PER_STORE} (branded store focus)`)
  }

  // ── Duplicate product preventie ───────────────────────────────────────────
  // Filtert alleen ECHTE supplier-producten die al in een andere actieve store
  // zitten (mock-producten tellen nooit mee). Deze guard BLOKKEERT een deploy
  // nooit: bij volledige overlap deployen we gewoon met de gekozen producten
  // en loggen we een duidelijke waarschuwing.
  const deployedIds = getDeployedProductIds()
  let uniqueProducts = limitedProducts.filter(p => {
    const pid = p.supplierProductId ?? p.id
    if (deployedIds.has(pid)) {
      console.log(`[store-platform] Product ${pid} (${p.title}) al in gebruik door andere store — overgeslagen`)
      return false
    }
    return true
  })
  if (uniqueProducts.length === 0) {
    uniqueProducts = limitedProducts
    console.warn('[store-platform] Alle gekozen producten zitten al in andere stores — deploy gaat door met dezelfde producten (bewuste keuze van de gebruiker in de wizard)')
  }

  const data = {
    ...storeData,
    products: uniqueProducts,
    subdomain,
    _storeId: storeId,
  }

  const isRemote = !!STORE_SERVER_HOST
  const baseDir = isRemote ? path.join(TMP_BUILD_DIR, subdomain) : path.join(LOCAL_STORES_DIR, subdomain)

  try {
    // STEP 1 — generate files
    rmDirRecursive(baseDir)
    ensureDir(baseDir)
    await writeNextScaffold(baseDir, data)
    fs.writeFileSync(path.join(baseDir, 'index.html'), buildStaticPreviewHtml(data), 'utf-8')
    fs.writeFileSync(path.join(baseDir, 'store.json'), JSON.stringify({ storeId, ...data, createdAt }, null, 2), 'utf-8')

    // SEO files
    const storeBaseUrl = isRemote
      ? `https://${subdomain}.${STORE_BASE_DOMAIN}`
      : `http://localhost:${PORT}/preview/${subdomain}`
    writeSeoFiles(baseDir, data, storeBaseUrl)

    if (!isRemote) {
      // LOCAL mode — done. Express serves the static preview.
      const previewUrl = `http://localhost:${PORT}/preview/${subdomain}`
      persistStore({ storeId, subdomain, niche: data.niche, status: 'local', previewUrl, filesPath: baseDir, createdAt }, storeData.runId)
      console.log(`[store-platform] local store ready: ${subdomain} → ${previewUrl}`)
      return { storeId, subdomain, niche: data.niche, status: 'local', previewUrl, filesPath: baseDir, createdAt }
    }

    // STEP 2 — npm install + next build (via build-validator)
    const buildResult = await validateAndBuild(baseDir, (msg) => console.log(`[store-platform] ${msg}`))
    if (!buildResult.ok) {
      console.error(`[store-platform] build failed for ${subdomain}:\n${buildResult.log.slice(-1000)}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: `build failed (${buildResult.phase})` }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    // STEP 3 — atomic deploy: symlink-based releases + nginx reload + auto-rollback
    // Scan de echte server-poorten zodat we er geen dubbel uitdelen (self-healing
    // bij een stale DB). Redeploy van hetzelfde subdomain hergebruikt zijn poort.
    let serverVhosts: Array<{ subdomain: string; port: number }> = []
    try {
      serverVhosts = await scanDeployedStores()
    } catch (err) {
      console.warn(`[store-platform] nginx port-scan overgeslagen: ${err instanceof Error ? err.message : String(err)}`)
    }
    const ownVhost = serverVhosts.find(v => v.subdomain === subdomain && v.port > 0)
    const reserved = serverVhosts.filter(v => v.subdomain !== subdomain && v.port > 0).map(v => v.port)

    let assignedPort: number
    try {
      assignedPort = ownVhost
        ? reservePort(storeId, ownVhost.port)
        : allocatePort(storeId, reserved)
      db.prepare('UPDATE stores SET port = ? WHERE store_id = ?').run(assignedPort, storeId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[store-platform] port-allocatie mislukt: ${msg}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: msg }
      persistStore(fallback, storeData.runId)
      return fallback
    }
    const deployRes = await atomicDeploy(
      subdomain,
      path.join(baseDir, 'out'),
      assignedPort,
      (msg) => console.log(`[store-platform] ${msg}`),
    )
    if (!deployRes.ok) {
      console.error(`[store-platform] atomicDeploy mislukt: ${deployRes.error}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: deployRes.error }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    const previewUrl = `https://${subdomain}.${STORE_BASE_DOMAIN}`
    const live = { storeId, subdomain, niche: data.niche, status: 'live' as const,
      previewUrl, filesPath: baseDir, createdAt }
    persistStore(live, storeData.runId, data)
    console.log(`[store-platform] live store deployed: ${subdomain} → ${previewUrl} (port ${assignedPort})`)
    return live
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[store-platform] deployStore(${subdomain}) crashed:`, msg)
    const failed = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
      previewUrl: '', filesPath: baseDir, createdAt, errorMessage: msg }
    persistStore(failed)
    return failed
  }
}

function persistStore(s: DeployedStore, runId?: string, storeData?: StoreData): void {
  // Only persist when we have a real pipeline run to link to (FK constraint).
  // Standalone deploys (smoke tests, manual triggers) skip DB persistence.
  if (!runId) return
  const exists = db.prepare(`SELECT 1 FROM runs WHERE run_id = ?`).get(runId)
  if (!exists) {
    console.warn(`[store-platform] persistStore skipped — run_id ${runId.slice(0, 8)} not found`)
    return
  }
  try {
    db.prepare(
      `INSERT OR REPLACE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, roas, status, store_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(s.storeId, runId, s.subdomain, s.niche, s.previewUrl, s.createdAt, null,
      s.status === 'failed' ? 'killed' : (s.status === 'local' ? 'live' : s.status),
      storeData ? JSON.stringify(storeData) : null)
  } catch (err) {
    console.error('[store-platform] persistStore failed:', err)
  }
}

// ── Store reconciliation ──────────────────────────────────────────────────────
// Reads existing stores from the store server via SSH and populates the DB.
// Safe to call multiple times — uses INSERT OR IGNORE.

export async function reconcileStores(): Promise<{ added: number; updated: number; stores: string[]; error?: string }> {
  if (!STORE_SERVER_HOST) {
    return { added: 0, updated: 0, stores: [], error: 'STORE_SERVER_HOST not configured (local mode)' }
  }

  // 1 — list store directories on the store server
  const listRes = await sshExec(`ls /var/www/stores/`)
  if (!listRes.ok) {
    const isNoRoute = listRes.output.includes('No route to host') || listRes.output.includes('Connection refused') || listRes.output.includes('Connection timed out')
    const hint = isNoRoute
      ? `Store server ${STORE_SERVER_HOST} is niet bereikbaar. Controleer of de server aan staat en SSH open is op poort 22. Of laat STORE_SERVER_HOST leeg in .env voor lokale modus.`
      : `SSH verbinding mislukt: ${listRes.output.trim()}`
    return { added: 0, updated: 0, stores: [], error: hint }
  }

  const dirs = listRes.output
    .split('\n')
    .map(d => d.trim())
    .filter(d => d && d !== 'testshop')

  // 2 — lees de ECHTE poorten uit nginx configs op de store server
  // Commando: voor elke store lezen we de nginx config en extraheren we de listen-poort (niet 80)
  const portsRes = await sshExec(
    `for d in ${dirs.join(' ')}; do ` +
    `p=$(grep -h "listen" /etc/nginx/sites-available/$d 2>/dev/null | grep -v "listen 80" | grep -oE "[0-9]{4,}" | head -1); ` +
    `echo "$d:$p"; ` +
    `done`
  )

  // Parse port map: { "blendjet.dropship.nl": 4001, "floathome.dropship.nl": 4002, ... }
  const nginxPorts: Record<string, number> = {}
  if (portsRes.ok) {
    for (const line of portsRes.output.split('\n')) {
      const [subdomain, portStr] = line.split(':')
      const p = parseInt(portStr?.trim() ?? '', 10)
      if (subdomain?.trim() && p > 0) {
        nginxPorts[subdomain.trim()] = p
      }
    }
  }
  console.log('[reconcile] nginx poorten gevonden:', nginxPorts)

  let added = 0
  let updated = 0
  const storeNames: string[] = []

  for (const dir of dirs) {
    // 3 — try to read store.json for metadata
    const jsonRes = await sshExec(`cat /var/www/stores/${dir}/store.json 2>/dev/null || echo '{}'`)
    let storeJson: Record<string, unknown> = {}
    try { storeJson = JSON.parse(jsonRes.output.trim()) } catch { /* use empty */ }

    const storeId   = (storeJson.storeId   as string) || `${dir.split('.')[0]}-recovered`
    const niche     = (storeJson.niche     as string) || dir.split('.')[0]
    const createdAt = (storeJson.createdAt as string) || new Date().toISOString()

    // 4 — poort: gebruik de echte nginx poort (betrouwbaar), anders fallback naar DB
    const nginxPort = nginxPorts[dir]
    const portRow = db.prepare('SELECT port FROM stores WHERE subdomein = ?').get(dir) as { port: number | null } | undefined
    const port = nginxPort || portRow?.port || null

    // 5 — find best run_id to link to (use most recent completed run)
    const runRow = db.prepare(
      `SELECT run_id FROM runs WHERE status IN ('completed','running') ORDER BY started_at DESC LIMIT 1`,
    ).get() as { run_id: string } | undefined
    const runId = runRow?.run_id

    // 6 — INSERT or UPDATE port if nginx had the real port
    const existing = db.prepare('SELECT store_id, port FROM stores WHERE subdomein = ?').get(dir) as { store_id: string; port: number | null } | undefined

    if (existing) {
      // Store bestaat al — update poort als nginx een andere poort heeft
      if (nginxPort && existing.port !== nginxPort) {
        db.prepare(`UPDATE stores SET port = ? WHERE subdomein = ?`).run(nginxPort, dir)
        console.log(`[reconcile] poort bijgewerkt voor ${dir}: ${existing.port} → ${nginxPort}`)
        updated++
      }
      storeNames.push(dir)
      continue
    }

    // Nieuwe store invoegen
    if (runId) {
      db.prepare(
        `INSERT OR IGNORE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
         VALUES (?, ?, ?, ?, ?, ?, 'live', ?, 'unknown')`,
      ).run(storeId, runId, dir, niche, `https://${dir}`, createdAt, port)
    } else {
      db.exec(`PRAGMA foreign_keys = OFF`)
      db.prepare(
        `INSERT OR IGNORE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, status, port, health_status)
         VALUES (?, 'recovered', ?, ?, ?, ?, 'live', ?, 'unknown')`,
      ).run(storeId, dir, niche, `https://${dir}`, createdAt, port)
      db.exec(`PRAGMA foreign_keys = ON`)
    }

    added++
    storeNames.push(dir)
  }

  return { added, updated, stores: storeNames }
}

// ── Express service (port 3002) ──────────────────────────────────────────────

import { startStoreMonitor, diagnoseStore, getAllStoreHealth, assignPort } from './store-monitor.js'

const app = express()
app.use(express.json())

app.post('/api/stores/deploy', async (req, res) => {
  try {
    const body = req.body as StoreData & { run_id?: string }
    // Zorg dat run_id als runId wordt doorgegeven aan deployStore
    const data: StoreData = { ...body, runId: body.runId ?? body.run_id }
    if (!data?.brand_name || !data?.niche || !Array.isArray(data?.products)) {
      res.status(400).json({ error: 'brand_name, niche and products[] are required' })
      return
    }
    const result = await deployStore(data)

    // Wijs direct een poort toe aan de nieuwe store
    if (result.storeId && result.status !== 'failed') {
      const port = assignPort(result.storeId)
      ;(result as unknown as Record<string, unknown>).port = port
    }

    res.json(result)
  } catch (err) {
    console.error('[store-platform] /deploy failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'deploy failed' })
  }
})

// ── Store overzicht met health status ────────────────────────────────────────
app.get('/api/stores', (_req, res) => {
  try {
    res.json(getAllStoreHealth())
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'lookup failed' })
  }
})

app.get('/api/stores/:storeId', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM stores WHERE store_id = ?').get(req.params.storeId) as Record<string, unknown> | undefined
    if (!row) {
      res.status(404).json({ error: 'store not found' })
      return
    }
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'lookup failed' })
  }
})

// ── AI diagnose endpoint ─────────────────────────────────────────────────────
app.post('/api/stores/:storeId/diagnose', async (req, res) => {
  try {
    const result = await diagnoseStore(req.params.storeId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'diagnose failed' })
  }
})

// ── CMS: lees merged store data (origineel + overrides) ──────────────────────
app.get('/api/stores/:storeId/cms-data', (req, res) => {
  try {
    const row = db.prepare('SELECT store_data, custom_data, subdomein, niche FROM stores WHERE store_id = ?')
      .get(req.params.storeId) as { store_data: string | null; custom_data: string | null; subdomein: string; niche: string } | undefined
    if (!row) { res.status(404).json({ error: 'store not found' }); return }

    const base: Partial<StoreData> = row.store_data ? JSON.parse(row.store_data) : {}
    const overrides: Partial<StoreData> = row.custom_data ? JSON.parse(row.custom_data) : {}

    // Deep merge: overrides win, maar we merge products array item-by-item op id
    const merged: StoreData = {
      brand_name: overrides.brand_name ?? base.brand_name ?? row.subdomein.split('.')[0],
      niche:       overrides.niche      ?? base.niche      ?? row.niche,
      slogan:      overrides.slogan     ?? base.slogan      ?? '',
      primary_color: overrides.primary_color ?? base.primary_color,
      subdomain:   row.subdomein,
      products: (base.products ?? []).map(p => {
        const o = (overrides.products ?? []).find(op => op.id === p.id)
        return o ? { ...p, ...o } : p
      }),
      ...(overrides.products && overrides.products.length > (base.products ?? []).length
        ? { products: overrides.products } : {}),
    }

    res.json({ merged, base, overrides, hasStoreData: !!row.store_data })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'cms-data failed' })
  }
})

// ── CMS: sla overrides op ────────────────────────────────────────────────────
app.put('/api/stores/:storeId/cms-data', (req, res) => {
  try {
    const row = db.prepare('SELECT store_id FROM stores WHERE store_id = ?').get(req.params.storeId)
    if (!row) { res.status(404).json({ error: 'store not found' }); return }

    db.prepare('UPDATE stores SET custom_data = ? WHERE store_id = ?')
      .run(JSON.stringify(req.body), req.params.storeId)

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'cms save failed' })
  }
})

// ── CMS: rebuild + redeploy store met huidige (merged) data ──────────────────
app.post('/api/stores/:storeId/rebuild', async (req, res) => {
  try {
    const row = db.prepare('SELECT store_data, custom_data, subdomein, niche, run_id FROM stores WHERE store_id = ?')
      .get(req.params.storeId) as { store_data: string | null; custom_data: string | null; subdomein: string; niche: string; run_id: string } | undefined
    if (!row) { res.status(404).json({ error: 'store not found' }); return }
    if (!row.store_data) { res.status(400).json({ error: 'Geen originele store data beschikbaar voor rebuild. Start een nieuwe pipeline run.' }); return }

    const base: StoreData = JSON.parse(row.store_data)
    const overrides: Partial<StoreData> = row.custom_data ? JSON.parse(row.custom_data) : {}

    // Merge overrides into base data
    const merged: StoreData = {
      ...base,
      ...overrides,
      subdomain: row.subdomein,
      runId: row.run_id,
      products: (base.products ?? []).map(p => {
        const o = (overrides.products ?? []).find(op => op.id === p.id)
        return o ? { ...p, ...o } : p
      }),
    }

    // Rebuild in background — respond immediately
    res.json({ ok: true, message: 'Rebuild gestart — dit duurt ca. 2-3 minuten' })

    deployStore(merged).then(result => {
      const status = result.status === 'live' ? 'live' : 'killed'
      db.prepare('UPDATE stores SET status = ? WHERE store_id = ?').run(status, req.params.storeId)
      console.log(`[cms-rebuild] ${row.subdomein} → ${status}`)
    }).catch(err => {
      console.error(`[cms-rebuild] ${row.subdomein} failed:`, err)
      db.prepare('UPDATE stores SET status = ? WHERE store_id = ?').run('killed', req.params.storeId)
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'rebuild failed' })
  }
})

// ── Handmatige health check trigger ─────────────────────────────────────────
app.post('/api/stores/:storeId/health-check', async (req, res) => {
  try {
    const store = db.prepare(`
      SELECT store_id, subdomein, niche, preview_url, status, port,
             health_status, health_checked_at, health_response_ms, health_error
      FROM stores WHERE store_id = ?
    `).get(req.params.storeId) as Record<string, unknown> | undefined
    if (!store) { res.status(404).json({ error: 'store not found' }); return }

    // Importeer checkStore via diagnoseStore (die doet een health check intern)
    await diagnoseStore(req.params.storeId)
    const updated = db.prepare('SELECT health_status, health_response_ms, health_error FROM stores WHERE store_id = ?').get(req.params.storeId)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'health check failed' })
  }
})

app.get('/preview/:subdomain', (req, res) => {
  try {
    const sub = req.params.subdomain.replace(/[^a-z0-9-]/gi, '')
    const file = path.join(LOCAL_STORES_DIR, sub, 'index.html')
    if (!fs.existsSync(file)) {
      res.status(404).send('Store preview not found')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    res.status(500).send(`preview failed: ${err instanceof Error ? err.message : err}`)
  }
})

app.post('/api/admin/reconcile-stores', async (_req, res) => {
  try {
    const result = await reconcileStores()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'reconcile failed' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: STORE_SERVER_HOST ? 'remote' : 'local', baseDir: STORE_SERVER_HOST ? TMP_BUILD_DIR : LOCAL_STORES_DIR })
})

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[store-platform] listening on http://localhost:${PORT} (mode: ${STORE_SERVER_HOST ? 'remote' : 'local'})`)
    startStoreMonitor()
  })
}
