# Fase 3 — verificatie-output

Server gestart in productie-achtige modus (`DEPLOY_MODE=local`,
`STORE_BASE_DOMAIN=clynado.com`), zodat de strenge origin-controle getest wordt
en niet de dev-variant die localhost toestaat.

## Apex-vhost die de app zelf schrijft

```nginx
# managed by Dropships — publiek kopers-dashboard (apex)
server {
  listen 80;
  server_name clynado.com www.clynado.com;

  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # Publieke etalage-data eerst: langste prefix wint bij nginx, dus deze regel
  # moet er staan vóórdat / alles naar /market herschrijft.
  location /api/market/ {
    proxy_pass http://127.0.0.1:3312/api/market/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location / {
    proxy_pass http://127.0.0.1:3312/market/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## Gateway (`npm run verify:checkout`)

```
═══ 1. ORIGIN-CONTROLE ═══
  ✓ zonder Origin geweigerd — HTTP 403
  ✓ vreemde origin geweigerd: https://evil.com — HTTP 403, ACAO=null
  ✓ vreemde origin geweigerd: https://clynado.com.evil.com — HTTP 403, ACAO=null
  ✓ vreemde origin geweigerd: http://trailform.clynado.com — HTTP 403, ACAO=null
  ✓ vreemde origin geweigerd: https://notclynado.com — HTTP 403, ACAO=null
  ✓ apex-origin toegestaan — HTTP 200

═══ 2. WINKEL-CONTROLE ═══
  ✓ onbekende winkel → 404 — HTTP 404 "Onbekende winkel"
  ✓ verwijderde winkel → 409 — HTTP 409 "Deze winkel neemt geen bestellingen aan"

═══ 3. PRIJS KOMT UIT DE CATALOGUS, NIET VAN DE CLIENT ═══
  ✓ poging tot prijsmanipulatie afgeslagen — client vroeg 2x EUR 0.01 → opgeslagen EUR 99.90 (2 x 49.95)
  ✓ supplier-velden uit de catalogus — supplierProductId=CJ-AAA variant=V1
  ✓ order gekoppeld aan de juiste winkel — store=co-live sub=trailform
  ✓ client kan supplier-id niet overschrijven — client stuurde CJ-HACKED → opgeslagen CJ-BBB
  ✓ product van een andere winkel geweigerd — HTTP 400 "Product niet-van-deze-winkel hoort niet bij deze winkel"
  ✓ aantal wordt afgetopt op 20 — 999 stuks gevraagd → EUR 999 (20 x 49.95)

═══ 4. MEERDERE PRODUCTEN IN ÉÉN BESTELLING ═══
  ✓ bedrag opgeteld uit de catalogus — 1x49.95 + 3x24.50 = EUR 123.45
  ✓ beide items bewaard voor fulfillment — 2 items in items_json

═══ 5. CORS-HEADERS ═══
  ✓ preflight vanaf een store → 204 — HTTP 204, ACAO=https://trailform.clynado.com
  ✓ preflight vanaf een vreemde origin → 403 — HTTP 403
  ✓ Vary: Origin gezet — Vary=Origin
  ✓ ACAO exact de aanvragende store — ACAO=https://trailform.clynado.com

═══ 6. GATE — checkout publiek, admin dicht ═══
  ✓ /api/checkout/session niet door de auth-gate geblokkeerd — HTTP 200
  ✓ /api/stores nog steeds achter de gate — HTTP 401
  ✓ /api/health publiek — HTTP 200

Orders aangemaakt tijdens de test: 5
═══ RESULTAAT: 23 geslaagd, 0 gefaald ═══```

## Volledige keten tot CJ (`npm run verify:fulfillment`)

```
═══ 1. STORE START EEN BETALING VIA DE CENTRALE GATEWAY ═══
  ✓ sessie aangemaakt — HTTP 200
  ✓ order-rij aangemaakt met status open — id=7 status=open
  ✓ bedrag uit de catalogus — EUR 99.9 (2 x 49.95)
  ✓ winkel-metadata bewaard — subdomain=trailform
  ✓ klantgegevens bewaard — city=Amsterdam zip=1234AB
  ✓ onbekend klantveld niet doorgegeven — adminNote=(afwezig, goed)
  ✓ nog GEEN CJ-order vóór de webhook — cj_order_id="" — fulfillment mag alleen door de webhook komen

═══ 2. ONDERTEKENDE STRIPE-WEBHOOK ═══
  ✓ webhook met foute handtekening geweigerd — HTTP 400
  ✓ webhook met geldige handtekening geaccepteerd — HTTP 200

═══ 3. FULFILLMENT NAAR CJ (mock-modus) ═══
  ✓ order-status bijgewerkt na betaling — status=fulfilled
  ✓ CJ-order aangemaakt — cj_order_id=mock-cj-trailform-7

═══ RESULTAAT: 11 geslaagd, 0 gefaald ═══```

## Wat deze fase blootlegde

**Checkout was volledig kapot sinds de 2FA-gate.** `/api/checkout/session` stond
niet in `isPublicPath()`, dus elke betaalpoging vanuit een store kreeg
`401 Niet ingelogd` — een browser op `<sub>.clynado.com` heeft geen
sessiecookie. Geen enkele bestelling had de afgelopen periode kunnen slagen.

Het endpoint moet publiek zijn, maar dan wél verdedigd. Vandaar de drie lagen in
`checkout-gateway.ts`: origin, winkelstatus en prijs-herberekening. De
oorspronkelijke CORS kaatste élke origin terug (`Access-Control-Allow-Origin:
${req.headers.origin}`) en het bedrag kwam ongecontroleerd uit de request — een
bezoeker kon dus 49,95 afrekenen voor 0,01.

Daarnaast wees `CHECKOUT_API_URL` nog naar het hardgecodeerde schooladres
`http://192.168.121.133:3001`. Dat is vervangen door `checkoutApiUrl()`, die de
publieke tunnel-URL gebruikt.

## Typecheck

```
npx tsc --noEmit  → schoon
```
