# Changelog

Nieuwste bovenaan. Zie `ai-must-read/release-and-changelog.md` voor het formaat.

## 2026-07-27 — Memory-systeem opgezet
**Tag:** volgt bij afronding van de fase

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
