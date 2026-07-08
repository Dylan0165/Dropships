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

  let port: number
  try {
    port = allocatePort(input.storeId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Port-allocatie mislukt: ${msg}`)
    return { ok: false, port: 0, releaseDir: '', previewUrl: '', error: msg }
  }

  log(`Port ${port} allocated for ${input.storeId}`)

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
