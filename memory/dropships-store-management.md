# Store-beheer

Wat je aan een **live** winkel kunt veranderen zonder de pipeline opnieuw te
draaien, en hoe je er een netjes weghaalt.

## Model: overrides, niet overschrijven

| Kolom in `stores` | Wat erin staat |
|---|---|
| `store_data` | de originele pipeline-output — **wordt nooit gewijzigd** |
| `custom_data` | jouw bewerkingen, als overrides |

`mergedStore(storeId)` in `server/store-admin.ts` voegt beide samen (per product
op `id`). Daardoor kun je altijd terug naar de staat zoals de pipeline hem
opleverde: gooi `custom_data` weg en de winkel is weer origineel.

Bewerken en live zetten zijn **twee stappen**. Een wijziging landt in
`custom_data`; pas `POST /api/stores/:id/rebuild` bouwt en deployt opnieuw. Dat
kost 2-3 minuten, dus je wilt bewerkingen kunnen stapelen.

## Wat er kan

| Endpoint | Wat |
|---|---|
| `GET /api/stores/:id/editable` | de samengevoegde staat |
| `PUT /api/stores/:id/editable` | handmatige bewerking (merknaam, slogan, producten) |
| `POST /api/stores/:id/prices` | bulk: `percent`, `delta`, `roundTo`, optioneel `productIds` |
| `POST /api/stores/:id/ai-edit` | instructie in gewone taal → concrete wijzigingen |
| `GET /api/stores/:id/product-suggestions` | CJ-zoekresultaten voor deze niche |
| `POST /api/stores/:id/products` | producten bijzetten op supplier-id |
| `DELETE /api/stores/:id` | verwijderen (vereist bevestiging, zie onder) |

In het admin-dashboard zit dit in de **Beheer**-tab van de StoreEditor.

### Prijzen

`applyPriceChange` rekent op de huidige prijzen. Twee vangnetten: niets zakt
onder €1, en een wijziging die niets verandert wordt niet opgeslagen.
`roundTo: 0.95` rondt af op een charme-eindcijfer (24,13 → 24,95).

### AI-bewerking

De LLM krijgt de instructie plus de huidige teksten en prijzen, en levert alleen
de velden die hij verandert (`Skillslibrary/store-editor/SKILL.md`). Wat de LLM
**niet** kan, ongeacht wat de prompt zegt:

- producten toevoegen of verwijderen — het schema kent alleen bestaande `id`'s
- onbekende `id`'s doorvoeren — die worden er in `applyAiEdit` uitgefilterd
- supplier-velden aanraken — die staan niet in het schema; ze bepalen wat er bij
  CJ besteld wordt
- emoji smokkelen — de output gaat door dezelfde `sanitizeCopyDeep` als de pipeline

`applyAiEdit()` is bewust losgekoppeld van de LLM-aanroep, zodat juist dít deel
zonder API-call te testen is.

### Producten bijzetten

Je levert supplier-product-id's; titel, prijs, beeld en supplier-velden worden
**bij CJ opgehaald**, niet uit het verzoek overgenomen. Toegevoegde producten
krijgen een eigen weergave-id (`added-<pid>`) zodat store-interne id's stabiel
blijven als dezelfde sku later in een andere winkel opduikt.

## Verwijderen

Vereist een bevestiging: `{ "confirm": "<subdomein>" }`. Zonder of met de
verkeerde naam → **HTTP 428**. In de UI moet je de naam intypen. Een misklik in
een lijst mag geen live winkel offline halen.

Volgorde van opruimen — server eerst, database daarna, want andersom laat een
mislukte serveropruiming een weesbestand achter dat niemand meer kan vinden:

1. nginx-vhost + bestanden
2. eventueel PM2-proces (in het huidige model is dat er niet: stores zijn
   statische exports achter nginx; de stap bestaat voor legacy-winkels)
3. poort vrijgeven
4. design-combinatie vrijgeven voor de uniciteitscontrole
5. deals die naar deze winkel wijzen van het kopers-dashboard halen
6. de rij uit `stores` — daarmee verdwijnt hij ook uit de publieke etalage

De response bevat `steps[]` met wat er daadwerkelijk gebeurd is.

## Poorten

`allocatePort()` in `db.ts` kiest **altijd de laagste vrije poort** in
4001-4999, en is idempotent per store. Verwijder je de winkel op 4002 terwijl
4001 en 4003 bestaan, dan krijgt de volgende deploy 4002 — geen gaten.

De database is de bron van waarheid; de nginx-conf wordt meegelezen als
`reservedPorts` zodat een stale database geen poort uitdeelt die de server al
gebruikt.

## Beveiliging per store

Elke vhost (`store-platform/deploy-local.ts`) krijgt:

- `listen 127.0.0.1:<poort>` — de debug-poort is **loopback-only**. Zonder het
  expliciete adres luistert nginx op `0.0.0.0` en is elke winkel rechtstreeks
  van buiten bereikbaar, buiten de tunnel en Cloudflare om.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` en een `Content-Security-Policy` — allemaal met `always`,
  anders ontbreken ze op foutpagina's.

De CSP staat inline styles toe omdat de renderer die gebruikt; `connect-src`
laat precies twee doelen toe: de checkout-gateway en Stripe.

**SSL** loopt volledig via Cloudflare. TLS eindigt daar; de tunnel praat
onversleuteld met nginx op de loopback. Er staan dus geen certificaten op de VPS
en er is geen vernieuwing die kan verlopen.

## Regressietest

```bash
npm run verify:store-mgmt   # 35 assertions
```

Dekt poort-hergebruik (inclusief het gat opvullen), bulk-prijzen, dat overrides
de originele data intact laten, de AI-nabewerking, en de volledige verwijder-flow
met bevestiging. Het script logt in met een echt 2FA-account en ruimt dat daarna
op — draai het alleen lokaal, nooit tegen de VPS.
