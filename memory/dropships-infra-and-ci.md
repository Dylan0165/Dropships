# Infrastructuur en CI/CD

> **Deze opzet is handmatig gedaan, buiten Claude Code om.** De feiten hieronder
> staan vast — behandel ze als gegeven, niet als iets om opnieuw af te leiden of
> te "verbeteren". Wijk je ervan af, dan breekt de live omgeving.

## VPS

| | |
|---|---|
| Provider | TransIP |
| IP | `145.239.78.174` |
| OS | Ubuntu 26.04 |
| App-user | `dropships` |
| App-root | `/opt/dropships/app` |

Alles draait op deze ene server: de tool, de gegenereerde stores, nginx, de
tunnel en de CI-runner. Er is geen tweede machine meer (de oude
schoolomgeving met een aparte store-server is verleden tijd).

## Domein en DNS

| | |
|---|---|
| Domein | `clynado.com` |
| Registrar | Mijndomein |
| DNS | Cloudflare |

## Cloudflare Named Tunnel

Naam: **`dropships`**. Config: `/etc/cloudflared/config.yml`.

Ingress:

| Hostname | Naar |
|---|---|
| `api.clynado.com` | `localhost:3001` (uicontrol — admin, API, webhooks) |
| `*.clynado.com` | `localhost:80` (nginx — apex + alle stores) |

Draait als **systemd-service** (`cloudflared.service`), niet onder PM2.

Waarom een *named* tunnel: quick tunnels geven bij elke herstart een nieuwe
`trycloudflare.com`-URL. Betaalprovider-webhooks braken daardoor telkens. De
named tunnel heeft een stabiele URL, dus `PUBLIC_BASE_URL=https://api.clynado.com`
kan statisch in `.env` — er is geen runtime-URL-manager meer nodig.

De wildcard maakt élke nieuwe store publiek bereikbaar **zonder per-store
DNS-werk**. Dat kon de oude quick tunnel niet.

## PM2

Draait onder user `dropships` (niet root — pm2 is per-user).

| Proces | Poort | Wat |
|---|---|---|
| `uicontrol` | 3001 | Express API + WebSocket + serveert de React-bundel |
| `store-platform` | 3002 | build/deploy-machinerie voor stores |

`pm2 startup` en `pm2 save` zijn ingesteld, dus de processen overleven een reboot.

Gegenereerde stores krijgen elk hun eigen PM2-proces op een poort uit 4001-4999.

## nginx

- Per-store vhosts in **`/etc/nginx/dropships.d/*.conf`** — een app-owned
  include-directory. `nginx.conf` doet `include /etc/nginx/dropships.d/*.conf;`.
  De app schrijft daar zelf één `<sub>.conf` per store in; er is geen root nodig
  om een vhost toe te voegen.
- **Smalle sudoers-regel**: de app mag uitsluitend `nginx -t` en een nginx-reload
  draaien. Verder geen sudo. Dat is bewust de kleinst mogelijke privilege-set.
- Stores luisteren op `127.0.0.1:<poort>` en zijn niet direct van buiten
  bereikbaar; alleen nginx praat met ze. TLS eindigt bij Cloudflare.

## GitHub Actions self-hosted runner

| | |
|---|---|
| Locatie | `/opt/dropships/actions-runner` |
| User | `dropships` |
| Label | `dropships-vps` |
| Draait als | systemd-service |

De workflow faalt hard als de runner als root blijkt te draaien — dan zou `pm2`
een ander procesregister aanspreken dan waar de services in staan.

## Deploy-trigger

**Alleen `deploy-*` / `v*` tags en handmatige `workflow_dispatch`. Nooit op push.**

De auto-push-hook in `.claude/settings.json` commit bij élke bestandswijziging.
Toen de workflow op push triggerde leverde dat **500+ ongewenste deploy-runs** op,
elk met een PM2-herstart op productie. Zie `ai-must-read/how-to-cut-a-release.md`.

## Env

Eén bron: **`UIcontrol/.env` op de VPS**. Gitignored én untracked, dus het
overleeft `git reset --hard`. Er is bewust **geen** los backup/restore-bestand
meer — dat was destijds de oorzaak van de stale-IP-bug.

`server/load-env.ts` laadt zowel `UIcontrol/.env` als de repo-root `.env`. Echte
waarden winnen; lege of placeholder-waarden (`your_..._here`) tellen niet als
geconfigureerd. `isConfigured()` is overal de bepaler of een key echt is.

Relevante keys: `DEPLOY_MODE=local`, `PUBLIC_BASE_URL=https://api.clynado.com`,
`STORE_BASE_DOMAIN=clynado.com`, `STORES_ROOT`, `NGINX_CONF_DIR`,
`NGINX_RELOAD_CMD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CJ_EMAIL`,
`CJ_API_KEY`, `CJ_ENV`, `DEEPSEEK_API_KEY`.

`AUTH_INSECURE_COOKIES` hoort **niet** op de VPS te staan — die vlag zet
`Secure` uit en is alleen voor lokaal testen over http.

## Provisioning-scripts

- `scripts/provision-vps.sh` — hardening, installatie, het één-server-nginx-model
- `scripts/cloudflared-named-tunnel.md` — tunnel aanmaken + wildcard DNS + systemd

Deze zijn geschreven als documentatie van wat er handmatig is gedaan. Ze zijn
niet opnieuw gedraaid tegen de live server.

## Legacy (niet meer gebruiken)

De oude schoolomgeving: tool op `192.168.121.133`, store-server op
`192.168.121.11`, deploy via SSH + scp. Alleen nog bereikbaar via
`DEPLOY_MODE=ssh` + `STORE_SERVER_HOST`. `scripts/cloudflared-manager.cjs` (de
quick-tunnel-manager) hoort bij diezelfde legacy-opzet.
