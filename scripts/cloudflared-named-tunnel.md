# Cloudflare Named Tunnel — stabiele publieke URL's (productie-VPS)

Vervangt de tijdelijke **Quick Tunnel** uit de schoolomgeving
(`scripts/cloudflared-manager.cjs`, `*.trycloudflare.com`, wisselt bij herstart)
door een **named tunnel** met een eigen domein: de URL's zijn nu **stabiel** en
overleven herstarts. Dit lost de Mollie-422 definitief op én maakt elke store
publiek op `<subdomain>.jouwdomein.nl`.

## 0. Domein op Cloudflare zetten
1. Maak een gratis Cloudflare-account, "Add a site" → `jouwdomein.nl`.
2. Cloudflare geeft je 2 nameservers. Zet die bij de registrar (Namecheap/TransIP)
   als de nameservers van het domein. Wacht tot Cloudflare "Active" toont.

## 1. cloudflared installeren op de VPS
```bash
# static binary, geen apt-repo nodig
sudo curl -fsSL -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo chmod +x /usr/local/bin/cloudflared
cloudflared --version
```

## 2. Inloggen + tunnel aanmaken
```bash
cloudflared tunnel login                    # opent een URL; kies jouwdomein.nl
cloudflared tunnel create dropships         # maakt tunnel + credentials-json
# noteer de Tunnel-UUID uit de output
```

## 3. DNS-routes (wildcard voor stores + api)
```bash
# Elke store <sub>.jouwdomein.nl → de tunnel:
cloudflared tunnel route dns dropships '*.jouwdomein.nl'
# De tool-API:
cloudflared tunnel route dns dropships 'api.jouwdomein.nl'
# (optioneel) apex:
cloudflared tunnel route dns dropships 'jouwdomein.nl'
```
Dit maakt automatisch CNAME-records naar `<UUID>.cfargotunnel.com`. Een
`*`-wildcard record dekt élke gegenereerde store zonder per-store DNS-werk.

## 4. Ingress-config
`/etc/cloudflared/config.yml`:
```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  # Tool-dashboard/API (Stripe-webhook komt hier binnen) — achter 2FA
  - hostname: api.jouwdomein.nl
    service: http://127.0.0.1:3001
  # APEX: het publieke kopers-dashboard. LET OP — de wildcard hieronder dekt de
  # apex NIET; zonder deze regel geeft jouwdomein.nl een 404 uit de tunnel.
  - hostname: jouwdomein.nl
    service: http://127.0.0.1:80
  - hostname: www.jouwdomein.nl
    service: http://127.0.0.1:80
  # Alle stores: nginx routeert op server_name naar de juiste store-root
  - hostname: "*.jouwdomein.nl"
    service: http://127.0.0.1:80
  - service: http_status:404
```
Alle paden gaan naar nginx/localhost — nginx doet de `server_name`-routing naar
de juiste store (`/etc/nginx/dropships.d/<sub>.conf`) of, voor de apex, naar het
kopers-dashboard (`_apex.conf`). Geen open poorten op de router; al het verkeer
loopt via de uitgaande tunnel.

### DNS voor de apex

De wildcard `*.jouwdomein.nl` uit stap 3 dekt subdomeinen, niet de apex zelf.
Voeg daarom óók toe:

```bash
cloudflared tunnel route dns dropships jouwdomein.nl
cloudflared tunnel route dns dropships www.jouwdomein.nl
```

### De apex-vhost

`_apex.conf` in `/etc/nginx/dropships.d/` wordt **door de app zelf geschreven**
(`ensureApexVhost()` bij het opstarten van `uicontrol`, alleen als
`DEPLOY_MODE=local` en `STORE_BASE_DOMAIN` gezet is). Hij proxyt `/` naar
`127.0.0.1:3001/market/` en `/api/market/` naar hetzelfde adres.

Bestanden die met `_` beginnen worden overgeslagen door de store-scan en de
nginx-audit — het is infrastructuur, geen winkel.

## 5. Als systemd-service (altijd aan, overleeft reboot)
```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared
```

## 6. Koppelen aan de app
Zet in `UIcontrol/.env` (de enige env-bron):
```
STORE_BASE_DOMAIN=jouwdomein.nl
PUBLIC_BASE_URL=https://api.jouwdomein.nl
```
`public-url.ts` gebruikt `PUBLIC_BASE_URL` als de webhook-basis — stabiel, dus de
runtime Quick-Tunnel-manager is hier **niet** meer nodig (die blijft alleen voor
de oude schoolomgeving in de repo staan).

## 7. Stripe-webhook koppelen
Nu `api.jouwdomein.nl` publiek is, configureer je in het Stripe-dashboard
(Developers → Webhooks → Add endpoint):
- **URL:** `https://api.jouwdomein.nl/api/webhooks/stripe`
- **Event:** `checkout.session.completed`
- Kopieer het **Signing secret** (`whsec_...`) naar `STRIPE_WEBHOOK_SECRET` in `.env`.

Geen aparte tunnel-route nodig: de Stripe-webhook komt binnen op `api.jouwdomein.nl`
(→ nginx → :3001), dezelfde ingress als de rest van de API.

## 8. Verifiëren
```bash
curl -fsS https://api.jouwdomein.nl/api/health            # tool bereikbaar
curl -fsS http://localhost:3001/api/admin/public-url      # toont stripeWebhookUrl
# Stripe test-checkout: gebruik testkaart 4242 4242 4242 4242 op een store en
# controleer in het Stripe-dashboard dat het webhook-event 200 kreeg → de order
# verschijnt als 'fulfilled' in /api/orders (CJ mock/sandbox).
```
Test een store-URL (`https://<sub>.jouwdomein.nl`) het beste vanaf **mobiele
data** (buiten je eigen netwerk) om echt publieke bereikbaarheid te bewijzen.
