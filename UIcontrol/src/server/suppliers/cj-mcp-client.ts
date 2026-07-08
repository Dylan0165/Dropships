// ═══════ CJ Dropshipping MCP client (read-only product discovery) ═══════
// Docs: https://developers.cjdropshipping.com/en/api/api2/mcp.html
//
// ARCHITECTUUR (bewust):
//  - We gebruiken CJ's MCP server UITSLUITEND voor product-DISCOVERY: search,
//    variant-details, freight/shipping en warehouse-info. Dat zijn read-only,
//    informatieve tools waar het waardevol is als de LLM zelf kan verkennen.
//  - Order-plaatsing en accountmutaties lopen NOOIT via MCP. Die blijven op de
//    deterministische CJAdapter.placeOrder() REST-flow (met CJ_ENV sandbox/prod
//    guard). Zie de ALLOWLIST hieronder — muterende tools (create_order,
//    add_to_cart, *_dispute, merge_orders, get_order_list, verify_credentials…)
//    worden NOOIT aan de LLM aangeboden EN worden hard geblokkeerd in callTool.
//
//  - Transport: remote HTTPS "StreamableHTTP" endpoint. Geen extra subprocess
//    (bewuste keuze i.v.m. eerdere PM2-complexiteit met self-hosted processen).
//  - Credentials: hergebruikt de bestaande CJ-key. Standaard = CJ_API_KEY als
//    MCP-token; optioneel te overschrijven met CJ_MCP_TOKEN als jouw CJ-account
//    een apart MCP-token uit het dashboard gebruikt. Geen verplichte nieuwe env.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { isConfigured } from '../load-env.js'

// ── ALLOWLIST — de ENIGE tools die deze laag ooit uitvoert of aan de LLM toont ──
// Uitsluitend read-only/informatief. Alles wat hier NIET in staat is per definitie
// verboden (muterend / order / account). Dit is de veiligheidsgrens.
export const CJ_MCP_DISCOVERY_TOOLS = new Set<string>([
  'search_products',           // product search op keyword/prijs/categorie
  'query_sku_details',         // variant-details + pricing (read-only)
  'calculate_freight',         // verzendkosten-berekening (read-only)
  'get_logistics_timeliness',  // levertijd-indicatie (read-only)
  'get_warehouses',            // warehouse-lijst (read-only)
])

// Expliciet verboden — puur ter documentatie/logging; de guard werkt via de
// allowlist (default-deny), niet via deze lijst.
export const CJ_MCP_FORBIDDEN_TOOLS = new Set<string>([
  'create_order', 'create_dispute', 'cancel_dispute', 'merge_orders',
  'add_to_cart', 'get_order_list', 'get_pay_order_list', 'list_shops',
  'list_disputes', 'get_dispute_detail', 'verify_credentials', 'check_login_status',
])

const DEFAULT_MCP_HOST = process.env.CJ_MCP_URL ?? 'https://developers.cjdropshipping.cn/mcp'
const CONNECT_TIMEOUT_MS = 12_000
const CALL_TIMEOUT_MS = 30_000

export class McpUnavailableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'McpUnavailableError'
  }
}

/** Verboden tool geprobeerd — dit hoort structureel onmogelijk te zijn. */
export class McpForbiddenToolError extends Error {
  constructor(toolName: string) {
    super(`MCP tool "${toolName}" is niet toegestaan in de discovery-laag (alleen read-only tools; orders lopen via REST CJAdapter)`)
    this.name = 'McpForbiddenToolError'
  }
}

function mcpToken(): string {
  // Apart MCP-token heeft voorrang; anders de gewone CJ-key (zelfde credential).
  const tok = process.env.CJ_MCP_TOKEN
  if (isConfigured(tok)) return tok!.trim()
  const key = process.env.CJ_API_KEY
  return isConfigured(key) ? key!.trim() : ''
}

/** MCP bruikbaar? Vereist een echt token en niet expliciet uitgezet. */
export function isMcpConfigured(): boolean {
  if (/^(1|true|yes)$/i.test(process.env.CJ_MCP_DISABLED ?? '')) return false
  return mcpToken() !== ''
}

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ── Lazy singleton client ──────────────────────────────────────────────────────

let client: Client | null = null
let connecting: Promise<Client> | null = null

async function getClient(): Promise<Client> {
  if (client) return client
  if (connecting) return connecting

  if (!isMcpConfigured()) {
    throw new McpUnavailableError('CJ MCP niet geconfigureerd (geen CJ_MCP_TOKEN/CJ_API_KEY of CJ_MCP_DISABLED gezet)')
  }

  connecting = (async () => {
    const url = new URL(`${DEFAULT_MCP_HOST.replace(/\/$/, '')}/${mcpToken()}`)
    const transport = new StreamableHTTPClientTransport(url)
    const c = new Client(
      { name: 'dropship-uicontrol', version: '1.0.0' },
      { capabilities: {} },
    )
    try {
      await withTimeout(c.connect(transport), CONNECT_TIMEOUT_MS, 'MCP connect')
      client = c
      console.log('[cj-mcp] verbonden met CJ MCP server (remote StreamableHTTP)')
      return c
    } catch (err) {
      connecting = null
      throw new McpUnavailableError(`Kan geen verbinding maken met CJ MCP server: ${err instanceof Error ? err.message : String(err)}`, err)
    }
  })()

  try {
    return await connecting
  } finally {
    connecting = null
  }
}

/**
 * TEST-ONLY: injecteer een reeds-verbonden Client (bv. via InMemoryTransport)
 * zodat de allowlist-filter en de callTool-guard tegen een in-memory MCP-server
 * getest kunnen worden zonder echte CJ-verbinding. Niet gebruiken in productie.
 */
export function __setClientForTest(c: Client | null): void {
  client = c
  connecting = null
}

/** Reset de verbinding (bij fouten) zodat de volgende call opnieuw verbindt. */
export async function resetCjMcp(): Promise<void> {
  const c = client
  client = null
  connecting = null
  if (c) { try { await c.close() } catch { /* al dicht */ } }
}

// ── Publieke API ────────────────────────────────────────────────────────────────

/** Lijst de tools die de server aanbiedt, GEFILTERD tot de discovery-allowlist. */
export async function listDiscoveryTools(): Promise<McpToolDef[]> {
  const c = await getClient()
  let res
  try {
    res = await withTimeout(c.listTools(), CALL_TIMEOUT_MS, 'MCP listTools')
  } catch (err) {
    await resetCjMcp()
    throw new McpUnavailableError(`MCP listTools mislukt: ${err instanceof Error ? err.message : String(err)}`, err)
  }
  const tools = (res.tools ?? [])
    .filter(t => CJ_MCP_DISCOVERY_TOOLS.has(t.name))
    .map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    }))
  // Log welke muterende tools de server WEL aanbiedt maar wij bewust weglaten.
  const offeredForbidden = (res.tools ?? []).map(t => t.name).filter(n => !CJ_MCP_DISCOVERY_TOOLS.has(n))
  if (offeredForbidden.length) {
    console.log(`[cj-mcp] ${tools.length} discovery-tools toegestaan; ${offeredForbidden.length} niet-discovery tools bewust geweigerd (o.a. ${offeredForbidden.slice(0, 6).join(', ')})`)
  }
  return tools
}

/**
 * Voer een discovery-tool uit. HARDE GUARD: alles buiten de allowlist gooit een
 * McpForbiddenToolError vóórdat er ook maar iets naar CJ gaat. Er is dus geen
 * enkel pad waarlangs een LLM-toolcall een order plaatst of account muteert.
 */
export async function callDiscoveryTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (!CJ_MCP_DISCOVERY_TOOLS.has(name)) {
    console.error(`[cj-mcp] GEBLOKKEERD: poging tot niet-discovery tool "${name}" — genegeerd`)
    throw new McpForbiddenToolError(name)
  }
  const c = await getClient()
  let res
  try {
    res = await withTimeout(
      c.callTool({ name, arguments: args }),
      CALL_TIMEOUT_MS,
      `MCP callTool ${name}`,
    )
  } catch (err) {
    await resetCjMcp()
    throw new McpUnavailableError(`MCP callTool "${name}" mislukt: ${err instanceof Error ? err.message : String(err)}`, err)
  }
  return extractText(res)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout na ${ms}ms`)), ms)),
  ])
}

/** MCP tool-results zijn content-blocks; pak de tekst (meestal JSON-string). */
function extractText(res: unknown): string {
  const r = res as { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
  const parts = (r?.content ?? [])
    .filter(c => (c.type === 'text' || c.text) && typeof c.text === 'string')
    .map(c => c.text as string)
  return parts.join('\n')
}
