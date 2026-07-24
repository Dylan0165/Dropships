// ═══════ Robuuste env-loader ═══════
// Vervangt `import 'dotenv/config'`. Laadt zowel UIcontrol/.env als de repo-root
// .env, zodat een key werkt ONGEACHT in welk van de twee bestanden hij staat —
// de CJ-sectie + .env.example staan in de root, dus daar zou je 'm logischerwijs
// invullen, terwijl het proces (cwd=UIcontrol) anders alleen UIcontrol/.env leest.
//
// Regels:
//  - Echte waarden winnen; lege of placeholder-waarden (bv. "your_cj_api_key_here")
//    overschrijven NOOIT een echte waarde en tellen niet als "geconfigureerd".
//  - Al bestaande echte waarden uit de shell/PM2-omgeving blijven staan.
//  - UIcontrol/.env heeft voorrang op de root (meer specifiek), root vult gaten.

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uiRoot = path.resolve(__dirname, '../../')   // .../UIcontrol
const repoRoot = path.resolve(uiRoot, '..')         // repo root

const PLACEHOLDER = /^(your[_-]|changeme|placeholder|<|xxx+$|\.\.\.)/i

export function isConfigured(value: string | undefined | null): boolean {
  if (!value) return false
  const v = value.trim()
  return v !== '' && !PLACEHOLDER.test(v)
}

/**
 * Merge .env-bestanden in `target` (default process.env), in volgorde. Echte
 * waarden winnen; lege/placeholder-waarden overschrijven nooit een echte waarde.
 * Retourneert per key uit welk bestand de gekozen echte waarde kwam (voor debug).
 */
export function applyEnvFiles(files: string[], target: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const loadedFrom: Record<string, string> = {}
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    let parsed: Record<string, string>
    try {
      parsed = dotenv.parse(fs.readFileSync(file))
    } catch {
      continue
    }
    const label = path.basename(path.dirname(file)) + '/.env'
    for (const [key, val] of Object.entries(parsed)) {
      const existing = target[key]
      if (isConfigured(val) && !isConfigured(existing)) {
        target[key] = val
        loadedFrom[key] = label
      } else if (existing === undefined) {
        // niet-echte waarde alleen zetten als de var nog helemaal niet bestaat
        target[key] = val
      }
    }
  }
  return loadedFrom
}

// Voorrang: UIcontrol/.env eerst, root daarna (root vult alleen gaten)
const loadedFrom = applyEnvFiles([path.join(uiRoot, '.env'), path.join(repoRoot, '.env')])

// ── Deploy-config sanity guard ──────────────────────────────────────────────────
// De oude schoolomgeving had twee servers en een hardgecodeerde legacy-IP guard
// (192.168.121.8 → .11). Sinds de één-server-VPS-migratie (juli 2026) is die weg:
// STORE_SERVER_HOST is normaal LEEG en de deploy is lokaal (DEPLOY_MODE=local).
// Wat blijft nuttig: waarschuwen bij een tegenstrijdige config — SSH-deploy
// gevraagd terwijl het host-adres privé/lokaal is (kan niet werken vanaf één VPS
// en was precies de bron van de "no route to host"-ellende).
function isPrivateOrLocalHost(h: string): boolean {
  const host = h.trim().toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '::1') return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
  return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
}
const deployMode = (process.env.DEPLOY_MODE ?? '').trim().toLowerCase()
const storeHost = process.env.STORE_SERVER_HOST ?? ''
if ((deployMode === 'ssh' || deployMode === 'remote') && isPrivateOrLocalHost(storeHost)) {
  console.warn(`[env] ⚠ DEPLOY_MODE=${deployMode} maar STORE_SERVER_HOST="${storeHost}" is een privé/lokaal adres. Voor één-server-deploy hoort DEPLOY_MODE=local (geen STORE_SERVER_HOST). SSH-naar-localhost wordt bewust niet ondersteund.`)
}

// Korte, key-veilige samenvatting voor debug (geen waarden loggen)
const cjOk = isConfigured(process.env.CJ_API_KEY) && isConfigured(process.env.CJ_EMAIL)
console.log(
  `[env] geladen — CJ: ${cjOk ? `geconfigureerd (${loadedFrom.CJ_API_KEY ?? 'shell'})` : 'niet geconfigureerd → mock-modus'}`
  + `, LLM_API_KEY: ${isConfigured(process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY) ? 'ja' : 'nee'}`,
)
