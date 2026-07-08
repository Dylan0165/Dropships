// ═══════ Publieke basis-URL (Cloudflare Tunnel) ═══════
// Mollie eist een webhook-URL die vanaf het publieke internet bereikbaar is —
// het LAN (192.168.121.x) is dat niet, vandaar de structurele 422's. De
// cloudflared-manager (scripts/cloudflared-manager.cjs, PM2 op de tool-server)
// start een Cloudflare Quick Tunnel naar deze API en registreert de toegewezen
// https://*.trycloudflare.com URL hier. Quick-tunnel URLs wijzigen bij herstart;
// daarom staat de actuele waarde in de settings-tabel (runtime muteerbaar,
// geen pm2 restart nodig) met env PUBLIC_BASE_URL als statische fallback
// (voor wie later een vast domein/named tunnel koppelt).

import db from './db.js'

const SETTINGS_KEY = 'public_base_url'

function settingGet(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch { return null }
}

/**
 * Is deze URL plausibel bereikbaar vanaf het publieke internet (Mollie's eis)?
 * Blokkeert privé-IP-ranges, localhost, .local en kale hostnames — precies de
 * adressen waar Mollie 422 "webhook URL is unreachable" op gaf.
 */
export function isPubliclyReachableUrl(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1') return false
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return false
  if (!host.includes('.')) return false                    // kale hostname (bv. "uicontrol")
  // Privé/loopback/link-local IPv4-ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
    if (a === 127 || a === 10 || a === 0) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 169 && b === 254) return false
  }
  return true
}

/** Actuele publieke basis-URL: settings (tunnel-manager) → env → null. */
export function getPublicBaseUrl(): string | null {
  const fromSettings = settingGet(SETTINGS_KEY)
  if (fromSettings && isPubliclyReachableUrl(fromSettings)) return fromSettings.replace(/\/$/, '')
  const fromEnv = process.env.PUBLIC_BASE_URL
  if (fromEnv && isPubliclyReachableUrl(fromEnv)) return fromEnv.replace(/\/$/, '')
  return null
}

/** Registreer/wis de publieke URL (aangeroepen door de cloudflared-manager). */
export function setPublicBaseUrl(url: string | null): { ok: boolean; error?: string } {
  if (url === null || url === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(SETTINGS_KEY)
    console.log('[public-url] publieke basis-URL gewist')
    return { ok: true }
  }
  const clean = url.trim().replace(/\/$/, '')
  if (!isPubliclyReachableUrl(clean)) {
    return { ok: false, error: `"${clean}" is geen publiek bereikbare URL (privé-IP/localhost/.local geweigerd)` }
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(SETTINGS_KEY, clean, clean)
  console.log(`[public-url] publieke basis-URL geregistreerd: ${clean}`)
  return { ok: true }
}

/**
 * Webhook-URL voor Mollie, of null als er (nog) geen publiek adres is.
 * Bij null hoort de payment ZONDER webhookUrl aangemaakt te worden — dan werkt
 * de betaling wel maar zonder automatische statusupdate (beter dan een 422
 * die de hele checkout blokkeert).
 */
export function getMollieWebhookUrl(): string | null {
  const base = getPublicBaseUrl()
  return base ? `${base}/api/webhooks/mollie` : null
}
