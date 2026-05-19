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

  const { host, user } = env()
  if (!host) {
    return { ok: false, port, releaseDir: '', error: 'STORE_SERVER_HOST not set' }
  }

  const ts = Date.now()
  const storeRoot = `/var/www/stores/${subdomain}`
  const releaseDir = `${storeRoot}/releases/${ts}`

  // 1. Create release dir + upload build artefacts
  log(`Creating release dir ${releaseDir}`)
  const mkdirRes = await runSsh(
    `sudo mkdir -p ${releaseDir} ${storeRoot}/releases && sudo chown -R ${user}:${user} ${storeRoot}`,
  )
  if (!mkdirRes.ok) return { ok: false, port, releaseDir, error: `mkdir failed: ${mkdirRes.output.slice(-300)}` }

  log(`Uploading build artefacts...`)
  const scpRes = await runScp(builtOutDir, `${releaseDir}/`)
  if (!scpRes.ok) return { ok: false, port, releaseDir, error: `scp failed: ${scpRes.output.slice(-300)}` }

  // 2. Health check on the artefacts (ensure index.html exists)
  const healthRes = await runSsh(`test -f ${releaseDir}/out/index.html && echo ok`)
  if (!healthRes.ok || !healthRes.output.includes('ok')) {
    await runSsh(`sudo rm -rf ${releaseDir}`)
    return { ok: false, port, releaseDir, error: 'health check: index.html missing in out/' }
  }

  // 3. Atomic symlink swap  current → new release
  log(`Switching symlink to release ${ts}`)
  const swapRes = await runSsh(
    `sudo ln -sfn ${releaseDir} ${storeRoot}/current_new && sudo mv -T ${storeRoot}/current_new ${storeRoot}/current`,
  )
  if (!swapRes.ok) {
    // Rollback: keep the existing current if swap failed
    await runSsh(`sudo rm -rf ${releaseDir}`)
    return { ok: false, port, releaseDir, error: `symlink swap failed: ${swapRes.output.slice(-300)}` }
  }

  // 4. Write nginx vhost + reload
  log(`Writing nginx vhost for port ${port}`)
  const vhostContent = nginxVhost(subdomain, port)
  const vhostPath = `/tmp/${subdomain}.nginx.conf`

  // Write vhost locally then scp
  const tmpVhost = path.join(os.tmpdir(), `${subdomain}.nginx.conf`)
  fs.writeFileSync(tmpVhost, vhostContent, 'utf-8')
  const vhostScp = await runScp(tmpVhost, vhostPath)
  fs.unlinkSync(tmpVhost)

  if (!vhostScp.ok) return { ok: false, port, releaseDir, error: `vhost scp failed: ${vhostScp.output.slice(-200)}` }

  const nginxRes = await runSsh(
    `sudo mv ${vhostPath} /etc/nginx/sites-available/${subdomain} && ` +
    `sudo ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/${subdomain} && ` +
    `sudo nginx -t && sudo systemctl reload nginx`,
    45_000,
  )
  if (!nginxRes.ok) {
    log(`nginx reload failed — rolling back`)
    await rollback(subdomain, onLog)
    return { ok: false, port, releaseDir, error: `nginx reload failed: ${nginxRes.output.slice(-300)}` }
  }

  // 5. Prune old releases (keep MAX_RELEASES)
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
