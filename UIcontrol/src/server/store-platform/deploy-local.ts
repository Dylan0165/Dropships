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
  const routes = `  root ${root};
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Store "${subdomain}";`
  return `# managed by Dropships deploy-local — ${subdomain}
server {
  listen 80;
  server_name ${subdomain}.${domain};
${routes}
}

server {
  listen ${port};
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
    fs.rmSync(path.join(nginxConfDir, `${sub}.conf`), { force: true })
    fs.rmSync(path.join(storesRoot, sub), { recursive: true, force: true })
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
    for (const m of txt.matchAll(/listen\s+(\d{2,5})\s*;/g)) {
      const p = parseInt(m[1], 10)
      if (p !== 80 && p > 1024) return p
    }
  } catch { /* n/a */ }
  return null
}

function listConfs(): string[] {
  const { nginxConfDir } = cfg()
  if (!fs.existsSync(nginxConfDir)) return []
  return fs.readdirSync(nginxConfDir).filter(f => f.endsWith('.conf')).map(f => f.replace(/\.conf$/, ''))
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
