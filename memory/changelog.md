# Changelog

Nieuwste bovenaan. Zie `ai-must-read/release-and-changelog.md` voor het formaat.

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
