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

// ── Legacy-waarde guard ────────────────────────────────────────────────────────
// 192.168.121.8 is het OUDE store-server IP; de juiste is 192.168.121.11. Het
// oude adres dook herhaaldelijk op via stale .env-backups → "No route to host"
// bij elke deploy. Corrigeer runtime en waarschuw luid; de CI patcht ondertussen
// de backup zelf (zie .github/workflows/deploy.yml).
const LEGACY_STORE_IP = '192.168.121.8'
const CURRENT_STORE_IP = '192.168.121.11'
for (const key of ['STORE_SERVER_HOST', 'VITE_STORE_SERVER_HOST'] as const) {
  if (process.env[key]?.trim() === LEGACY_STORE_IP) {
    console.warn(`[env] ⚠ ${key}=${LEGACY_STORE_IP} is het OUDE store-server IP — runtime gecorrigeerd naar ${CURRENT_STORE_IP}. Fix de .env(-backup) op de server!`)
    process.env[key] = CURRENT_STORE_IP
  }
}

// Korte, key-veilige samenvatting voor debug (geen waarden loggen)
const cjOk = isConfigured(process.env.CJ_API_KEY) && isConfigured(process.env.CJ_EMAIL)
console.log(
  `[env] geladen — CJ: ${cjOk ? `geconfigureerd (${loadedFrom.CJ_API_KEY ?? 'shell'})` : 'niet geconfigureerd → mock-modus'}`
  + `, LLM_API_KEY: ${isConfigured(process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY) ? 'ja' : 'nee'}`,
)
