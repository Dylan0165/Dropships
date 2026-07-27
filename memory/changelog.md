# Changelog

Nieuwste bovenaan. Zie `ai-must-read/release-and-changelog.md` voor het formaat.

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
