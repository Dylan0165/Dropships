import path from 'path'
import { atomicDeploy, scanDeployedStores } from '../store-platform/deploy.js'
import { allocatePort, reservePort, releasePort } from '../db.js'

export interface DeployInput {
  subdomain: string
  buildOutDir: string
  storeId: string
}

export interface DeployOutput {
  ok: boolean
  port: number
  releaseDir: string
  previewUrl: string
  error?: string
}

const STORE_BASE_DOMAIN = process.env.STORE_BASE_DOMAIN ?? 'localhost'

export async function deployStore(
  input: DeployInput,
  onLog?: (msg: string) => void,
): Promise<DeployOutput> {
  const log = onLog ?? ((m: string) => console.log(`[deployer] ${m}`))

  // Scan de ECHTE poorten op de nginx-server zodat de allocator poorten vermijdt
  // die de server al gebruikt (ook als de DB stale is). Best-effort: bij een
  // scan-fout valt de allocatie terug op de DB (pre-flight blijft als vangnet).
  let serverVhosts: Array<{ subdomain: string; port: number }> = []
  try {
    serverVhosts = await scanDeployedStores()
  } catch (err) {
    log(`nginx port-scan overgeslagen: ${err instanceof Error ? err.message : String(err)}`)
  }
  const ownVhost = serverVhosts.find(v => v.subdomain === input.subdomain && v.port > 0)
  const reserved = serverVhosts.filter(v => v.subdomain !== input.subdomain && v.port > 0).map(v => v.port)

  let port: number
  try {
    if (ownVhost) {
      // Redeploy: store draait al op deze poort op de server → hergebruik hem
      port = reservePort(input.storeId, ownVhost.port)
      log(`Redeploy: hergebruik bestaande server-poort ${port} voor ${input.subdomain}`)
    } else {
      port = allocatePort(input.storeId, reserved)
      log(`Port ${port} allocated for ${input.storeId} (${reserved.length} server-poorten gereserveerd)`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Port-allocatie mislukt: ${msg}`)
    return { ok: false, port: 0, releaseDir: '', previewUrl: '', error: msg }
  }

  const result = await atomicDeploy(
    input.subdomain,
    input.buildOutDir,
    port,
    onLog,
  )

  if (!result.ok) {
    releasePort(input.storeId)
    return {
      ok: false,
      port,
      releaseDir: result.releaseDir,
      previewUrl: '',
      error: result.error,
    }
  }

  const previewUrl = `http://${process.env.STORE_SERVER_HOST ?? 'localhost'}:${port}/`
  log(`Live: ${previewUrl}`)

  return {
    ok: true,
    port,
    releaseDir: result.releaseDir,
    previewUrl,
  }
}

export async function healthCheck(
  url: string,
  maxAttempts = 15,
  intervalMs = 2000,
): Promise<{ ok: boolean; attempts: number; statusCode?: number; error?: string }> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
      clearTimeout(timer)
      if (res.ok) return { ok: true, attempts: i, statusCode: res.status }
      // last attempt: report the failing status
      if (i === maxAttempts) return { ok: false, attempts: i, statusCode: res.status, error: `HTTP ${res.status}` }
    } catch (err) {
      if (i === maxAttempts) {
        return { ok: false, attempts: i, error: err instanceof Error ? err.message : String(err) }
      }
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return { ok: false, attempts: maxAttempts, error: 'exhausted retries' }
}

export function buildSubdomain(brandName: string, runId: string): string {
  const slug = brandName
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (slug.length >= 3) return slug
  return `store-${runId.slice(0, 8)}`
}
