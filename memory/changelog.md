# Changelog

Nieuwste bovenaan. Zie `ai-must-read/release-and-changelog.md` voor het formaat.

## 2026-07-31 — Verkleedkleding voor mensen in een hondenwinkel
**Tag:** volgt hieronder

- Een dalmatiër-pak "For Adults" en een "Polka-Dot Outfit For Women" stonden in
  de productgrid van trailpaw.clynado.com (halsbanden/riemen). Vierde keer dat
  keyword-gestapelde titels erdoorheen kwamen.
- **Uitgesloten dat het vóór de fix gebouwd was**: de CJ-afbeelding staat onder
  `product/2026/07/30/`, twee dagen ná de relevantie-fix. **Uitgesloten dat het
  via het assortiment kwam**: dat pad zet `productType` op elk product en die
  komt tot in `PRODUCTS` op de pagina — de live winkel heeft er nul.
- Bleven over: het handmatige zoek-endpoint (`/api/suppliers/cj/search`, ook
  achter de "Vervang"-knop) dat **helemaal geen relevantiecontrole** had, en het
  één-zoekterm-pad waar `scoreRelevance` wél draait maar zonder kostuumbesef.
- Twee aantoonbare gaten in de semantische laag zelf: `compact()` kapte titels af
  op **110 tekens**, precies waar keyword-stapelaars het beslissende woord
  neerzetten ("Polka-Dot Outfit For Women" viel eraf), en de prompt vroeg nergens
  **wie het product draagt** — een "dog costume" past ogenschijnlijk prima bij
  een hondenwinkel.
- Nieuw: `costumeDisqualification()` draait vóór de LLM. Kostuum-/verkleedsignalen
  wegen zwaarder dan trefwoord-overlap; afgewezen producten worden niet eens
  voorgelegd. `nicheIsAboutCostumes()` zet de regel uit voor een verkleedwinkel.
  Titels gaan nu op 240 tekens mee. Alle drie de instroom-paden gebruiken dezelfde
  poort; handmatig zoeken markeert in plaats van te blokkeren.
- **Contactgegevens gecentraliseerd** (`server/company.ts`): elke winkel toonde
  `support@<subdomein>.example` op de contactpagina en `hello@example.com` in de
  footer — allebei onbereikbaar. Nu één bron via `COMPANY_*`-env; niet-ingevulde
  velden worden weggelaten in plaats van verzonnen. Merknaam-generatie ongemoeid.
- **Geverifieerd:** `verify:costume` 22/22 met de exacte live titels,
  `verify:quality` 34/34, het echte endpoint door de 2FA-gate, en een gebouwde
  winkel met de Clynado-gegevens op de contactpagina. Zie
  `logs/kostuumfilter-en-contact-2026-07-31.md`.

## 2026-07-29 — Elke hero toonde de kale leveranciersfoto
**Tag:** volgt hieronder

- Audit van vijf teststores + de live winkel die de gebruiker het mooist vindt
  (sculpt-fade.clynado.com). Uitkomst: **5 van 5 hero's tonen `PRODUCTS[0].image`
  full-bleed uitgesneden**. Dat sculpt-fade er wél goed uitziet komt doordat CJ
  daar toevallig een lifestyle-foto leverde in plaats van een pakshot op wit —
  geluk bij de leverancier, niet iets wat de pipeline deed.
- Tweede bevinding uit dezelfde audit: de hero-copy van sculpt-fade is letterlijk
  `fallbackBrief()`. De winkel die als beste geldt draait voor de helft op
  deterministische code, niet op de store-builder-agent.
- `design/hero-visual.ts` (nieuw): **lifestyle** (echt sfeerbeeld, mag bijgesneden)
  of **staged** (productfoto NIET uitsnijden maar presenteren op een kleurverloop
  uit het design-DNA, in full-bleed hero's rechts naast de tekst). Er is altijd
  één van beide — een lege of gebroken hero kan niet meer.
- `generateHeroImage()` haakt image-gen eindelijk in de store-build, maar alleen
  met een key en met een harde time-out; het bestand gaat mee de winkel in
  (`/img/hero.webp`) want provider-URL's verlopen.
- **Componentbreedte**: de afgeleide selectie koos uit hardgecodeerde lijstjes van
  3-4 id's (55 van 106 bereikbaar; 4 van 5 winkels kregen dezelfde nav én footer
  én gallery). Nu: hele categorie per gleuf + `component_usage`-tabel die
  bijhoudt wat al ergens staat. Bereik 55 → **102 van 106**, 5,6 → **9,5 unieke
  componenten per winkel**, nav/footer nergens dubbel over zes winkels.
- **Toon-monocultuur**: `deriveTone` gaf +3 voor `priceMax >= 55` tegen een jitter
  van 0,9 — vier van vijf winkels werden "premium", en toon bepaalt palet, fonts
  én componentpools. Prijs telt nu mee als hint (≥85 → +1,5), jitter naar 1,8.
- **Copy**: SKILL-sectie "Copy that works" met goede/slechte voorbeelden en vier
  tests; cta-banden 4 → 8, verhaal-varianten flink uitgebreid, en "Join thousands
  of happy customers" verwijderd — dat is een verzonnen aantal.
- Onderweg: `downloadFile` sprak hardgecodeerd https, waardoor een http-redirect
  stil mislukte en de verlopende provider-URL in de winkel belandde.
- **Geverifieerd:** `verify:quality` 26/26, drie nieuwe teststores echt gebouwd
  (`next build`) met `object-fit: contain` in plaats van `cover`, screenshots voor
  en na. Zie `logs/visuele-kwaliteit-2026-07-29.md`.

## 2026-07-28 — Een te klein assortiment legde de hele run om
**Tag:** volgt hieronder

- Een smalle niche die terecht 2 producten oplevert (gewenst gedrag sinds de
  assortiment-fix) eindigde ~3 minuten later in `"brief generation failed"`.
- **De hypothese "de brief gaat uit van een minimum aantal producten" klopte
  niet** — die ondergrens bestaat nergens. Wat er wél was: `generateBrief()` gaf
  `StoreBrief | null` terug en gooide daarmee `error` + `validationErrors` van
  `runAgent` weg. De melding was dus per constructie onbruikbaar.
- Stage 7 had vangnetten voor het design-DNA en voor de componentassemblage,
  maar niet voor de brief zelf. Nu wel: `fallbackBrief()` stelt een geldige brief
  samen uit de brand-stage (naam, slogan, kleuren, USP's) en de run bouwt door.
  Dat wordt luid gelogd en staat als `brief_source: 'fallback'` + `brief_error`
  in de stage-output — nooit stil.
- De brief krijgt nu een `collection`-blok mee (`product_count`, `product_types`,
  guidance). Bij 2 producten: "design a focused single-product-style store, do
  NOT pick a catalog layout, never invent products".
- Vanaf poging 2 gaat de componentcatalogus uit de prompt (41k → 2k tekens).
  Een afgekapt antwoord wordt niet beter van dezelfde volle prompt. Levert het
  model alleen `reasoning_content` terug, dan zegt de fout dat nu letterlijk
  in plaats van "no parseable JSON".
- **De wizard vraagt het nu vóóraf**: bij < 5 producten verschijnt direct na de
  assortiment-fase (854 ms, niet 3 minuten) een keuze — doorgaan met een kleinere
  winkel / niche breder maken / andere niche. "Volgende" blijft dicht tot er
  gekozen is.
- **Geverifieerd:** 27/27 tegen een nagebootst LLM-endpoint, plus een écht
  gebouwde 2-product-winkel (`next build`, exit 0) en alle drie de UI-keuzes in
  een headless browser. Zie `logs/klein-assortiment-2026-07-28.md`.

## 2026-07-28 — Een winkel is een assortiment, geen één-product-pagina
**Tag:** volgt hieronder

- De wizard bedacht per niche wél meerdere producttypes (beard grooming kit,
  beard oil, beard brush) maar **zocht alleen de eerste af**: `discoverCandidates`
  brak de lus af bij de eerste term die íets opleverde. `fitProducts` vulde de
  rest daarna aan met **klonen** van al gekozen producten (`--v1`-suffix). Netto
  een winkel die vol leek en drie keer hetzelfde item toonde.
- Nieuw: `suppliers/product-types.ts` (10-15 distincte types per niche, gespreid
  over instap/midden/premium) + `suppliers/assortment.ts` (zoekt **elk** type af,
  scoort alles in één call, kiest per type de beste). Te weinig → eerst EXTRA
  types laten bedenken, dan een tweede prijsvariant per type. Nooit duplicaten of
  half-passende producten om een quotum te halen; wel een eerlijke melding met
  het echte aantal.
- De duplicate-opvulling in `fitProducts` is **weg**. Er wordt ook niet meer
  teruggeschaald naar een geseed doel-aantal — wat de gebruiker kiest, komt op de
  winkel (alleen boven 15 begrensd).
- Efficiëntie was hier een ontwerp-eis: 12 types × 8 warehouse-passes zou bijna
  twee minuten rate-limit kosten. Warehouse-passes van 7 EU naar 3
  representatieve (DE/FR/PL) + globale pass, `minResults` stopt de rest zodra er
  genoeg is, plus een korte zoek-cache en spacing die na een 429 vanzelf oploopt.
  **Gemeten: 48 → 12 calls** voor 12 producttypes (75% minder).
- `productType` loopt nu door de hele keten tot in `PRODUCTS` op de pagina en
  wordt daar de **categorie-indeling**: `products.category-tabs` bij ≥3 types en
  ≥8 producten. `fitsCollection` corrigeert een LLM die een `few-products`-weergave
  kiest voor twaalf producten (en logt dat).
- **Geverifieerd:** assortiment 23/23, efficiëntie 6/6, collectie-rendering 15/15,
  plus een écht gebouwde teststore (`next build`) waarin alle 12 producten en 12
  categorie-tabs zichtbaar zijn. Zie `logs/assortiment-2026-07-28.md`.

## 2026-07-28 — WebSocket zat buiten de 2FA-gate
**Tag:** volgt hieronder

- `/ws` loopt via `server.on('upgrade')` op de HTTP-server en gaat dus buiten
  Express om — `requireAuth` kwam er nooit langs. Iedereen die het adres kende
  kon zonder in te loggen meelezen met live pipeline- en build-updates.
- `sessionUserFromCookieHeader()` in `auth-routes.ts` hergebruikt
  `getSessionUser()`; alleen het uitlezen van de rauwe Cookie-header is extra.
  De sessielogica blijft daarmee op één plek.
- Ook een **origin-controle**: WebSockets kennen geen CORS, dus de browser
  stuurt de cookie ook mee bij een handshake vanaf een vreemde site.
  `SameSite=Strict` dekt dat af, maar niet als die vlag ooit versoepeld wordt.
- Afwijzen met een echt `401`/`403` vóór `socket.destroy()` — een kale destroy
  geeft alleen een vage netwerkfout en is niet met curl te controleren.
- **Geverifieerd (10/10):** zonder cookie, met een verzonnen token, met een
  irrelevante cookie en ná uitloggen → `HTTP 401`; met sessie → `HTTP 101` plus
  ping/pong; vreemde origin → `403`. Het echte dashboard in een headless browser
  verbindt nog gewoon en toont Live groen.

## 2026-07-28 — WebSocket verbond met een hardgecodeerde poort 3001
**Tag:** volgt hieronder

- De frontend bouwde de WS-URL als `${hostname}:${VITE_WS_PORT ?? 3001}/ws`.
  Die env-variabele was **nergens gedefinieerd**, dus het werd altijd `:3001`.
  In productie loopt alles via de tunnel op 443 en is 3001 van buiten dicht →
  `wss://api.clynado.com:3001/ws failed`, eindeloos herhaald.
- Nieuwe helper `src/lib/ws.ts`: `dashboardWsUrl()` gebruikt
  `window.location.host` zonder poort. Werkt in alle drie de omgevingen —
  Vite proxyt `/ws` al naar 3001, Express deelt de poort met de UI-build, en de
  tunnel routeert intern door. **Geen env-variabele nodig**; een default-poort
  in configuratie was juist de oorzaak.
- Logica stond gedupliceerd in `usePipelineSocket` en `TopBar`; nu één plek.
- **Geverifieerd:** WS opent en pingt in dev via :5173 én direct op :3001;
  de gebouwde bundel bevat 0× `:3001`, 0× `VITE_WS_PORT`, 0× `location.hostname`;
  het echte dashboard in een headless browser opent 2 sockets naar
  `ws://localhost:3001/ws`, ontvangt een heartbeat-frame en toont Live groen.

## 2026-07-28 — Productie lag plat: meegecommitte SQLite-WAL
**Tag:** zie `memory/logs/incident-2026-07-28-sqlite-corrupt.md`

- `dropship.db-wal` (2,2 MB) en `-shm` stonden **in git** — `*.db` in
  `.gitignore` dekt die extensies niet. Elke deploy zette met `git reset --hard`
  een dev-WAL over de productie-WAL heen; SQLite weigerde met SQLITE_CORRUPT en
  `uicontrol` stond op **1982 pm2-herstarts**. Poort 3001 werd nooit gebonden.
- Zijbestanden untracked + `*.db-wal`/`*.db-shm`/`*.db-journal` genegeerd.
- Workflow-stap `Guard database files` blokkeert een herhaling en ruimt
  verweesde zijbestanden op.
- De niches-seeding stond op moduleniveau en sloopte daarmee de hele boot; nu
  in een try/catch. **Geverifieerd:** met een moedwillig verminkte database komt
  de API op (`/api/health` 200) in plaats van te crashloopen.
- Ook nieuw in `db.ts`: `openDatabase()` zet zijbestanden opzij bij
  SQLITE_CORRUPT. Dat vangnet is *niet* aantoonbaar getriggerd — zie het log.

## 2026-07-28 — Store-beheer + beveiliging per winkel
**Tag:** zie `memory/logs/fase-4-store-beheer.md`

- `server/store-admin.ts`: live winkels bewerken zonder de pipeline opnieuw te
  draaien — handmatig, in bulk (prijzen) of via een AI-instructie. Alles als
  override in `custom_data`; de originele pipeline-output blijft staan. Nieuwe
  **Beheer**-tab in de StoreEditor.
- Producten bijzetten uit CJ: gegevens komen van de leverancier, niet uit het
  verzoek — dat is wat fulfillment straks bestelt.
- **Verwijderen vereist nu de naam intypen** (HTTP 428 zonder). Ruimt ook de
  design-combinatie en de deals op het kopers-dashboard op; de response bevat
  wat er daadwerkelijk gebeurd is.
- **Beveiliging per winkel:** debug-poort naar `listen 127.0.0.1:<poort>` — die
  stond op `0.0.0.0` en was dus rechtstreeks van buiten bereikbaar, buiten de
  tunnel om. Plus een CSP en vier beveiligingsheaders met `always`. De
  poort-parser is meegegaan met de nieuwe listen-vorm.
- **IPv6-gat in de rate-limiting gedicht** (`ipKeyGenerator`): een IPv6-gebruiker
  kon de loginlimiet uitzitten door binnen z'n eigen /64 van adres te wisselen.
  express-rate-limit waarschuwde daar bij elke start voor.
- **Deploy-workflow gerepareerd** na een gemelde falende run: de health check
  wachtte 6s op een server die ~14s nodig heeft, en eiste HTTP 200 op `/` terwijl
  de auth-gate 302 geeft — die stap zou élke deploy hebben laten falen. Nu een
  wachtlus tot 120s, acceptatie van de redirect, en `pm2 logs` bij falen.
- **Geverifieerd:** 35/35 assertions, waaronder poort 4002 die na het verwijderen
  van die winkel terugkomt bij de volgende deploy.
- **Niet geverifieerd:** de AI-bewerking met een echte LLM-aanroep — de
  DeepSeek-key in de lokale dev-`.env` is ongeldig (op de VPS staat de juiste).
  De nabewerking die de LLM in toom houdt is wél getest.

## 2026-07-28 — Centrale checkout-gateway
**Tag:** zie `memory/logs/fase-3-centrale-checkout.md`

- **Kritieke bug gevonden en gefixt:** `/api/checkout/session` stond niet in
  `isPublicPath()`, dus sinds de 2FA-gate kreeg élke betaalpoging vanuit een
  store `401 Niet ingelogd`. Checkout was volledig kapot.
- `server/checkout-gateway.ts`: alle stores praten met één endpoint, dat zichzelf
  verdedigt met (1) een strikte origin-check op `*.clynado.com`, (2) een
  live-store-check, (3) prijs-herberekening uit de opgeslagen catalogus.
  Supplier-velden komen ook uit de catalogus — die bepalen wat er bij CJ besteld
  wordt en mogen dus nooit van de client komen.
- CORS kaatste eerder élke origin terug; nu alleen het eigen domein, met
  `Vary: Origin`.
- `CHECKOUT_API_URL` wees nog naar het hardgecodeerde schooladres
  `192.168.121.133`; nu afgeleid van de publieke tunnel-URL.
- **Geverifieerd:** 23/23 gateway-assertions (waaronder een prijsmanipulatie die
  2× €0,01 vroeg en €99,90 opleverde) en 11/11 voor de volledige keten tot een
  CJ-order via een ondertekende webhook. `fulfillment.ts` bleef ongewijzigd.

## 2026-07-28 — Publiek kopers-dashboard op de apex
**Tag:** zie `memory/logs/fase-2-kopers-dashboard.md`

- `server/marketplace.ts`: server-rendered etalage op `clynado.com` met alle live
  stores, zoeken, categoriefilters en een deals-strip. Geen build-stap, dus met
  `curl` te verifiëren en bruikbaar zonder JavaScript.
- Categorieën komen uit dezelfde `iconThemeFor()` die ook de store-iconen kiest —
  één bron voor "wat voor winkel is dit".
- Deals worden beheerd vanuit het admin-dashboard (`MarketplaceView`, achter 2FA);
  `market_deals`-tabel met actief-vlag en optioneel zichtbaarheidsvenster.
- `ensureApexVhost()` schrijft `_apex.conf` bij het opstarten; conf-namen met `_`
  worden overgeslagen door de store-scan en nginx-audit.
- Tunnel-doc uitgebreid: de wildcard dekt de apex níet, daar hoort een eigen
  ingress-regel en DNS-record bij.
- **Geverifieerd:** apex geeft 200 met de drie teststores in de HTML;
  `/api/admin/deals` geeft 401 zonder sessie en 200 met; een store op `killed`
  zetten laat hem meteen uit de etalage verdwijnen; headless Chromium toont geen
  horizontale overflow op desktop/mobiel/donker en geen JS-fouten.

## 2026-07-28 — Componentbibliotheek naar 106 + Anime.js + uniciteit
**Tag:** zie `memory/logs/fase-1-componenten-en-animatie.md`

- **43 → 106 componenten**, minstens 8 varianten per categorie. Nieuwe categorie
  **topbar** (12 varianten), gekoppeld aan het nichethema in `selection.ts` —
  een sportwinkel krijgt een energieke balk, een wellness-winkel een rustige.
- **Anime.js v4.5.0** als bewegingslaag (`design/anime-presets.ts`). Zes
  bewegingskarakters × elf families, declaratief via `data-am`. Twee stores met
  dezelfde componenten bewegen anders.
- **Emoji-filter** (`design/sanitize.ts`): alle LLM-copy passeert
  `sanitizeCopyDeep` vóór het renderen. Skill-prompts van store-builder, brand en
  content aangescherpt.
- **Uniciteit afgedwongen** (`design/uniqueness.ts`): hash over layout × hero ×
  topbar × beweging × palet × fonts, met UNIQUE-index. Bij botsing wordt aan
  hero/topbar/beweging gedraaid — nooit aan palet of fonts, die komen uit de
  persona.
- **Eigen SVG-iconen per nichethema** (`components/icons.ts`), geen stock-set.
- `detectDefaultLook` uitgebreid met variant (c), de krantenstijl.
- **Geverifieerd:** alle 106 componenten × 251 stijl-instanties compileren via
  `next build`; headless Chromium meet `opacity 0 → 0.97` bij scroll-reveal en
  splitText die de kop in 7 spans knipt; met `prefers-reduced-motion` start de
  runtime niet en blijft alles zichtbaar; drie stores bouwen volledig; `tsc`
  schoon. Volledige output in `memory/logs/fase-1-componenten-en-animatie.md`.
- De nieuwe `npm run verify:components` vond meteen drie echte compileerfouten,
  waaronder één in de bestaande `content.story-split` die elke store die dat
  component koos zou hebben laten falen.

## 2026-07-27 — Memory-systeem opgezet
**Tag:** `deploy-20260727-231624`

- `memory/` toegevoegd: `ai-must-read/` (START-HERE, architecture,
  how-to-cut-a-release, release-and-changelog), onderwerp-dossiers per domein,
  `planned/backlog.md`, `logs/` en deze changelog.
- Doel: elke nieuwe sessie heeft binnen één bestand genoeg context om veilig te
  beginnen, zonder de codebase opnieuw te moeten afspeuren.
- `dropships-infra-and-ci.md` legt de handmatig opgezette VPS-, DNS-, tunnel-,
  PM2- en runner-configuratie vast als vaststaande feiten.

## 2026-07-27 — Wachtwoord + TOTP 2FA voor het dashboard
**Tag:** `deploy-20260727-220308`

- `server/auth.ts` + `server/auth-routes.ts`: drie vaste accounts (dylan, claumi,
  fernando), bcrypt (12 rounds), TOTP via otplib v13, sessies met gehashte tokens.
- Gate vóór alle API-routes en de statische UI; uitzonderingen op één plek
  (`isPublicPath`): `/api/webhooks/stripe` en `/api/health`.
- Auth-pagina's zijn server-rendered HTML, zodat de hele React-bundel achter de
  gate kan.
- Reset uitsluitend via een geldige TOTP-code; geen e-mail-reset.
- Gescheiden rate-limit-budgetten per flow. Eén gedeeld budget bleek een echte
  bug: na setup kon je niet meer inloggen.
- **Geverifieerd:** 28/28 e2e-assertions tegen een draaiende server; curl bevestigt
  `/api/webhooks/stripe` → 400 (niet 401) zonder login; `tsc --noEmit` schoon;
  `vite build` in 5,04s.

## 2026-07-26 — Stripe vervangt Mollie
**Tag:** `deploy-20260727-191507`

- `server/stripe.ts`: Checkout Sessions + webhookverificatie op
  `STRIPE_WEBHOOK_SECRET`. `fulfillment.ts` ongewijzigd — alleen de trigger
  veranderde.
- `checkout_orders.mollie_payment_id` bevat nu de Stripe session-id (kolomnaam
  behouden voor compat; semantiek = payment reference).
- Startup-banner in `load-env.ts` meldde nog "Mollie: mock" terwijl Stripe al
  gebouwd was — dat leidde eerder tot de onjuiste conclusie dat Stripe ontbrak.
  Banner gecorrigeerd.
- `mollie.ts` blijft als legacy gemount tot Stripe live is getest.

## 2026-07-26 — Componentbibliotheek: combineren i.p.v. genereren
- 43 vooraf gebouwde componenten over 10 categorieën, met stijl- en
  animatievarianten. De LLM kiest uit een metadata-only catalogus.
- `assemble.ts` voegt deterministisch samen, met CSS-ontdubbeling en
  conflict-audit; terugval op de oude renderer als de assemblage faalt.
- Checkout expliciet buiten het systeem gehouden.

## 2026-07-25 — VPS-migratie: lokale deploy i.p.v. SSH
- `deploy.ts` werd een dispatcher: `deploy-local.ts` (default) of `deploy-ssh.ts`
  (legacy). Bij één server zijn lokale fs-operaties het juiste model — SSH naar
  jezelf is onnodige complexiteit.
- CI-trigger naar tag/dispatch-only. Push-triggered deploys leverden eerder 500+
  ongewenste runs op.
- Eén env-bron: `UIcontrol/.env` op de VPS.
