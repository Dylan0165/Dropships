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
import 'dotenv/config'
import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import db, { saveAgentOutput as _saveAgentOutput } from './db.js'
void _saveAgentOutput

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../../../')
const COMPONENTS_DIR = path.join(workspaceRoot, 'Websitecomponentscodes')

const PORT = parseInt(process.env.PLATFORM_PORT ?? '3002', 10)
const STORE_SERVER_HOST = process.env.STORE_SERVER_HOST || ''
const STORE_SERVER_USER = process.env.STORE_SERVER_USER || 'deploy'
const STORE_SSH_KEY_PATH = process.env.STORE_SSH_KEY_PATH || ''
const STORE_BASE_DOMAIN = process.env.STORE_BASE_DOMAIN || 'localhost'
const LOCAL_STORES_DIR = path.resolve(workspaceRoot, 'UIcontrol/data/stores')
const TMP_BUILD_DIR = path.join(os.tmpdir(), 'stores')

// Max producten per store — branded stores zijn focused, geen catalogus
const MAX_PRODUCTS_PER_STORE = parseInt(process.env.MAX_PRODUCTS_PER_STORE ?? '3', 10)

const COMPONENT_NAMES = [
  'navigation',
  'hero-banner',
  'usp-section',
  'product-grid',
  'social-proof',
  'checkout-flow',
  'footer',
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreProduct {
  id: string
  title: string
  image: string
  price: number
  compareAtPrice?: number
  badge?: string
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

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'store'
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function rmDirRecursive(p: string): void {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function applyPlaceholders(content: string, data: StoreData & { _storeId?: string }): string {
  const imgs = data.imageUrls ?? []
  return content
    .replace(/\{\{BRAND_NAME\}\}/g, data.brand_name)
    .replace(/\{\{SLOGAN\}\}/g, data.slogan)
    .replace(/\{\{PRIMARY_COLOR\}\}/g, data.primary_color || '#7c3aed')
    .replace(/\{\{NICHE\}\}/g, data.niche)
    .replace(/\{\{PRODUCTS_JSON\}\}/g, JSON.stringify(data.products))
    .replace(/\{\{STORE_ID\}\}/g, data._storeId ?? data.storeId ?? '')
    .replace(/\{\{CHECKOUT_URL\}\}/g, data.checkoutUrl ?? '#checkout')
    .replace(/\{\{PRODUCT_IMAGE_1\}\}/g, imgs[0] ?? '')
    .replace(/\{\{PRODUCT_IMAGE_2\}\}/g, imgs[1] ?? '')
    .replace(/\{\{PRODUCT_IMAGE_3\}\}/g, imgs[2] ?? '')
}

function copyComponents(targetDir: string, data: StoreData & { _storeId?: string }): void {
  const componentsTarget = path.join(targetDir, 'components')
  ensureDir(componentsTarget)

  // Kopieer de shared/ map (checkout.ts, types.ts, etc.) die door componenten wordt geïmporteerd
  const sharedSrc = path.join(COMPONENTS_DIR, 'shared')
  if (fs.existsSync(sharedSrc)) {
    const sharedDest = path.join(componentsTarget, 'shared')
    ensureDir(sharedDest)
    for (const file of fs.readdirSync(sharedSrc)) {
      const srcFile = path.join(sharedSrc, file)
      if (!fs.statSync(srcFile).isFile()) continue
      fs.copyFileSync(srcFile, path.join(sharedDest, file))
    }
  }

  for (const compName of COMPONENT_NAMES) {
    const src = path.join(COMPONENTS_DIR, compName)
    if (!fs.existsSync(src)) {
      console.warn(`[store-platform] component missing: ${src}`)
      continue
    }
    const dest = path.join(componentsTarget, compName)
    ensureDir(dest)
    for (const file of fs.readdirSync(src)) {
      const srcFile = path.join(src, file)
      if (!fs.statSync(srcFile).isFile()) continue
      const ext = path.extname(file).toLowerCase()
      if (!['.tsx', '.ts', '.jsx', '.js', '.css', '.md'].includes(ext)) continue
      const raw = fs.readFileSync(srcFile, 'utf-8')
      fs.writeFileSync(path.join(dest, file), applyPlaceholders(raw, data), 'utf-8')
    }
  }
}

function writeNextScaffold(targetDir: string, data: StoreData): void {
  const subdomain = data.subdomain ?? slugify(data.brand_name)
  ensureDir(path.join(targetDir, 'app'))
  ensureDir(path.join(targetDir, 'public'))

  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
    name: `store-${subdomain}`,
    version: '0.1.0',
    private: true,
    scripts: { build: 'next build', start: 'next start', dev: 'next dev' },
    dependencies: { next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
  }, null, 2), 'utf-8')

  fs.writeFileSync(path.join(targetDir, 'next.config.js'),
    `module.exports = { output: 'export', images: { unoptimized: true } };\n`,
    'utf-8',
  )

  fs.writeFileSync(path.join(targetDir, 'app/layout.tsx'),
    `export const metadata = { title: ${JSON.stringify(data.brand_name)}, description: ${JSON.stringify(data.slogan)} };\n` +
    `export default function RootLayout({ children }: { children: React.ReactNode }) {\n` +
    `  return (<html lang="nl"><body>{children}</body></html>);\n}\n`,
    'utf-8',
  )

  // Build a single-page app combining all components.
  fs.writeFileSync(path.join(targetDir, 'app/page.tsx'),
    `import HeroBanner from '../components/hero-banner/HeroBanner';\n` +
    `import ProductGrid from '../components/product-grid/ProductGrid';\n` +
    `import UspSection from '../components/usp-section/UspSection';\n` +
    `import SocialProof from '../components/social-proof/SocialProof';\n` +
    `import NavBar from '../components/navigation/NavBar';\n` +
    `import Footer from '../components/footer/Footer';\n\n` +
    `const products = ${JSON.stringify(data.products, null, 2)};\n\n` +
    `export default function Home() {\n` +
    `  return (<>\n` +
    `    <NavBar brand={${JSON.stringify(data.brand_name)}} />\n` +
    `    <HeroBanner headline={${JSON.stringify(data.brand_name)}} subheadline={${JSON.stringify(data.slogan)}} ctaText="Shop nu" ctaHref="#products" />\n` +
    `    <UspSection />\n` +
    `    <section id="products"><ProductGrid products={products} /></section>\n` +
    `    <SocialProof />\n` +
    `    <Footer brand={${JSON.stringify(data.brand_name)}} />\n` +
    `  </>);\n}\n`,
    'utf-8',
  )
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

// ── A/B Nginx config (split_clients 50/50) ────────────────────────────────────

function nginxAbConfig(subdomain: string, variantA: string, variantB: string): string {
  const lines = [
    `# A/B split for ${subdomain} — auto-winner checked after 72h`,
    `split_clients "${subdomain}_ab" $ab_variant {`,
    `  50% "a";`,
    `  *   "b";`,
    `}`,
    ``,
    `server {`,
    `  listen 80;`,
    `  server_name ${subdomain}.${STORE_BASE_DOMAIN};`,
    `  set $root_a /var/www/stores/${variantA}/out;`,
    `  set $root_b /var/www/stores/${variantB}/out;`,
    `  root $root_$ab_variant;`,
    `  index index.html;`,
    `  location / { try_files $uri $uri.html $uri/index.html =404; }`,
    `  gzip on;`,
    `  gzip_types text/css application/javascript image/svg+xml;`,
    `  add_header X-AB-Variant $ab_variant;`,
    `}`,
  ]
  return lines.join('\n')
}

/** Static fallback HTML used by local preview when there is no Next.js build. */
function buildStaticPreviewHtml(data: StoreData): string {
  const color = data.primary_color || '#7c3aed'
  const productsHtml = data.products.map(p => `
    <article class="card">
      ${p.image ? `<img src="${p.image}" alt="${p.title.replace(/"/g, '&quot;')}" />` : ''}
      <div class="card-body">
        <h3>${p.title}</h3>
        <div class="price">€${p.price.toFixed(2)}${p.compareAtPrice ? ` <s>€${p.compareAtPrice.toFixed(2)}</s>` : ''}</div>
        <button>In winkelmand</button>
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
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.brand_name} — ${data.slogan}</title>
<meta name="description" content="${data.slogan}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${data.brand_name}">
<meta property="og:description" content="${data.slogan}">
<meta property="og:url" content="${canonicalUrl}">
${firstImage ? `<meta property="og:image" content="${firstImage}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${data.brand_name}">
<meta name="twitter:description" content="${data.slogan}">
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
<header><span class="brand">${data.brand_name}</span><nav>Shop · Over ons · Contact</nav></header>
<section class="hero">
  <h1>${data.brand_name}</h1>
  <p>${data.slogan}</p>
  <a href="#products" class="cta">Shop nu</a>
</section>
<section id="products"><div class="grid">${productsHtml}</div></section>
<footer>© ${new Date().getFullYear()} ${data.brand_name} — ${data.niche}</footer>
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

// ── Remote deploy helpers ─────────────────────────────────────────────────────

async function npmBuild(cwd: string): Promise<{ ok: boolean; log: string }> {
  console.log(`[store-platform] npm install in ${cwd}`)
  const install = await runCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd, timeoutMs: 120_000 })
  if (install.code !== 0) {
    return { ok: false, log: `npm install failed (code ${install.code}):\n${install.stderr}` }
  }
  console.log(`[store-platform] next build in ${cwd}`)
  const build = await runCmd('npm', ['run', 'build'], { cwd, timeoutMs: 120_000 })
  if (build.code !== 0) {
    return { ok: false, log: `next build failed (code ${build.code}):\n${build.stderr}` }
  }
  return { ok: true, log: install.stdout + '\n' + build.stdout }
}

async function scpToRemote(localPath: string, remotePath: string): Promise<boolean> {
  const sshArgs = STORE_SSH_KEY_PATH ? ['-i', STORE_SSH_KEY_PATH] : []
  const target = `${STORE_SERVER_USER}@${STORE_SERVER_HOST}:${remotePath}`
  const result = await runCmd('scp', [...sshArgs, '-r', localPath, target], { timeoutMs: 120_000 })
  if (result.code !== 0) {
    console.error(`[store-platform] scp failed: ${result.stderr}`)
    return false
  }
  return true
}

async function sshExec(command: string): Promise<{ ok: boolean; output: string }> {
  const sshArgs = STORE_SSH_KEY_PATH ? ['-i', STORE_SSH_KEY_PATH] : []
  const result = await runCmd('ssh', [...sshArgs, `${STORE_SERVER_USER}@${STORE_SERVER_HOST}`, command], { timeoutMs: 30_000 })
  return { ok: result.code === 0, output: result.stdout + result.stderr }
}

function nginxConfig(subdomain: string, port?: number): string {
  // Elke store luistert op:
  //   - poort 80 via subdomain:  http://{subdomain}.stores.local
  //   - eigen poort (indien toegewezen): http://192.168.121.8:{port}
  const portBlock = port ? `\nserver {\n  listen ${port};\n  root /var/www/stores/${subdomain}/out;\n  index index.html;\n  location / { try_files $uri $uri.html $uri/index.html =404; }\n  gzip on;\n  gzip_types text/css application/javascript image/svg+xml;\n  add_header X-Store "${subdomain}";\n}\n` : ''
  return `server {
  listen 80;
  server_name ${subdomain}.${STORE_BASE_DOMAIN};
  root /var/www/stores/${subdomain}/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Store "${subdomain}";
}
${portBlock}`
}

// ── WebsiteInspector integration ─────────────────────────────────────────────

interface DesignInspiration {
  niche: string
  color_palette: string[]
  recommended_layout: string
  recommended_tone: string
  headline_formula: string
  section_order: string[]
  source_store_ids: number[]
}

async function fetchInspiration(niche: string): Promise<DesignInspiration | null> {
  const inspectorUrl = process.env.INSPECTOR_URL ?? 'http://localhost:8002'
  try {
    const resp = await fetch(
      `${inspectorUrl}/inspiration?niche=${encodeURIComponent(niche)}`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!resp.ok) return null
    return await resp.json() as DesignInspiration
  } catch {
    return null
  }
}

// ── Main deploy entrypoint ───────────────────────────────────────────────────

// ── Duplicate product guard ────────────────────────────────────────────────────
// Haal alle CJ product IDs op die al in gebruik zijn door andere stores.
function getDeployedProductIds(): Set<string> {
  try {
    const rows = db.prepare(
      `SELECT DISTINCT json_each.value AS pid
       FROM stores, json_each(stores.products_json)
       WHERE stores.status IN ('local','live')`,
    ).all() as { pid: string }[]
    return new Set(rows.map(r => r.pid))
  } catch {
    return new Set()
  }
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
  const deployedIds = getDeployedProductIds()
  const uniqueProducts = limitedProducts.filter(p => {
    if (deployedIds.has(p.id)) {
      console.log(`[store-platform] Product ${p.id} (${p.title}) al in gebruik door andere store — overgeslagen`)
      return false
    }
    return true
  })
  if (uniqueProducts.length === 0) {
    console.warn('[store-platform] Alle producten zijn al in gebruik — store niet aangemaakt. Pipeline moet nieuwe producten vinden.')
    return {
      storeId,
      subdomain,
      niche: storeData.niche,
      status: 'failed',
      previewUrl: '',
      filesPath: '',
      createdAt,
      errorMessage: 'Alle geselecteerde producten zijn al actief in andere stores',
    }
  }

  // ── Design inspiratie van WebsiteInspector ───────────────────────────────
  let inspiration: DesignInspiration | null = null
  try {
    inspiration = await fetchInspiration(storeData.niche)
    if (inspiration) {
      console.log(`[store-platform] inspiratie geladen voor niche "${storeData.niche}": layout=${inspiration.recommended_layout}, tone=${inspiration.recommended_tone}`)
    }
  } catch {
    // Non-fatal — WebsiteInspector mag offline zijn
  }

  const data = {
    ...storeData,
    products: uniqueProducts,
    subdomain,
    _storeId: storeId,
    // Apply inspiration color only when brand-agent didn't provide one
    primary_color: storeData.primary_color ?? inspiration?.color_palette?.[0],
    // Merge image URLs from previous pipeline step
    imageUrls: storeData.imageUrls,
  }

  const isRemote = !!STORE_SERVER_HOST
  const baseDir = isRemote ? path.join(TMP_BUILD_DIR, subdomain) : path.join(LOCAL_STORES_DIR, subdomain)

  try {
    // STEP 1 — generate files
    rmDirRecursive(baseDir)
    ensureDir(baseDir)
    copyComponents(baseDir, data)
    writeNextScaffold(baseDir, data)
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

    // STEP 2 — npm install + next build
    const buildResult = await npmBuild(baseDir)
    if (!buildResult.ok) {
      console.error(`[store-platform] build failed for ${subdomain}:\n${buildResult.log.slice(-1000)}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'build failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    // STEP 3 — scp + nginx reload
    const remoteRoot = `/var/www/stores/${subdomain}`
    await sshExec(`sudo mkdir -p ${remoteRoot} && sudo chown -R ${STORE_SERVER_USER}:${STORE_SERVER_USER} ${remoteRoot}`)
    const buildOk = await scpToRemote(path.join(baseDir, 'out'), `${remoteRoot}/`)
    if (!buildOk) {
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'scp failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    // Write nginx vhost remotely (inclusief poort-block)
    const assignedPort = assignPort(storeId)
    const nginxLocal = path.join(baseDir, 'nginx.conf')
    fs.writeFileSync(nginxLocal, nginxConfig(subdomain, assignedPort), 'utf-8')
    await scpToRemote(nginxLocal, `/tmp/${subdomain}.nginx.conf`)
    const nginxRes = await sshExec(
      `sudo mv /tmp/${subdomain}.nginx.conf /etc/nginx/sites-available/${subdomain} && ` +
      `sudo ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/${subdomain} && ` +
      `sudo nginx -t && sudo systemctl reload nginx`,
    )
    if (!nginxRes.ok) {
      console.error(`[store-platform] nginx reload failed: ${nginxRes.output.slice(-500)}`)
      const fallback = { storeId, subdomain, niche: data.niche, status: 'failed' as const,
        previewUrl: '', filesPath: baseDir, createdAt, errorMessage: 'nginx reload failed' }
      persistStore(fallback, storeData.runId)
      return fallback
    }

    const previewUrl = `https://${subdomain}.${STORE_BASE_DOMAIN}`
    const live = { storeId, subdomain, niche: data.niche, status: 'live' as const,
      previewUrl, filesPath: baseDir, createdAt }
    persistStore(live, storeData.runId)
    console.log(`[store-platform] live store deployed: ${subdomain} → ${previewUrl}`)
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

function persistStore(s: DeployedStore, runId?: string): void {
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
      `INSERT OR REPLACE INTO stores (store_id, run_id, subdomein, niche, preview_url, created_at, roas, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(s.storeId, runId, s.subdomain, s.niche, s.previewUrl, s.createdAt, null,
      s.status === 'failed' ? 'killed' : (s.status === 'local' ? 'live' : s.status))
  } catch (err) {
    console.error('[store-platform] persistStore failed:', err)
  }
}

// ── Express service (port 3002) ──────────────────────────────────────────────

import { startStoreMonitor, diagnoseStore, getAllStoreHealth, assignPort } from './store-monitor.js'

const app = express()
app.use(express.json())

app.post('/api/stores/deploy', async (req, res) => {
  try {
    const data = req.body as StoreData
    if (!data?.brand_name || !data?.niche || !Array.isArray(data?.products)) {
      res.status(400).json({ error: 'brand_name, niche and products[] are required' })
      return
    }
    const result = await deployStore(data)

    // Wijs direct een poort toe aan de nieuwe store
    if (result.storeId && result.status !== 'failed') {
      const port = assignPort(result.storeId)
      ;(result as Record<string, unknown>).port = port
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: STORE_SERVER_HOST ? 'remote' : 'local', baseDir: STORE_SERVER_HOST ? TMP_BUILD_DIR : LOCAL_STORES_DIR })
})

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[store-platform] listening on http://localhost:${PORT} (mode: ${STORE_SERVER_HOST ? 'remote' : 'local'})`)
    startStoreMonitor()
  })
}
