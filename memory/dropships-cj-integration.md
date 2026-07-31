# CJ Dropshipping-integratie

Twee kanalen naar CJ: de **REST-API** (alles) en **MCP** (uitsluitend
product-discovery). Het onderscheid is een bewuste veiligheidsbeslissing, geen
implementatiedetail.

## De harde regel

> **MCP is read-only discovery. Orders lopen NOOIT via MCP.**

Order-plaatsing en tracking gaan 100% via `CJAdapter.placeOrder()` /
`getTracking()` op REST. `fulfillment.ts` raakt MCP niet aan. Een LLM mag binnen
deze pipeline nooit autonoom een MCP-order-tool aanroepen.

Dit is afgedwongen met een **default-deny allowlist**, niet met een prompt-
instructie. `CJ_MCP_DISCOVERY_TOOLS` bevat exact:

```
search_products, query_sku_details, calculate_freight,
get_logistics_timeliness, get_warehouses
```

`callDiscoveryTool()` gooit een `McpForbiddenToolError` op **alles daarbuiten**
(`create_order`, `add_to_cart`, `*_dispute`, `merge_orders`, `get_order_list`, …)
— vóór er contact met de server is. `listDiscoveryTools()` filtert order-tools
bovendien weg uit de toolset, zodat de LLM ze nooit te zien krijgt.

Dat is met een test bewezen: een in-memory MCP-server die `create_order` wél
aanbiedt, blijft structureel onbereikbaar.

## REST-adapter (`suppliers/cj-adapter.ts`)

- CJ API v2, met tokencaching
- **Harde throttle van 1 request/seconde** via een interne queue, ongeacht hoeveel
  aanroepen er parallel binnenkomen. CJ's rate limit is streng; zonder de queue
  kreeg de wizard herhaaldelijk 429's.
- 429-retries met exponentiële backoff (3s / 6s / 12s / 24s / 48s), daarna een
  duidelijke fout in plaats van blijven hangen.
- `CJ_ENV`: geen key → **mock-modus**; `sandbox` → orders aanmaken maar nooit
  betalen; `production` → `payBalance` na `createOrderV2`.

## Warehouse-scope: wereldwijd, EU is voorkeur

Sinds 9 juli 2026 is EU **een label en een sorteervoorkeur, geen filter**.
`searchProducts` doet EU-passes plus één globale pass en sorteert EU-eerst
(`sortByShippingPreference`).

Sinds 28 juli 2026 zijn dat **3 representatieve EU-warehouses** (DE/FR/PL,
`CJ_SEARCH_WAREHOUSES`) in plaats van alle zeven. De globale pass ziet toch alle
voorraad; de landen-passes bestaan alleen om het warehouse — en dus de levertijd —
te kunnen taggen. Zeven landen taggen niet méér dan drie, ze kosten alleen vier
extra calls per zoekterm. Met een assortiment van 12 producttypes tikt dat aan.

`shippingDaysFor(warehouse)`:

| Warehouse | Levertijd |
|---|---|
| EU | 3-8 dagen |
| US / UK | 7-14 dagen |
| CN / onbekend | 15-30 dagen |

De UI toont per product een verzendbadge (groen "3-8d · DE", amber "15-30d · CN")
plus een weergave-toggle "Alleen snelle EU-verzending" die alleen filtert wát je
ziet. Geef je `options.warehouseCountries` expliciet mee, dán is het wél strikt.

Reden voor de omslag: een harde EU-filter maakte hele niches onvindbaar terwijl
de producten prima leverbaar waren, alleen langzamer.

## MCP-client (`suppliers/cj-mcp-client.ts`)

- Remote HTTPS StreamableHTTP naar
  `https://developers.cjdropshipping.cn/mcp/<token>`
- SDK: `@modelcontextprotocol/sdk`
- Token: `CJ_MCP_TOKEN`, of standaard `CJ_API_KEY`
- Uitzetten: `CJ_MCP_DISABLED=1`
- Status opvragen: `GET /api/suppliers/cj/mcp/status`

**Remote gekozen boven self-hosted**: CJ host de server zelf, dus self-hosting zou
alleen een extra proces en een extra faalpunt toevoegen zonder iets te winnen.

## Discovery-flow (`suppliers/cj-mcp-search.ts`)

`mcpProductDiscovery()` laat DeepSeek zelf `search_products` aanroepen in een
agentische lus (max 5 rondes). Onze eigen `isRelevantToQuery`-check en de
EU-warehouse-voorkeur draaien daar bovenop — de LLM-keuze is niet het laatste
woord. Faalt MCP → `McpUnavailableError`.

`wizard.ts buildShortlist` draait sinds 28 juli 2026 het **assortiment-pad**
(`suppliers/assortment.ts`): 10-15 producttypes, elk apart doorzocht via REST met
`{maxResults: 4, minResults: 2}` — één call per type in het gunstige geval. MCP
past daar niet in: `mcpProductDiscovery` is een agentische lus die zijn eigen
zoektermen bedenkt, en die twaalf keer draaien is duur zonder iets toe te voegen.

Faalt de producttype-generatie, dan valt hij terug op `buildShortlistSingleTerm`
→ `discoverCandidates`: **MCP eerst, dan REST** (`deriveSearchTerms` +
`adapter.searchProducts`). De response bevat `source: 'mcp' | 'rest' | 'mock'`.
Handmatig "Zelf zoeken" in de UI gaat altijd via REST met het directe keyword.

**Relevantie geldt op élk instroom-pad** (sinds 31 juli 2026). Het handmatige
zoek-endpoint had helemaal geen controle, en zo belandde een dalmatiër-pak "For
Adults" in een winkel met halsbanden en riemen. `costumeDisqualification()` in
`product-relevance.ts` draait nu vóór de LLM en weegt zwaarder dan
trefwoord-overlap: "dog" in de titel redt een verkleedpak niet. Handmatig zoeken
markeert (de operator zoekt bewust); het assortiment en "winkel aanvullen"
filteren weg. Titels gaan op 240 tekens naar de beoordelaar in plaats van 110 —
keyword-stapelaars zetten het beslissende woord achteraan.

Zoek-cache: identieke zoekterm+opties komen 10 minuten uit `searchCache`
(`CJ_SEARCH_CACHE_MS`). Na een 429 loopt de tussenruimte tussen calls vanzelf op
(×1,6 tot max 4s) en zakt terug na een minuut zonder rate limit.

## Niche-discovery (`server/niche-discovery.ts`)

`scanCatalog()` meet per CJ level-2-categorie (round-robin over de
hoofdcategorieën, cap `NICHE_SCAN_MAX_CATEGORIES`=24):

- **globaal totaal én EU(DE)-totaal** → `shippingProfile`:
  `eu-fast` (EU-aandeel ≥40%) / `mixed` (≥12%) / `mostly-cn`
- `sellPrice`-sample → marge bij 2,8× markup
- `listedNum` → populariteit
- top-8 ook met FR-spreiding

Varianten en trending-data bewust niet meegenomen: rate limit en geen endpoint.
Een scan kost 2 calls per categorie (~1-2 min bij 1 req/s).

Adapter-probes: `getCategoryTree()` (`/product/getCategory`) en `probeCategory()`
(`/product/list`; `countryCode` weglaten = wereldwijd). Beide hebben mock-varianten.

Een LLM clustert categorieën met ≥25 producten tot 5-8 nichethema's, mét persona
én shippingProfile in de onderbouwing (`generateNicheSuggestions`). Er is een
deterministische fallback zonder LLM. Er draait een overlap-check tegen bestaande
live stores.

Cache: settings-key `niche_discovery_cache`, TTL 24 uur.
`GET /api/wizard/niches` (`?refresh=1` forceert), antwoord-`status`:
`ready | scanning | stale-refreshing`. De scan draait async.

## Checkout-koppeling

Betaald (Stripe-webhook) → `fulfillment.ts` → `getSupplier('cj').placeOrder()`,
met retry en tracking. Zie `dropships-stripe-payments.md`.

## Endpoints

```
GET  /api/suppliers/cj/status
GET  /api/suppliers/cj/mcp/status
GET  /api/suppliers/cj/search
GET  /api/suppliers/cj/product/:pid
GET  /api/suppliers/cj/inventory/:pid
GET  /api/orders            POST /api/orders/:id/fulfill    GET /api/orders/:id/tracking
```
