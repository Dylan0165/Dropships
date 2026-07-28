// ═══════ Lokale deploy (één-server VPS) ═══════
// Vervangt het SSH/SCP-mechanisme (deploy-ssh.ts) wanneer de tool én de
// store-hosting op DEZELFDE server draaien. Alles gebeurt met directe
// bestandsoperaties (fs) + één lokale nginx-reload — geen ssh, geen scp, geen
// tweede host. Dit elimineert de klasse bugs uit de schoolomgeving (verkeerd
// STORE_SERVER_HOST-IP via stale env-restore → "no route to host").
//
// Nginx-model (bewust simpel, één server):
//   - Elke store krijgt ÉÉN conf-bestand `<subdomain>.conf` in NGINX_CONF_DIR,
//     een door de app-user beschreven include-dir (default /etc/nginx/dropships.d)
//     die vanuit nginx.conf ge-included wordt: `include /etc/nginx/dropships.d/*.conf;`.
//     Geen sites-available/sites-enabled symlink-dans meer.
//   - De publieke route is `server_name <subdomain>.<domain>` op poort 80
//     (Cloudflare named tunnel → nginx :80). De `listen <port>`-blok blijft
//     als directe debug-ingang én houdt de bestaande poort-allocatie zinvol.
//   - De enige geprivilegieerde actie is de reload: NGINX_RELOAD_CMD
//     (default `sudo nginx -t && sudo systemctl reload nginx`) — smalle sudoers.
//
// Alle paden zijn via env overschrijfbaar zodat dit lokaal (temp-dirs, reload=true)
// getest kan worden zonder root.

import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import type { DeployResult, NginxVhostInfo } from './deploy-ssh.js'

const MAX_RELEASES = 3

function cfg() {
  return {
    storesRoot: process.env.STORES_ROOT ?? '/var/www/stores',
    nginxConfDir: process.env.NGINX_CONF_DIR ?? '/etc/nginx/dropships.d',
    reloadCmd: process.env.NGINX_RELOAD_CMD ?? 'sudo nginx -t && sudo systemctl reload nginx',
    domain: process.env.STORE_BASE_DOMAIN ?? 'localhost',
  }
}

function safeSub(subdomain: string): string {
  const s = subdomain.replace(/[^a-z0-9.-]/gi, '')
  if (!s || s !== subdomain) throw new Error(`Ongeldige subdomain "${subdomain}" (alleen a-z0-9.-)`)
  return s
}

/** Draai een shell-commando lokaal (voor de nginx-reload). */
function runShell(cmd: string, timeoutMs = 30_000, onLog?: (m: string) => void): Promise<{ ok: boolean; output: string; code: number | null }> {
  const log = onLog ?? (() => {})
  return new Promise((resolve) => {
    log(`$ ${cmd}`)
    const child = spawn(cmd, { shell: true })
    let out = ''
    const grab = (d: Buffer) => { const t = d.toString(); out += t; t.split('\n').filter(Boolean).forEach(l => log(`  > ${l}`)) }
    child.stdout?.on('data', grab)
    child.stderr?.on('data', grab)
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, output: out + '\n[timeout]', code: null }) }, timeoutMs)
    child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, output: out + `\n[spawn error: ${err.message}]`, code: null }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, output: out, code }) })
  })
}

/**
 * Vervang de `current`-symlink door één die naar `target` wijst. Op Linux is
 * `rename(2)` over een bestaande symlink ATOMAIR (geen moment zonder current);
 * dat is het primaire pad. Windows/dev staat dat niet toe → veilige fallback
 * (unlink + rename) met een minimaal venster. `_ts` maakt de temp-naam uniek.
 */
function swapSymlink(currentLink: string, target: string, _ts: number): void {
  const tmpLink = `${currentLink}_new_${_ts}`
  try { fs.rmSync(tmpLink, { force: true }) } catch { /* n/a */ }
  fs.symlinkSync(target, tmpLink, 'dir')
  try {
    fs.renameSync(tmpLink, currentLink)   // atomair op Linux
  } catch {
    // Fallback (Windows/dev): oude link weg, dan de nieuwe op z'n plek
    try { fs.rmSync(currentLink, { recursive: false, force: true }) } catch { /* n/a */ }
    fs.renameSync(tmpLink, currentLink)
  }
}

function nginxVhost(subdomain: string, port: number): string {
  const { domain, storesRoot } = cfg()
  const root = `${storesRoot}/${subdomain}/current/out`
  // Beveiligingsheaders staan op ELKE store. `always` is nodig: zonder dat
  // ontbreken ze op foutpagina's (404/50x), precies waar een aanvaller kijkt.
  //
  // CSP is bewust ruim genoeg voor wat een gegenereerde store echt doet: inline
  // styles (de renderer zet alles inline), Google Fonts, productbeelden van
  // willekeurige leverancier-CDN's, en één XHR-doel — de centrale checkout-
  // gateway. Strakker kan pas als de renderer geen inline styles meer gebruikt.
  const apiOrigin = (process.env.PUBLIC_BASE_URL || `https://api.${domain}`).replace(/\/+$/, '')
  const security = `  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self' ${apiOrigin} https://api.stripe.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.stripe.com" always;`

  const routes = `  root ${root};
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
${security}
  add_header X-Store "${subdomain}" always;`

  return `# managed by Dropships deploy-local — ${subdomain}
# Publiek: via de Cloudflare-tunnel op poort 80. TLS eindigt bij Cloudflare.
server {
  listen 80;
  server_name ${subdomain}.${domain};
${routes}
}

# Debug-poort: UITSLUITEND op de loopback. Zonder het expliciete 127.0.0.1
# luistert nginx op 0.0.0.0 en is elke store rechtstreeks van buiten bereikbaar,
# buiten de tunnel en buiten Cloudflare om.
server {
  listen 127.0.0.1:${port};
  server_name _;
${routes}
}
`
}

async function reloadNginx(onLog?: (m: string) => void): Promise<{ ok: boolean; output: string }> {
  const { reloadCmd } = cfg()
  const res = await runShell(reloadCmd, 45_000, onLog)
  return { ok: res.ok, output: res.output }
}

// ── atomicDeploy (lokaal) ───────────────────────────────────────────────────────

export async function atomicDeploy(
  subdomain: string,
  builtOutDir: string,
  port: number,
  onLog?: (msg: string) => void,
): Promise<DeployResult> {
  const log = onLog ?? ((m: string) => console.log(`[deploy-local] ${m}`))
  const { storesRoot, nginxConfDir, domain } = cfg()

  let sub: string
  try { sub = safeSub(subdomain) } catch (err) { return { ok: false, port, releaseDir: '', error: err instanceof Error ? err.message : String(err) } }

  log(`Lokale deploy: subdomain="${sub}" port=${port} domain=${domain}`)
  log(`Stores-root: ${storesRoot} | nginx-conf-dir: ${nginxConfDir}`)

  if (!fs.existsSync(builtOutDir) || !fs.existsSync(path.join(builtOutDir, 'index.html'))) {
    return { ok: false, port, releaseDir: '', error: `build-output ontbreekt of heeft geen index.html: ${builtOutDir} — heeft \`next build\` \`out/\` gegenereerd?` }
  }

  // 0. Poort-conflict pre-flight (lokaal): claimt een ANDERE store deze poort al?
  const conflict = await portConflictOwner(sub, port)
  if (conflict) {
    return { ok: false, port, releaseDir: '', error: `Poort-conflict: poort ${port} is al in gebruik door store "${conflict}". Deploy afgebroken (dubbele allocatie) — verwijder de conflicterende store of draai /api/admin/nginx-audit.` }
  }

  const ts = Date.now()
  const storeRoot = path.join(storesRoot, sub)
  const releaseDir = path.join(storeRoot, 'releases', String(ts))

  try {
    // 1. Release-dir aanmaken + build kopiëren (app bezit storesRoot → geen sudo)
    log(`Step 1/4: release-dir ${releaseDir}`)
    fs.mkdirSync(releaseDir, { recursive: true })
    fs.cpSync(builtOutDir, path.join(releaseDir, 'out'), { recursive: true })

    if (!fs.existsSync(path.join(releaseDir, 'out', 'index.html'))) {
      fs.rmSync(releaseDir, { recursive: true, force: true })
      return { ok: false, port, releaseDir, error: 'health check: index.html ontbreekt na kopie' }
    }

    // 2. Symlink-swap: current → nieuwe release
    log(`Step 2/4: symlink-swap → release ${ts}`)
    const currentLink = path.join(storeRoot, 'current')
    swapSymlink(currentLink, releaseDir, ts)

    // 3. Nginx vhost schrijven in de app-owned include-dir (geen sudo)
    log(`Step 3/4: nginx vhost schrijven (${sub}.conf)`)
    fs.mkdirSync(nginxConfDir, { recursive: true })
    const confPath = path.join(nginxConfDir, `${sub}.conf`)
    const prevConf = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : null
    fs.writeFileSync(confPath, nginxVhost(sub, port), 'utf-8')

    // 4. Nginx testen + reloaden (enige geprivilegieerde stap)
    log(`Step 4/4: nginx -t + reload`)
    const reload = await reloadNginx(log)
    if (!reload.ok) {
      // Rollback de conf zodat een kapotte config niet blijft staan
      if (prevConf !== null) fs.writeFileSync(confPath, prevConf, 'utf-8')
      else fs.rmSync(confPath, { force: true })
      await reloadNginx(log)
      return { ok: false, port, releaseDir, error: `nginx reload mislukt: ${reload.output.slice(-300) || '<geen output>'}` }
    }

    pruneOldReleases(sub)
    log(`Deploy compleet: ${sub}.${domain} → poort ${port}`)
    return { ok: true, port, releaseDir }
  } catch (err) {
    return { ok: false, port, releaseDir, error: `lokale deploy mislukt: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Apex-vhost: clynado.com → het publieke kopers-dashboard ────────────────────
// De apex is de enige host die niet naar een store wijst maar naar de Express-app
// (:3001, pad /market). Cloudflare's wildcard `*.clynado.com` dekt de apex NIET,
// dus daar hoort een eigen ingress-regel bij in de tunnel-config — zie
// scripts/cloudflared-named-tunnel.md.
//
// De conf heet `_apex.conf`; de underscore houdt hem uit de weg van de
// subdomain-scan (die leest `<sub>.conf` en zou hem anders als store zien).

/**
 * Stopt een eventueel PM2-proces van deze store.
 *
 * In het huidige model is dat er niet: stores zijn statische Next-exports die
 * nginx rechtstreeks serveert, dus er draait geen proces per winkel. De functie
 * bestaat voor legacy-stores die wél server-side draaiden, en om te garanderen
 * dat "verwijderen" écht niets laat staan. Best-effort: geen pm2 of geen proces
 * met die naam is geen fout.
 */
export async function stopStoreProcess(subdomain: string): Promise<{ stopped: boolean; output: string }> {
  const sub = safeSub(subdomain)
  const list = await runShell('pm2 jlist', 15_000)
  if (!list.ok || !list.output.trim().startsWith('[')) {
    return { stopped: false, output: 'pm2 niet beschikbaar — overgeslagen' }
  }
  try {
    const procs = JSON.parse(list.output) as Array<{ name?: string }>
    if (!procs.some(p => p.name === sub || p.name === `store-${sub}`)) {
      return { stopped: false, output: 'geen PM2-proces voor deze store' }
    }
  } catch {
    return { stopped: false, output: 'pm2 jlist onleesbaar — overgeslagen' }
  }
  const del = await runShell(`pm2 delete ${sub} || pm2 delete store-${sub}`, 20_000)
  return { stopped: del.ok, output: del.output }
}

export const APEX_CONF_NAME = '_apex'

// ── Catch-all: onbekende subdomeinen geven 404 ────────────────────────────────
// nginx wijst het EERSTE server-blok op een poort aan als default_server. De
// include-dir wordt alfabetisch geladen, dus `_apex.conf` (underscore sorteert
// vóór letters) werd stilzwijgend de default. Gevolg: na het verwijderen van een
// store bleef `<sub>.clynado.com` gewoon werken en toonde het het kopers-
// dashboard, alsof de winkel er nog was.
//
// `_00-default.conf` sorteert vóór `_apex.conf` (`_0` < `_a`) en claimt de
// default expliciet met een 404. Onbekend = onbekend, of het subdomein nu nooit
// bestaan heeft of net verwijderd is.
const DEFAULT_CONF_NAME = '_00-default'

function defaultConf(): string {
  return `# managed by Dropships — catch-all voor onbekende subdomeinen
# MOET als eerste geladen worden (naam sorteert vóór _apex.conf), anders wordt
# een ander server-blok de default_server en valt een verwijderde store terug op
# het kopers-dashboard in plaats van een 404 te geven.
server {
  listen 80 default_server;
  server_name _;
  add_header X-Content-Type-Options "nosniff" always;
  return 404;
}
`
}

function apexConf(domain: string, port: number): string {
  return `# managed by Dropships — publiek kopers-dashboard (apex)
server {
  listen 80;
  server_name ${domain} www.${domain};

  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # Publieke etalage-data eerst: langste prefix wint bij nginx, dus deze regel
  # moet er staan vóórdat / alles naar /market herschrijft.
  location /api/market/ {
    proxy_pass http://127.0.0.1:${port}/api/market/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location / {
    proxy_pass http://127.0.0.1:${port}/market/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
`
}

/**
 * Schrijft (of ververst) de apex-vhost. Idempotent: alleen wegschrijven als de
 * inhoud daadwerkelijk verandert, zodat een herstart niet elke keer een
 * nginx-reload uitlokt.
 */
export async function ensureApexVhost(onLog?: (m: string) => void): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const { nginxConfDir, domain } = cfg()
  const port = Number(process.env.PORT ?? 3001)
  if (!domain || domain === 'localhost') {
    return { ok: false, changed: false, error: 'STORE_BASE_DOMAIN niet gezet — apex-vhost overgeslagen' }
  }
  try {
    fs.mkdirSync(nginxConfDir, { recursive: true })
    let changed = false

    // Catch-all eerst; die bepaalt wat er met onbekende hosts gebeurt.
    const defaultPath = path.join(nginxConfDir, `${DEFAULT_CONF_NAME}.conf`)
    const nextDefault = defaultConf()
    if ((fs.existsSync(defaultPath) ? fs.readFileSync(defaultPath, 'utf-8') : '') !== nextDefault) {
      fs.writeFileSync(defaultPath, nextDefault, 'utf-8')
      onLog?.(`[apex] ${defaultPath} geschreven — onbekende subdomeinen geven nu 404`)
      changed = true
    }

    const confPath = path.join(nginxConfDir, `${APEX_CONF_NAME}.conf`)
    const next = apexConf(domain, port)
    if ((fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : '') !== next) {
      fs.writeFileSync(confPath, next, 'utf-8')
      onLog?.(`[apex] ${confPath} bijgewerkt → ${domain} naar 127.0.0.1:${port}/market`)
      changed = true
    }

    if (!changed) return { ok: true, changed: false }
    const reload = await reloadNginx(onLog)
    return { ok: reload.ok, changed: true, error: reload.ok ? undefined : reload.output }
  } catch (err) {
    return { ok: false, changed: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function rollback(subdomain: string, onLog?: (msg: string) => void): Promise<{ ok: boolean; rolledBackTo?: string }> {
  const log = onLog ?? ((m: string) => console.log(`[deploy-local] ${m}`))
  const { storesRoot } = cfg()
  const sub = safeSub(subdomain)
  const relDir = path.join(storesRoot, sub, 'releases')
  if (!fs.existsSync(relDir)) return { ok: false }
  const releases = fs.readdirSync(relDir).filter(n => /^\d+$/.test(n)).sort((a, b) => Number(a) - Number(b))
  if (releases.length < 2) { log('rollback: geen vorige release'); return { ok: false } }
  const target = releases[releases.length - 2]
  const currentLink = path.join(storesRoot, sub, 'current')
  swapSymlink(currentLink, path.join(relDir, target), releases.length)
  const reload = await reloadNginx(log)
  return { ok: reload.ok, rolledBackTo: reload.ok ? target : undefined }
}

function pruneOldReleases(subdomain: string): void {
  const { storesRoot } = cfg()
  const relDir = path.join(storesRoot, subdomain, 'releases')
  if (!fs.existsSync(relDir)) return
  const releases = fs.readdirSync(relDir).filter(n => /^\d+$/.test(n)).sort((a, b) => Number(a) - Number(b))
  for (const old of releases.slice(0, Math.max(0, releases.length - MAX_RELEASES))) {
    try { fs.rmSync(path.join(relDir, old), { recursive: true, force: true }) } catch { /* best-effort */ }
  }
}

export async function removeDeployedStore(subdomain: string, onLog?: (msg: string) => void): Promise<{ ok: boolean; error?: string }> {
  const log = onLog ?? ((m: string) => console.log(`[deploy-local] ${m}`))
  let sub: string
  try { sub = safeSub(subdomain) } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  const { storesRoot, nginxConfDir } = cfg()
  log(`Store ${sub} lokaal verwijderen...`)
  try {
    const confPath = path.join(nginxConfDir, `${sub}.conf`)
    const hadConf = fs.existsSync(confPath)
    fs.rmSync(confPath, { force: true })
    fs.rmSync(path.join(storesRoot, sub), { recursive: true, force: true })

    // Controleren i.p.v. aannemen: blijft de conf staan (rechten, race), dan
    // blijft het subdomein bereikbaar en dat is precies wat we niet willen.
    if (fs.existsSync(confPath)) {
      return { ok: false, error: `vhost ${confPath} kon niet verwijderd worden — subdomein blijft anders bereikbaar` }
    }
    log(hadConf ? `vhost ${sub}.conf verwijderd` : `geen vhost voor ${sub} gevonden (was al weg)`)

    // De catch-all moet er zijn, anders wordt het volgende server-blok de
    // default en valt dit subdomein terug op een andere site in plaats van 404.
    const defaultPath = path.join(nginxConfDir, `${DEFAULT_CONF_NAME}.conf`)
    if (!fs.existsSync(defaultPath)) {
      fs.writeFileSync(defaultPath, defaultConf(), 'utf-8')
      log('catch-all vhost ontbrak — aangemaakt zodat onbekende subdomeinen 404 geven')
    }

    const reload = await reloadNginx(log)
    if (!reload.ok) return { ok: false, error: `nginx reload na verwijderen mislukt: ${reload.output.slice(-200)}` }
    log(`Store ${sub} verwijderd ✓`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Introspectie: lees de vhosts uit de include-dir ───────────────────────────

function readConfPort(confPath: string): number | null {
  try {
    const txt = fs.readFileSync(confPath, 'utf-8')
    // Matcht zowel `listen 4001;` (oude confs) als `listen 127.0.0.1:4001;`
    // (huidige vorm, loopback-only). Zonder het optionele adres-deel zou de
    // poort-scan na de loopback-wijziging niets meer vinden en zou allocatePort
    // poorten opnieuw uitdelen die al in gebruik zijn.
    for (const m of txt.matchAll(/listen\s+(?:[\d.]+:|\[[^\]]+\]:)?(\d{2,5})\s*;/g)) {
      const p = parseInt(m[1], 10)
      if (p !== 80 && p > 1024) return p
    }
  } catch { /* n/a */ }
  return null
}

function listConfs(): string[] {
  const { nginxConfDir } = cfg()
  if (!fs.existsSync(nginxConfDir)) return []
  // Confs die met _ beginnen zijn infrastructuur (zoals _apex.conf), geen store.
  // Zonder deze filter zou de audit `_apex` als weesbestand melden en zou de
  // poort-scan de apex-poort meetellen.
  return fs.readdirSync(nginxConfDir)
    .filter(f => f.endsWith('.conf') && !f.startsWith('_'))
    .map(f => f.replace(/\.conf$/, ''))
}

export async function portConflictOwner(selfSubdomain: string, port: number): Promise<string | null> {
  for (const sub of listConfs()) {
    if (sub === selfSubdomain) continue
    if (readConfPort(path.join(cfg().nginxConfDir, `${sub}.conf`)) === port) return sub
  }
  return null
}

export async function listVhostPorts(): Promise<NginxVhostInfo[]> {
  return listConfs().map(subdomain => ({
    subdomain,
    port: readConfPort(path.join(cfg().nginxConfDir, `${subdomain}.conf`)),
    enabled: true,   // in de include-dir is "aanwezig" == "enabled"
  }))
}

export async function scanDeployedStores(): Promise<Array<{ subdomain: string; port: number }>> {
  const out: Array<{ subdomain: string; port: number }> = []
  for (const subdomain of listConfs()) {
    const port = readConfPort(path.join(cfg().nginxConfDir, `${subdomain}.conf`))
    if (port && port > 1024) out.push({ subdomain, port })
  }
  return out
}

export async function getHighestNginxPort(): Promise<number> {
  const ports = (await scanDeployedStores()).map(s => s.port)
  return ports.length ? Math.max(...ports) : 0
}

export async function auditNginx(activeSubdomains: Set<string>): Promise<{
  orphans: NginxVhostInfo[]
  portConflicts: Array<{ port: number; subdomains: string[] }>
  vhosts: NginxVhostInfo[]
  error?: string
}> {
  const vhosts = await listVhostPorts()
  const orphans = vhosts.filter(v => !activeSubdomains.has(v.subdomain))
  const byPort = new Map<number, string[]>()
  for (const v of vhosts) {
    if (v.port == null) continue
    byPort.set(v.port, [...(byPort.get(v.port) ?? []), v.subdomain])
  }
  const portConflicts = [...byPort.entries()].filter(([, s]) => s.length > 1).map(([port, subdomains]) => ({ port, subdomains }))
  return { orphans, portConflicts, vhosts }
}
