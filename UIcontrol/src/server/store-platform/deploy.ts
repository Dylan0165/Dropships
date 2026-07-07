import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'

const MAX_RELEASES = 3

// Read at call time so dotenv/config is guaranteed to have run first
function env() {
  return {
    host: process.env.STORE_SERVER_HOST ?? '',
    user: process.env.STORE_SERVER_USER ?? 'deploy',
    key:  process.env.STORE_SSH_KEY_PATH ?? '',
    domain: process.env.STORE_BASE_DOMAIN ?? 'localhost',
  }
}

export interface DeployResult {
  ok: boolean
  port: number
  releaseDir: string
  error?: string
}

function sshArgs(): string[] {
  const { key } = env()
  const base = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'BatchMode=yes',          // fail fast if a password/passphrase would be prompted
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=5',
    '-o', 'ServerAliveCountMax=2',
  ]
  return key ? ['-i', key, ...base] : base
}

function truncate(s: string, max = 500): string {
  if (s.length <= max) return s
  return `${s.slice(0, max / 2)}…${s.slice(-max / 2)} (${s.length}b total)`
}

function runSsh(
  command: string,
  timeoutMs = 30_000,
  onLog?: (msg: string) => void,
): Promise<{ ok: boolean; output: string; durationMs: number; exitCode: number | null }> {
  const { host, user } = env()
  const log = onLog ?? (() => {})
  const start = Date.now()
  return new Promise((resolve) => {
    const args = [...sshArgs(), `${user}@${host}`, command]
    log(`$ ssh ${user}@${host} '${truncate(command, 200)}'`)
    const child = spawn('ssh', args, { shell: false })
    let out = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      const t = d.toString()
      out += t
      t.split('\n').filter(Boolean).forEach(line => log(`  ssh> ${line}`))
    })
    child.stderr?.on('data', (d: Buffer) => {
      const t = d.toString()
      stderr += t
      out += t
      t.split('\n').filter(Boolean).forEach(line => log(`  ssh! ${line}`))
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      const durationMs = Date.now() - start
      log(`  ssh ✗ TIMEOUT after ${(durationMs / 1000).toFixed(1)}s — stderr so far: ${truncate(stderr) || '<empty>'}`)
      resolve({ ok: false, output: out + `\n[timeout after ${(durationMs / 1000).toFixed(1)}s]`, durationMs, exitCode: null })
    }, timeoutMs)
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      const durationMs = Date.now() - start
      log(`  ssh ✗ spawn error: ${err.message}`)
      resolve({ ok: false, output: out + `\n[spawn error: ${err.message}]`, durationMs, exitCode: null })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      const durationMs = Date.now() - start
      const ok = code === 0
      log(`  ssh ${ok ? '✓' : '✗'} exit=${code} duration=${(durationMs / 1000).toFixed(1)}s${ok ? '' : ` stderr=${truncate(stderr) || '<empty>'}`}`)
      resolve({ ok, output: out, durationMs, exitCode: code })
    })
  })
}

function runScp(
  localPath: string,
  remotePath: string,
  timeoutMs = 120_000,
  onLog?: (msg: string) => void,
): Promise<{ ok: boolean; output: string; durationMs: number; exitCode: number | null }> {
  const { host, user } = env()
  const log = onLog ?? (() => {})
  const start = Date.now()
  return new Promise((resolve) => {
    const args = [...sshArgs(), '-r', localPath, `${user}@${host}:${remotePath}`]
    log(`$ scp -r ${localPath} ${user}@${host}:${remotePath}`)
    const child = spawn('scp', args, { shell: false })
    let out = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr?.on('data', (d: Buffer) => {
      const t = d.toString()
      stderr += t
      out += t
      t.split('\n').filter(Boolean).forEach(line => log(`  scp! ${line}`))
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      const durationMs = Date.now() - start
      log(`  scp ✗ TIMEOUT after ${(durationMs / 1000).toFixed(1)}s — stderr so far: ${truncate(stderr) || '<empty>'}`)
      resolve({ ok: false, output: out + `\n[scp timeout after ${(durationMs / 1000).toFixed(1)}s]`, durationMs, exitCode: null })
    }, timeoutMs)
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      const durationMs = Date.now() - start
      log(`  scp ✗ spawn error: ${err.message}`)
      resolve({ ok: false, output: out + `\n[scp error: ${err.message}]`, durationMs, exitCode: null })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      const durationMs = Date.now() - start
      const ok = code === 0
      log(`  scp ${ok ? '✓' : '✗'} exit=${code} duration=${(durationMs / 1000).toFixed(1)}s${ok ? '' : ` stderr=${truncate(stderr) || '<empty>'}`}`)
      resolve({ ok, output: out, durationMs, exitCode: code })
    })
  })
}

function nginxVhost(subdomain: string, port: number): string {
  const { domain } = env()
  return `server {
  listen 80;
  server_name ${subdomain}.${domain};
  root /var/www/stores/${subdomain}/current/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Store "${subdomain}";
}

server {
  listen ${port};
  root /var/www/stores/${subdomain}/current/out;
  index index.html;
  location / { try_files $uri $uri.html $uri/index.html =404; }
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  add_header X-Store "${subdomain}";
}
`
}

export async function atomicDeploy(
  subdomain: string,
  builtOutDir: string,
  port: number,
  onLog?: (msg: string) => void,
): Promise<DeployResult> {
  const log = onLog ?? ((m: string) => console.log(`[deploy] ${m}`))

  const { host, user, key, domain } = env()
  if (!host) {
    return { ok: false, port, releaseDir: '', error: 'STORE_SERVER_HOST not set' }
  }

  log(`Deploy target: ${user}@${host} subdomain="${subdomain}" port=${port}`)
  log(`SSH key: ${key || '(default agent/identity)'} | base domain: ${domain}`)
  log(`Build dir: ${builtOutDir}`)

  // 0. Pre-flight: can we even SSH and run a no-op?
  log(`Pre-flight: SSH connectivity probe...`)
  const probe = await runSsh(`whoami && hostname && sudo -n true 2>&1 || echo NO_SUDO`, 15_000, log)
  if (!probe.ok) {
    return {
      ok: false, port, releaseDir: '',
      error: `SSH probe failed (exit=${probe.exitCode}, ${(probe.durationMs / 1000).toFixed(1)}s) — kan niet verbinden met ${user}@${host}. Check key/host/network. stderr: ${probe.output.slice(-300) || '<empty>'}`,
    }
  }
  if (probe.output.includes('NO_SUDO')) {
    return {
      ok: false, port, releaseDir: '',
      error: `Passwordless sudo niet beschikbaar voor ${user}@${host}. mkdir/chown etc. zullen hangen op password prompt. Fix: voeg '${user} ALL=(ALL) NOPASSWD:ALL' toe aan /etc/sudoers.d/${user} op de store server.`,
    }
  }

  const ts = Date.now()
  const storeRoot = `/var/www/stores/${subdomain}`
  const releaseDir = `${storeRoot}/releases/${ts}`

  // 1. Create release dir + upload build artefacts
  log(`Step 1/5: create release dir ${releaseDir}`)
  const mkdirRes = await runSsh(
    `sudo mkdir -p ${releaseDir} ${storeRoot}/releases && sudo chown -R ${user}:${user} ${storeRoot}`,
    30_000,
    log,
  )
  if (!mkdirRes.ok) return { ok: false, port, releaseDir, error: `mkdir failed (exit=${mkdirRes.exitCode}, ${(mkdirRes.durationMs / 1000).toFixed(1)}s): ${mkdirRes.output.slice(-300) || '<no output>'}` }

  log(`Step 2/5: upload build artefacts via scp`)
  const scpRes = await runScp(builtOutDir, `${releaseDir}/`, 120_000, log)
  if (!scpRes.ok) return { ok: false, port, releaseDir, error: `scp failed (exit=${scpRes.exitCode}, ${(scpRes.durationMs / 1000).toFixed(1)}s): ${scpRes.output.slice(-300) || '<no output>'}` }

  // 2. Health check on the artefacts (ensure index.html exists)
  log(`Step 3/5: verify index.html in uploaded artefacts`)
  const healthRes = await runSsh(`test -f ${releaseDir}/out/index.html && echo ok`, 15_000, log)
  if (!healthRes.ok || !healthRes.output.includes('ok')) {
    await runSsh(`sudo rm -rf ${releaseDir}`, 15_000, log)
    return { ok: false, port, releaseDir, error: 'health check: index.html ontbreekt in out/ — heeft `next build` wel `out/` gegenereerd?' }
  }

  // 3. Atomic symlink swap — current → new release
  log(`Step 4/5: atomic symlink swap → release ${ts}`)
  const swapRes = await runSsh(
    `sudo ln -sfn ${releaseDir} ${storeRoot}/current_new && sudo mv -T ${storeRoot}/current_new ${storeRoot}/current`,
    20_000,
    log,
  )
  if (!swapRes.ok) {
    await runSsh(`sudo rm -rf ${releaseDir}`, 15_000, log)
    return { ok: false, port, releaseDir, error: `symlink swap failed (exit=${swapRes.exitCode}): ${swapRes.output.slice(-300) || '<no output>'}` }
  }

  // 4. Write nginx vhost + reload
  log(`Step 5/5: nginx vhost write + reload on port ${port}`)
  const vhostContent = nginxVhost(subdomain, port)
  const vhostPath = `/tmp/${subdomain}.nginx.conf`

  const tmpVhost = path.join(os.tmpdir(), `${subdomain}.nginx.conf`)
  fs.writeFileSync(tmpVhost, vhostContent, 'utf-8')
  const vhostScp = await runScp(tmpVhost, vhostPath, 30_000, log)
  fs.unlinkSync(tmpVhost)

  if (!vhostScp.ok) return { ok: false, port, releaseDir, error: `vhost scp failed (exit=${vhostScp.exitCode}): ${vhostScp.output.slice(-200) || '<no output>'}` }

  const nginxRes = await runSsh(
    `sudo mv ${vhostPath} /etc/nginx/sites-available/${subdomain} && ` +
    `sudo ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/${subdomain} && ` +
    `sudo nginx -t && sudo systemctl reload nginx`,
    45_000,
    log,
  )
  if (!nginxRes.ok) {
    log(`nginx reload failed — rolling back`)
    await rollback(subdomain, onLog)
    return { ok: false, port, releaseDir, error: `nginx reload failed (exit=${nginxRes.exitCode}): ${nginxRes.output.slice(-300) || '<no output>'}` }
  }

  log(`Pruning old releases (keep ${MAX_RELEASES})`)
  await pruneOldReleases(subdomain)

  log(`Deploy complete: ${subdomain} → port ${port}`)
  return { ok: true, port, releaseDir }
}

export async function rollback(subdomain: string, onLog?: (msg: string) => void): Promise<{ ok: boolean; rolledBackTo?: string }> {
  const log = onLog ?? ((m: string) => console.log(`[deploy] ${m}`))
  const storeRoot = `/var/www/stores/${subdomain}`

  // List releases sorted ascending, pick second-to-last as rollback target
  const listRes = await runSsh(`ls -1 ${storeRoot}/releases/ | sort -n`)
  if (!listRes.ok) return { ok: false }

  const releases = listRes.output.trim().split('\n').filter(Boolean)
  if (releases.length < 2) {
    log(`Rollback: no previous release available`)
    return { ok: false }
  }

  const target = releases[releases.length - 2]
  const targetDir = `${storeRoot}/releases/${target}`
  log(`Rolling back to release ${target}`)

  const swapRes = await runSsh(
    `sudo ln -sfn ${targetDir} ${storeRoot}/current_new && sudo mv -T ${storeRoot}/current_new ${storeRoot}/current && sudo systemctl reload nginx`,
  )
  return { ok: swapRes.ok, rolledBackTo: swapRes.ok ? target : undefined }
}

async function pruneOldReleases(subdomain: string): Promise<void> {
  const storeRoot = `/var/www/stores/${subdomain}`
  // Delete all but the newest MAX_RELEASES entries in releases/
  await runSsh(
    `ls -1 ${storeRoot}/releases/ | sort -n | head -n -${MAX_RELEASES} | xargs -I{} sudo rm -rf ${storeRoot}/releases/{}`,
    30_000,
  )
}

/**
 * Verwijder een store volledig van de store server:
 * nginx vhost (sites-enabled + sites-available), webroot en nginx reload.
 * Lokale modus (geen STORE_SERVER_HOST) → alleen ok teruggeven; caller ruimt lokale files op.
 */
export async function removeDeployedStore(
  subdomain: string,
  onLog?: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const log = onLog ?? ((m: string) => console.log(`[deploy] ${m}`))
  const { host } = env()
  if (!host) return { ok: true }

  // Guard tegen path injection — subdomain is alleen [a-z0-9.-]
  const safe = subdomain.replace(/[^a-z0-9.-]/gi, '')
  if (!safe || safe !== subdomain) {
    return { ok: false, error: `Ongeldige subdomain "${subdomain}"` }
  }

  log(`Store ${safe} verwijderen van ${host}...`)
  const res = await runSsh(
    `sudo rm -f /etc/nginx/sites-enabled/${safe} /etc/nginx/sites-available/${safe} && ` +
    `sudo rm -rf /var/www/stores/${safe} && ` +
    `sudo nginx -t && sudo systemctl reload nginx`,
    45_000,
    log,
  )
  if (!res.ok) {
    return { ok: false, error: `Verwijderen mislukt (exit=${res.exitCode}): ${res.output.slice(-300) || '<geen output>'}` }
  }
  log(`Store ${safe} verwijderd ✓`)
  return { ok: true }
}

export async function getHighestNginxPort(): Promise<number> {
  const res = await runSsh(
    `grep -rh "listen" /etc/nginx/sites-available/ 2>/dev/null | grep -v "listen 80" | grep -oE "[0-9]{4,}" | sort -n | tail -1`,
  )
  return parseInt(res.output.trim(), 10) || 0
}

export async function scanDeployedStores(): Promise<Array<{ subdomain: string; port: number }>> {
  const { host } = env()
  if (!host) return []

  // List all nginx site configs (exclude 'default')
  const listRes = await runSsh(
    `ls /etc/nginx/sites-available/ 2>/dev/null | grep -v '^default$'`,
    15_000,
  )
  if (!listRes.ok || !listRes.output.trim()) return []

  const names = listRes.output.trim().split('\n').map(s => s.trim()).filter(Boolean)
  const results: Array<{ subdomain: string; port: number }> = []

  for (const subdomain of names) {
    // Extract non-80 listen port from the config
    const portRes = await runSsh(
      `grep -h "listen" /etc/nginx/sites-available/${subdomain} 2>/dev/null | grep -v "listen 80" | grep -oE "[0-9]{4,}" | head -1`,
      10_000,
    )
    const port = parseInt(portRes.output.trim(), 10)
    if (port > 1024) results.push({ subdomain, port })
  }

  return results
}
