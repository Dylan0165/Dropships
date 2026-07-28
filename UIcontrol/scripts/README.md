# Verificatiescripts

Losse end-to-end-scripts die tegen een **echt draaiende server** praten. Ze staan
bewust niet onder vitest: ze testen HTTP-gedrag, de auth-gate en de database in
samenhang, niet losse functies.

## Checkout

```bash
# Terminal 1 — server in productie-achtige modus
PORT=3312 AUTH_INSECURE_COOKIES=1 DEPLOY_MODE=local STORE_BASE_DOMAIN=clynado.com \
NGINX_CONF_DIR=/tmp/nginx-test STORES_ROOT=/tmp/stores-test NGINX_RELOAD_CMD="echo mock" \
STRIPE_WEBHOOK_SECRET=whsec_test_secret_for_e2e npm run server

# Terminal 2
TEST_BASE=http://127.0.0.1:3312 npm run verify:checkout
STRIPE_WEBHOOK_SECRET=whsec_test_secret_for_e2e TEST_BASE=http://127.0.0.1:3312 npm run verify:fulfillment
```

`verify:checkout` dekt de origin-controle, de winkelstatus, de prijs-
herberekening en de CORS-headers. `verify:fulfillment` doet de volledige keten
tot en met een ondertekende Stripe-webhook en de CJ-order in mock-modus.

Beide scripts seeden hun eigen teststores en ruimen die daarna weer op. `DEPLOY_MODE=local`
is nodig omdat de origin-controle anders localhost toestaat en de strenge
variant niet getest wordt.

## Store-generatie

Die scripts staan in `src/server/design/`:

```bash
npm run verify:components   # elk component × elke stijl → 1 store → next build
npm run verify:variation    # 3 stores → unieke hashes, Anime.js, emoji-filter
```

## Let op bij hermeten

Controleer altijd of de server écht opnieuw is opgestart. Op Windows overleeft
een `tsx`-proces een `pkill` regelmatig; de nieuwe start botst dan stil op
`EADDRINUSE` en je meet de vorige build. Zo doe je het goed:

```powershell
Get-NetTCPConnection -LocalPort 3312 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```
