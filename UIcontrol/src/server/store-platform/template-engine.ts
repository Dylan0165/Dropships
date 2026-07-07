import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.resolve(__dirname, '../../../store-templates')

const TEMPLATE_NAMES = ['noir', 'blanc', 'bolt', 'dusk', 'grid'] as const
export type TemplateName = typeof TEMPLATE_NAMES[number]

export interface TemplateVars {
  BRAND_NAME: string
  BRAND_NAME_UPPER: string
  SLOGAN: string
  PRIMARY: string
  SECONDARY: string
  ACCENT: string
  PRODUCTS_JSON: string
  YEAR: string
  HERO_HEADLINE: string
  HERO_LABEL: string
  USP_1_TITLE: string
  USP_1_DESC: string
  USP_2_TITLE: string
  USP_2_DESC: string
  USP_3_TITLE: string
  USP_3_DESC: string
  FONT_URL: string
  HEADING_FONT: string
  BODY_FONT: string
  // Checkout context — used by Bestel button in each template
  CHECKOUT_API_URL: string
  STORE_ID: string
  SUBDOMAIN: string
  RUN_ID: string
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fill(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key: string) => {
    const val = (vars as unknown as Record<string, string>)[key]
    return val !== undefined ? val : `{{${key}}}`
  })
}

export function selectTemplate(niche: string): TemplateName {
  const idx = niche.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5
  return TEMPLATE_NAMES[idx]
}

export function applyTemplate(
  targetDir: string,
  templateName: TemplateName,
  vars: TemplateVars,
): void {
  const templateDir = path.join(TEMPLATES_DIR, templateName)
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template "${templateName}" niet gevonden in ${TEMPLATES_DIR}`)
  }
  copyDir(templateDir, targetDir, vars)
}

function copyDir(src: string, dest: string, vars: TemplateVars): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name)
    const destName = entry.name.replace(/\.tmpl$/, '')
    const destPath = path.join(dest, destName)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, vars)
    } else if (entry.isFile()) {
      const raw = fs.readFileSync(srcPath, 'utf-8')
      fs.writeFileSync(destPath, fill(raw, vars), 'utf-8')
    }
  }
}

export function buildLayoutSharedFiles(
  targetDir: string,
  vars: TemplateVars,
): void {
  const appDir = path.join(targetDir, 'app')
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true })

  // layout.tsx
  fs.writeFileSync(path.join(appDir, 'layout.tsx'), `import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: ${JSON.stringify(vars.BRAND_NAME)},
  description: ${JSON.stringify(vars.SLOGAN)},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="${vars.FONT_URL}" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: ${JSON.stringify(vars.BODY_FONT)} }}>{children}</body>
    </html>
  );
}
`, 'utf-8')

  // globals.css
  fs.writeFileSync(path.join(appDir, 'globals.css'), `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; -webkit-font-smoothing: antialiased; }
h1,h2,h3,h4,h5,h6 { font-family: ${vars.HEADING_FONT}; }
a { color: inherit; }
img { max-width: 100%; display: block; }
`, 'utf-8')

  // package.json
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
    name: `store-${vars.BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    version: '0.1.0',
    private: true,
    scripts: { build: 'next build', start: 'next start', dev: 'next dev' },
    dependencies: { next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
    devDependencies: { typescript: '^5.4.0', '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0', '@types/node': '^20.0.0' },
  }, null, 2), 'utf-8')

  // next.config.js — trailingSlash zodat /checkout/ e.d. als map met index.html
  // geëxporteerd worden en nginx' try_files ze direct kan serveren
  fs.writeFileSync(path.join(targetDir, 'next.config.js'),
    `module.exports = { output: 'export', trailingSlash: true, images: { unoptimized: true } };\n`, 'utf-8')

  // Checkout + bedankt + info pagina's (over/contact/faq/retour)
  buildCheckoutAndInfoPages(targetDir, vars)

  // tsconfig.json
  fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'es2017', lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true, skipLibCheck: true, strict: true, noEmit: true,
      esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
      resolveJsonModule: true, isolatedModules: true, jsx: 'preserve',
      incremental: true, plugins: [{ name: 'next' }],
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2), 'utf-8')
}

// ─── Tailwind build guard ─────────────────────────────────────────────────────
// De templates gebruiken bewust inline styles (geen Tailwind), maar zodra er
// tailwind-directives of -classes in gegenereerde code terechtkomen (bv. via
// LLM-gegenereerde pagina's of CMS-componenten) faalde `next build` omdat de
// dependencies en configs ontbraken. Deze guard detecteert dat en maakt de
// build alsnog werkend door tailwind + postcss config en deps toe te voegen.

export function ensureTailwindSupport(targetDir: string): boolean {
  const appDir = path.join(targetDir, 'app')
  if (!fs.existsSync(appDir)) return false

  const tailwindPattern = /@tailwind\s+(base|components|utilities)|@apply\s|from\s+['"]tailwindcss/
  let needsTailwind = false

  const scan = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (needsTailwind) return
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) { scan(p); continue }
      if (!/\.(tsx?|css|jsx?)$/.test(entry.name)) continue
      if (tailwindPattern.test(fs.readFileSync(p, 'utf-8'))) needsTailwind = true
    }
  }
  scan(appDir)
  if (!needsTailwind) return false

  console.log('[template-engine] Tailwind-gebruik gedetecteerd in gegenereerde store — configs + deps toevoegen')

  // tailwind.config.js + postcss.config.js
  fs.writeFileSync(path.join(targetDir, 'tailwind.config.js'),
    `module.exports = {\n  content: ['./app/**/*.{js,ts,jsx,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n};\n`, 'utf-8')
  fs.writeFileSync(path.join(targetDir, 'postcss.config.js'),
    `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`, 'utf-8')

  // devDependencies bijwerken in de gegenereerde package.json
  const pkgPath = path.join(targetDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      devDependencies?: Record<string, string>
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0',
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
  }
  return true
}

// ─── Checkout + info pagina's ─────────────────────────────────────────────────
// Gegenereerd voor elke store, template-onafhankelijk (neutrale styling met
// de brand-kleuren). De checkout-pagina verzamelt het verzendadres — verplicht
// voor automatische supplier fulfillment (CJ) — en stuurt daarna door naar Mollie.

export function buildCheckoutAndInfoPages(targetDir: string, vars: TemplateVars): void {
  const appDir = path.join(targetDir, 'app')

  // ── /checkout ──
  const checkoutDir = path.join(appDir, 'checkout')
  if (!fs.existsSync(checkoutDir)) fs.mkdirSync(checkoutDir, { recursive: true })
  fs.writeFileSync(path.join(checkoutDir, 'page.tsx'), `'use client';
import { useEffect, useState } from 'react';

interface Product {
  id: string; title: string; image: string; price: number; compareAtPrice?: number;
  description?: string; supplier?: string; supplierProductId?: string; supplierVariantId?: string;
  // PRODUCTS_JSON kan extra velden bevatten (badge, bullets, ...) — die negeren we hier
  [key: string]: unknown;
}
const PRODUCTS: Product[] = ${vars.PRODUCTS_JSON};
const PRIMARY = '${vars.PRIMARY}';
const CHECKOUT_API = '${vars.CHECKOUT_API_URL}';
const STORE_ID = '${vars.STORE_ID}';
const SUBDOMAIN = '${vars.SUBDOMAIN}';
const RUN_ID = '${vars.RUN_ID}';

const COUNTRIES: Array<[string, string]> = [['NL', 'Nederland'], ['BE', 'België'], ['DE', 'Duitsland'], ['FR', 'Frankrijk']];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.7rem 0.9rem', border: '1px solid #ddd', borderRadius: 8,
  fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.3rem', color: '#333',
};

export default function CheckoutPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', street: '', houseNumber: '', zip: '', city: '', countryCode: 'NL',
  });

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('product');
    setProduct(PRODUCTS.find(p => p.id === id) ?? PRODUCTS[0] ?? null);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    if (!form.name || !form.email || !form.street || !form.zip || !form.city) {
      setError('Vul alle verplichte velden in.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(CHECKOUT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: STORE_ID, subdomain: SUBDOMAIN, runId: RUN_ID,
          amountEur: Math.round(product.price * qty * 100) / 100,
          description: qty + 'x ' + product.title,
          items: [{
            id: product.id, title: product.title, price: product.price, quantity: qty,
            supplier: product.supplier, supplierProductId: product.supplierProductId,
            supplierVariantId: product.supplierVariantId,
          }],
          customer: form,
          redirectUrl: window.location.origin + '/bedankt/',
        }),
      });
      if (!r.ok) throw new Error('checkout request failed');
      const data = await r.json() as { checkoutUrl?: string };
      if (!data.checkoutUrl) throw new Error('geen checkout url');
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error('[checkout]', err);
      setError('Er ging iets mis bij het starten van de betaling. Probeer het opnieuw.');
      setBusy(false);
    }
  }

  if (!product) {
    return <main style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'inherit' }}>Laden…</main>;
  }

  const total = Math.round(product.price * qty * 100) / 100;

  return (
    <main style={{ minHeight: '100dvh', background: '#fafafa', color: '#111', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <a href="/" style={{ fontSize: '0.8rem', color: '#666', textDecoration: 'none' }}>&larr; Terug naar ${vars.BRAND_NAME}</a>
        <h1 style={{ fontSize: '1.6rem', margin: '1rem 0 2rem', fontWeight: 700 }}>Afrekenen</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>

          {/* Bestelling */}
          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.5rem' }}>
            <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 1rem' }}>Je bestelling</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {product.image && <img src={product.image} alt={product.title} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, background: '#f2f2f2' }} />}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>{product.title}</p>
                <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.85rem' }}>&euro;{product.price.toFixed(2)} per stuk</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#555' }}>Aantal</span>
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>&minus;</button>
              <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{qty}</span>
              <button type="button" onClick={() => setQty(q => Math.min(10, q + 1))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>+</button>
            </div>
            <div style={{ borderTop: '1px solid #eee', marginTop: '1.25rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Totaal</span>
              <span>&euro;{total.toFixed(2)}</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.75rem' }}>Gratis verzending &middot; Veilig betalen via iDEAL, Bancontact, creditcard of PayPal</p>
          </section>

          {/* Verzendgegevens */}
          <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1.5rem' }}>
            <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', margin: '0 0 1rem' }}>Verzendgegevens</h2>
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div>
                <label style={labelStyle}>Volledige naam *</label>
                <input style={inputStyle} value={form.name} onChange={set('name')} autoComplete="name" required />
              </div>
              <div>
                <label style={labelStyle}>E-mailadres *</label>
                <input style={inputStyle} type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
              <div>
                <label style={labelStyle}>Telefoon (voor bezorging)</label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Straat *</label>
                  <input style={inputStyle} value={form.street} onChange={set('street')} autoComplete="address-line1" required />
                </div>
                <div>
                  <label style={labelStyle}>Huisnr.</label>
                  <input style={inputStyle} value={form.houseNumber} onChange={set('houseNumber')} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Postcode *</label>
                  <input style={inputStyle} value={form.zip} onChange={set('zip')} autoComplete="postal-code" required />
                </div>
                <div>
                  <label style={labelStyle}>Plaats *</label>
                  <input style={inputStyle} value={form.city} onChange={set('city')} autoComplete="address-level2" required />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Land *</label>
                <select style={inputStyle} value={form.countryCode} onChange={set('countryCode')}>
                  {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
            </div>

            {error && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: '1rem' }}>{error}</p>}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%', marginTop: '1.25rem', padding: '0.9rem',
                background: busy ? '#999' : PRIMARY, color: '#fff', border: 'none', borderRadius: 8,
                fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.03em',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Bezig…' : 'Betaal €' + total.toFixed(2)}
            </button>
            <p style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '0.75rem', textAlign: 'center' }}>
              Je wordt doorgestuurd naar onze beveiligde betaalpagina (Mollie).
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
`, 'utf-8')

  // ── /bedankt ──
  const bedanktDir = path.join(appDir, 'bedankt')
  if (!fs.existsSync(bedanktDir)) fs.mkdirSync(bedanktDir, { recursive: true })
  fs.writeFileSync(path.join(bedanktDir, 'page.tsx'), `export default function BedanktPage() {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', color: '#111', padding: '2rem' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10003;</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Bedankt voor je bestelling!</h1>
        <p style={{ color: '#666', lineHeight: 1.7, margin: '0 0 2rem' }}>
          Zodra je betaling is verwerkt ontvang je een bevestiging per e-mail.
          Je bestelling wordt binnen 1-2 werkdagen verzonden vanuit ons Europese magazijn.
        </p>
        <a href="/" style={{ display: 'inline-block', background: '#111', color: '#fff', padding: '0.75rem 2rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
          Terug naar ${vars.BRAND_NAME}
        </a>
      </div>
    </main>
  );
}
`, 'utf-8')

  // ── Info pagina's: /over /contact /faq /retour (footer-links in de templates) ──
  const infoPages: Array<{ slug: string; title: string; body: string }> = [
    {
      slug: 'over', title: 'Over ons',
      body: `<p>${vars.BRAND_NAME} — ${vars.SLOGAN}</p>
        <p>Wij geloven dat kwaliteit niet ingewikkeld hoeft te zijn. Daarom selecteren we onze producten zorgvuldig en verzenden we alles vanuit Europese magazijnen: snelle levering, geen verrassingen bij de douane.</p>
        <p>Vragen? Neem gerust <a href="/contact/">contact</a> met ons op.</p>`,
    },
    {
      slug: 'contact', title: 'Contact',
      body: `<p>We helpen je graag. Ons supportteam reageert binnen 24 uur op werkdagen.</p>
        <p><strong>E-mail:</strong> support@${vars.SUBDOMAIN || 'store'}.example</p>
        <p><strong>Retouren:</strong> zie onze <a href="/retour/">retourpagina</a>.</p>`,
    },
    {
      slug: 'faq', title: 'Veelgestelde vragen',
      body: `<h3>Hoe lang duurt de levering?</h3>
        <p>Bestellingen worden binnen 1-2 werkdagen verzonden vanuit ons Europese magazijn. De levertijd is doorgaans 3-8 werkdagen.</p>
        <h3>Kan ik mijn bestelling volgen?</h3>
        <p>Ja — zodra je bestelling verzonden is ontvang je een track &amp; trace code per e-mail.</p>
        <h3>Hoe kan ik betalen?</h3>
        <p>Via iDEAL, Bancontact, creditcard of PayPal. Betalingen verlopen beveiligd via Mollie.</p>
        <h3>Wat als ik niet tevreden ben?</h3>
        <p>Je hebt 30 dagen bedenktijd. Zie onze <a href="/retour/">retourpagina</a>.</p>`,
    },
    {
      slug: 'retour', title: 'Retourneren',
      body: `<p>Niet tevreden? Je mag je bestelling binnen <strong>30 dagen</strong> na ontvangst retourneren.</p>
        <p>Stuur een e-mail met je ordernummer en we sturen je de retourinstructies. Na ontvangst van je retour storten we het volledige aankoopbedrag binnen 5 werkdagen terug.</p>
        <p>Het product dient ongebruikt en in de originele verpakking te zijn.</p>`,
    },
  ]

  for (const page of infoPages) {
    const dir = path.join(appDir, page.slug)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'page.tsx'), `export default function Page() {
  return (
    <main style={{ minHeight: '100dvh', background: '#fafafa', color: '#111', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <a href="/" style={{ fontSize: '0.8rem', color: '#666', textDecoration: 'none' }}>&larr; ${vars.BRAND_NAME}</a>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '1rem 0 1.5rem' }}>${page.title}</h1>
        <div style={{ lineHeight: 1.8, color: '#333', fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(page.body)} }} />
      </div>
    </main>
  );
}
`, 'utf-8')
  }
}

export function validateNoForbiddenImports(pageTsx: string): string[] {
  const errors: string[] = []
  const lines = pageTsx.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // No relative imports at all (except from within the file itself)
    if (/^import\s/.test(line) && /from\s+['"]\.\.?\//.test(line)) {
      errors.push(`Lijn ${i + 1}: verboden relatieve import: ${line.trim()}`)
    }
    // No .js extensions
    if (/from\s+['"][^'"]+\.js['"]/.test(line)) {
      errors.push(`Lijn ${i + 1}: .js extensie in import: ${line.trim()}`)
    }
    // No common hallucinated component names
    const forbidden = ['NavBar', 'HeroBanner', 'UspSection', 'ProductGrid', 'ReviewCard', 'initiateCheckout']
    for (const f of forbidden) {
      if (line.includes(f)) {
        errors.push(`Lijn ${i + 1}: verboden component/functie "${f}": ${line.trim()}`)
      }
    }
  }
  return errors
}

export function buildTemplateVars(opts: {
  brandName: string
  slogan: string
  niche: string
  primary: string
  secondary: string
  accent: string
  products: unknown[]
  usps: Array<{ title: string; desc: string }>
  heroHeadline?: string
  fontUrl: string
  headingFont: string
  bodyFont: string
  storeId: string
  subdomain: string
  runId: string
}): TemplateVars {
  const checkoutApiUrl = process.env.UICONTROL_PUBLIC_URL
    ? `${process.env.UICONTROL_PUBLIC_URL.replace(/\/+$/, '')}/api/checkout/session`
    : `http://192.168.121.133:3001/api/checkout/session`
  return {
    BRAND_NAME:       esc(opts.brandName),
    BRAND_NAME_UPPER: esc(opts.brandName).toUpperCase(),
    SLOGAN:           esc(opts.slogan),
    PRIMARY:          opts.primary,
    SECONDARY:        opts.secondary,
    ACCENT:           opts.accent,
    PRODUCTS_JSON:    JSON.stringify(opts.products, null, 2),
    YEAR:             String(new Date().getFullYear()),
    HERO_HEADLINE:    esc(opts.heroHeadline ?? opts.brandName),
    HERO_LABEL:       `Nieuw — ${new Date().getFullYear()}`,
    USP_1_TITLE:      esc(opts.usps[0]?.title ?? 'Gratis verzending'),
    USP_1_DESC:       esc(opts.usps[0]?.desc  ?? 'Op alle bestellingen in NL & BE.'),
    USP_2_TITLE:      esc(opts.usps[1]?.title ?? '30 dagen retour'),
    USP_2_DESC:       esc(opts.usps[1]?.desc  ?? 'Geen gedoe, geld terug.'),
    USP_3_TITLE:      esc(opts.usps[2]?.title ?? 'Veilig betalen'),
    USP_3_DESC:       esc(opts.usps[2]?.desc  ?? 'iDEAL, Visa, Mastercard, PayPal.'),
    FONT_URL:         opts.fontUrl,
    HEADING_FONT:     opts.headingFont,
    BODY_FONT:        opts.bodyFont,
    CHECKOUT_API_URL: checkoutApiUrl,
    STORE_ID:         opts.storeId,
    SUBDOMAIN:        opts.subdomain,
    RUN_ID:           opts.runId,
  }
}
