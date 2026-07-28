/**
 * De WebSocket-URL van het dashboard — één plek, geen poortnummer.
 *
 * Eerder stond hier `${hostname}:${VITE_WS_PORT ?? '3001'}`. Die env-variabele
 * was nergens gedefinieerd, dus in de praktijk werd het altijd `:3001`. Lokaal
 * viel dat niet op; in productie loopt alles via de Cloudflare-tunnel op 443 en
 * is 3001 van buiten onbereikbaar (en dat hoort ook zo). Resultaat:
 * `wss://api.clynado.com:3001/ws failed`, eindeloos herhaald.
 *
 * De oplossing heeft geen configuratie nodig, want `/ws` is in élke omgeving op
 * dezelfde origin te bereiken:
 *
 *   • Vite dev (:5173)  — vite.config.ts proxyt `/ws` naar ws://localhost:3001
 *   • Express serveert  — de UI-build en de WS-server delen dezelfde poort
 *     de build (:3001)
 *   • Productie (:443)  — de tunnel stuurt api.clynado.com naar 127.0.0.1:3001
 *
 * `window.location.host` bevat de poort alleen als die er is (`localhost:5173`
 * wél, `api.clynado.com` niet). Precies wat we willen — vandaar `host` en niet
 * `hostname`.
 *
 * Moet je toch naar een andere backend praten, geef dan een expliciete `url`
 * mee aan `usePipelineSocket`. Dat is de ontsnappingsroute; een env-variabele
 * met een default-poort was juist de bron van deze bug.
 */
export function dashboardWsUrl(path = '/ws'): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
