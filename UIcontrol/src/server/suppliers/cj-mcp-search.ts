// ═══════ MCP-gestuurde product discovery ═══════
// De LLM (DeepSeek) krijgt persona/niche als context en roept ZELF de CJ MCP
// discovery-tools aan (search_products, evt. query_sku_details / calculate_freight
// / get_warehouses). Wij voeren die tool-calls uit via de allowlist-guarded
// callDiscoveryTool(). De daadwerkelijke kandidaat-producten komen uit de
// search_products tool-results (echte CJ-data), niet uit LLM-verzinsels.
//
// Bovenop wat MCP teruggeeft passen we ONZE eigen checks toe:
//   - isRelevantToQuery() (vertrouw CJ's relevantie niet blind)
//   - EU-warehouse voorkeur
//
// Faalt de MCP-verbinding of is-ie niet geconfigureerd → McpUnavailableError,
// zodat de wizard terugvalt op de directe REST-search (CJAdapter).

import { isRelevantToQuery, mapCjListProduct, sortByShippingPreference } from './cj-adapter.js'
import { EU_WAREHOUSES, type SupplierProduct } from './types.js'
import {
  callDiscoveryTool, isMcpConfigured, listDiscoveryTools, McpUnavailableError,
  type McpToolDef,
} from './cj-mcp-client.js'

const LLM_BASE = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1'
const MAX_TOOL_ROUNDS = 5

export interface McpPersonaContext {
  label?: string
  interests?: string[]
  problem?: string
  priceRange?: { min: number; max: number }
}

export interface McpDiscoveryResult {
  products: SupplierProduct[]
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>
  primaryTerm: string | null
}

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** DeepSeek discovery-loop met MCP-tools. Gooit McpUnavailableError bij falen. */
export async function mcpProductDiscovery(
  niche: string,
  persona: McpPersonaContext,
  options: { maxResults?: number } = {},
): Promise<McpDiscoveryResult> {
  if (!isMcpConfigured()) {
    throw new McpUnavailableError('CJ MCP niet geconfigureerd')
  }
  const apiKey = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new McpUnavailableError('LLM_API_KEY ontbreekt — MCP-discovery vereist de LLM voor tool-orchestratie')

  const maxResults = options.maxResults ?? 30
  const toolDefs = await listDiscoveryTools()   // kan McpUnavailableError gooien
  if (toolDefs.length === 0) {
    throw new McpUnavailableError('CJ MCP server biedt geen discovery-tools aan')
  }

  const openAiTools = toolDefs.map(toOpenAiTool)

  // Accumulators — hierin verzamelen we de ECHTE CJ-producten uit search_products,
  // los van wat de LLM als eindtekst produceert.
  const collected = new Map<string, SupplierProduct>()
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  let primaryTerm: string | null = null

  const messages: Array<Record<string, unknown>> = [
    {
      role: 'system',
      content:
        'You are a dropshipping product sourcing assistant for the EU market. '
        + 'Use the CJ Dropshipping tools to SEARCH for products that fit the given store idea and target persona. '
        + 'Call search_products with concise ENGLISH product keywords (1-3 words, the product noun, e.g. "portable blender"). '
        + 'You may refine with a second search or inspect variants/shipping if useful. '
        + 'Search ALL warehouses worldwide — do not restrict to one country. EU-stocked products (DE, NL, FR, IT, ES, PL, CZ) are preferred for fast shipping, but slower China-shipped products are also fine; they will be labelled with their delivery time. '
        + 'When you have gathered enough relevant candidates, stop calling tools and reply with a short plain-text summary. '
        + 'You never place orders or modify the cart — only discovery.',
    },
    {
      role: 'user',
      content:
        `Store idea (any language): "${niche}"\n`
        + `Target persona: ${JSON.stringify(persona)}\n\n`
        + `Find relevant products (aim for ${maxResults} candidates) via search_products. `
        + `Translate the idea into English product keywords yourself.`,
    },
  ]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callLlm(apiKey, messages, openAiTools)
    const choice = resp.choices?.[0]
    const msg = choice?.message
    if (!msg) break

    // Assistant message met tool_calls terug in de historie stoppen
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
    })

    const calls: OpenAiToolCall[] = msg.tool_calls ?? []
    if (calls.length === 0) break   // LLM is klaar

    for (const call of calls) {
      const name = call.function?.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function?.arguments || '{}') } catch { /* leeg laten */ }
      toolCalls.push({ name, args })

      let toolResult: string
      try {
        // callDiscoveryTool bevat de HARDE allowlist-guard: een order-tool zou
        // hier al gegooid hebben vóór er iets naar CJ gaat.
        toolResult = await callDiscoveryTool(name, args)
      } catch (err) {
        if (err instanceof McpUnavailableError) throw err   // → wizard fallt terug op REST
        // Verboden tool of andere tool-fout: meld het aan de LLM, breek niet af.
        toolResult = `ERROR: ${err instanceof Error ? err.message : String(err)}`
      }

      // search_products resultaten → echte kandidaten oogsten
      if (name === 'search_products') {
        if (!primaryTerm) primaryTerm = extractKeyword(args)
        harvestProducts(toolResult, niche, collected, maxResults)
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: truncate(toolResult, 6000),
      })
    }

    if (collected.size >= maxResults) break
  }

  return {
    products: Array.from(collected.values()),
    toolCalls,
    primaryTerm,
  }
}

// ── Product-oogst uit een search_products tool-result ─────────────────────────

function harvestProducts(
  raw: string,
  niche: string,
  collected: Map<string, SupplierProduct>,
  maxResults: number,
): void {
  const list = extractProductList(raw)
  // EU-warehouse voorkeur: EU-producten eerst verwerken
  const euFirst = [...list].sort((a, b) => euRank(a) - euRank(b))
  for (const rawItem of euFirst) {
    if (collected.size >= maxResults) break
    const warehouse = pickWarehouse(rawItem)
    const p = mapCjListProduct(rawItem, warehouse)
    if (!p) continue
    // Onze eigen relevantie-check bovenop CJ (vertrouw CJ niet blind)
    if (!isRelevantToQuery(niche, p)) continue
    if (!collected.has(p.productId)) collected.set(p.productId, p)
  }
}

const EU_SET = new Set<string>(EU_WAREHOUSES as readonly string[])

function euRank(raw: Record<string, unknown>): number {
  const wh = pickWarehouse(raw)
  return wh && EU_SET.has(wh.toUpperCase()) ? 0 : 1
}

function pickWarehouse(raw: Record<string, unknown>): string | undefined {
  const cand = raw.countryCode ?? raw.warehouse ?? raw.warehouseCountryCode ?? raw.areaEn ?? raw.countryCodeEn
  return cand ? String(cand) : undefined
}

/** Parse een MCP tool-result (JSON-string of tekst) naar een productenlijst. */
function extractProductList(raw: string): Array<Record<string, unknown>> {
  const json = tryParseJson(raw)
  if (!json) return []
  // Bekende CJ-envelopes: {data:{list:[]}}, {data:[]}, {list:[]}, [], {products:[]}
  const candidates: unknown[] = [
    (json as any)?.data?.list,
    (json as any)?.data?.products,
    (json as any)?.data,
    (json as any)?.list,
    (json as any)?.products,
    json,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length && typeof c[0] === 'object') {
      return c as Array<Record<string, unknown>>
    }
  }
  return []
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim()
  try { return JSON.parse(trimmed) } catch { /* ga door */ }
  // Soms staat de JSON in een groter tekstblok
  const m = trimmed.match(/[[{][\s\S]*[\]}]/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* geef op */ } }
  return null
}

function extractKeyword(args: Record<string, unknown>): string | null {
  const k = args.keyword ?? args.keyWord ?? args.productNameEn ?? args.query ?? args.name ?? args.q
  return k ? String(k) : null
}

// ── DeepSeek OpenAI-compatible tool-call helper ────────────────────────────────

async function callLlm(
  apiKey: string,
  messages: Array<Record<string, unknown>>,
  tools: unknown[],
): Promise<any> {
  const resp = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_EXECUTOR ?? 'deepseek-chat',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new McpUnavailableError(`LLM tool-orchestratie faalde (HTTP ${resp.status}): ${txt.slice(0, 160)}`)
  }
  return resp.json()
}

function toOpenAiTool(t: McpToolDef): unknown {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema && Object.keys(t.inputSchema).length
        ? t.inputSchema
        : { type: 'object', properties: {} },
    },
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + `\n…[${s.length - max} tekens ingekort]` : s
}
