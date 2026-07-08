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

// Voorrang: UIcontrol/.env eerst, root daarna (root vult alleen gaten)
const files = [path.join(uiRoot, '.env'), path.join(repoRoot, '.env')]
const loadedFrom: Record<string, string> = {}

for (const file of files) {
  if (!fs.existsSync(file)) continue
  let parsed: Record<string, string>
  try {
    parsed = dotenv.parse(fs.readFileSync(file))
  } catch {
    continue
  }
  for (const [key, val] of Object.entries(parsed)) {
    const existing = process.env[key]
    if (isConfigured(val) && !isConfigured(existing)) {
      process.env[key] = val
      loadedFrom[key] = path.basename(path.dirname(file)) + '/.env'
    } else if (existing === undefined) {
      // niet-echte waarde alleen zetten als de var nog helemaal niet bestaat
      process.env[key] = val
    }
  }
}

// Korte, key-veilige samenvatting voor debug (geen waarden loggen)
const cjOk = isConfigured(process.env.CJ_API_KEY) && isConfigured(process.env.CJ_EMAIL)
console.log(
  `[env] geladen — CJ: ${cjOk ? `geconfigureerd (${loadedFrom.CJ_API_KEY ?? 'shell'})` : 'niet geconfigureerd → mock-modus'}`
  + `, LLM_API_KEY: ${isConfigured(process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY) ? 'ja' : 'nee'}`,
)
