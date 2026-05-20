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

  // next.config.js
  fs.writeFileSync(path.join(targetDir, 'next.config.js'),
    `module.exports = { output: 'export', images: { unoptimized: true } };\n`, 'utf-8')

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
}): TemplateVars {
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
  }
}
