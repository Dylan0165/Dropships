# Authenticatie — wachtwoord + TOTP 2FA

> Gebouwd en geverifieerd op 27 juli 2026 (28/28 e2e-assertions). **Werkt. Niet
> aanraken.** Nieuwe routes respecteren de gate automatisch — dat is de opzet.

## Model

Drie vaste accounts: **`dylan`, `claumi`, `fernando`**. Geen open registratie.
Elk account wordt één keer aangemaakt via `/setup/<username>` en daarna nooit
overschreven (een tweede setup geeft 409).

## Bestanden

| Bestand | Wat |
|---|---|
| `server/auth.ts` | opslag + crypto: bcrypt, TOTP, sessies, reset |
| `server/auth-routes.ts` | routes + server-rendered login/setup/reset-pagina's |

De auth-pagina's zijn **losse server-rendered HTML zonder build-stap**. Dat is
bewust: daardoor kan de héle React-bundel achter de gate. Een niet-ingelogde
bezoeker krijgt het dashboard nooit binnen, ook niet als JS-bundel.

## Crypto

- **bcryptjs**, 12 rounds. Pure JS gekozen boven native `bcrypt` vanwege
  Windows/Linux-portabiliteit (dev is Windows, runtime is Linux).
- **TOTP via otplib v13** — let op: v13 heeft een **functionele API**
  (`generateSecret` / `generateURI` / `verifySync`), níet het v12
  `authenticator`-object. `verifySync` geeft een **object** `{valid, delta, …}`
  terug, geen boolean. Klokdrift via `epochTolerance: 30` (seconden, = ±1 venster).

## Databasetabellen

`auth_users`, `auth_sessions`, `auth_pending_setup`, `auth_pending_login`.
Nooit in `.env`, nooit in git.

## Beveiligingskeuzes en waarom

| Keuze | Waarom |
|---|---|
| Sessietokens **gehasht** opgeslagen (sha256) | een DB-lek levert geen bruikbare sessies op |
| TOTP-secret blijft tijdens setup server-side | wordt nooit via de client teruggestuurd |
| **Replay-bescherming** (RFC 6238 §5.2) | dezelfde code mag niet 2× binnen z'n venster |
| Generieke foutmeldingen + dummy-bcrypt | tegen user-enumeration en timing-lekken |
| Reset trekt alle sessies in | een gecompromitteerd wachtwoord sluit ook oude sessies uit |
| Cookie httpOnly + `SameSite=Strict` + `Secure` | standaard sessie-hardening |

## Rate-limiting — gescheiden budgetten

| Flow | Limiet per 15 min |
|---|---|
| login | 5 |
| TOTP | 5 |
| reset | 5 |
| setup | 15 |

Met `skipSuccessfulRequests`: **alleen mislukte pogingen tellen**.

Dit was aanvankelijk fout. Eén gedeeld budget per gebruiker betekende dat wie
zojuist z'n account had ingesteld, daarna niet meer kon inloggen — de setup-flow
had het budget al opgemaakt. Dat is een echte productiebug geweest, geen
testartefact.

## Wachtwoord-reset

**Alleen via een geldige TOTP-code. Er is geen e-mail-reset.** Gebruikersnaam +
geldige code → nieuw wachtwoord. Een reset trekt alle bestaande sessies in.

**Wachtwoord én telefoon kwijt** = handmatig herstel: verwijder de rij uit
`auth_users` op de VPS en doe opnieuw `/setup/<naam>`. Er is bewust geen andere
weg terug.

## De gate

In `index.ts`, in deze volgorde, vóór de API-routes en de statische UI:

```
cookieParser() → attachUser → registerAuthRoutes(app) → requireAuth
```

Uitzonderingen staan op **één plek**: `isPublicPath()` in `auth-routes.ts`.

| Publiek | Waarom |
|---|---|
| `/api/webhooks/stripe` | Stripe stuurt geen cookie mee |
| `/api/health` | monitoring |
| `/api/auth/*` | de inlogflow zelf |
| `/login`, `/setup/*`, `/reset` | de inlogpagina's |

Voeg je een route toe die publiek moet zijn, dan hoort die hier — nergens anders.

## De WebSocket valt NIET onder de middleware

`/ws` loopt via `server.on('upgrade')` op de HTTP-server en gaat dus volledig
buiten Express om: geen cookie-parser, geen middleware, **niet langs
`requireAuth`**. Dat is precies zo lang een gat geweest: iedereen die het adres
kende kon zonder in te loggen meelezen met live pipeline- en build-updates.

De upgrade-handler in `index.ts` doet daarom zelf drie dingen:

1. **Pad** — vergelijkt de pathname, zodat `/ws?runId=…` niet stil geweigerd wordt.
2. **Origin** — WebSockets kennen geen CORS: de browser stuurt de cookie ook mee
   bij een handshake vanaf een vreemde site. `SameSite=Strict` dekt dat af, maar
   de expliciete controle vangt het ook af als die vlag ooit versoepeld wordt.
3. **Sessie** — via `sessionUserFromCookieHeader()` in `auth-routes.ts`, dat
   `getSessionUser()` hergebruikt. Alleen het uitlezen van de rauwe
   `Cookie`-header is extra; de sessielogica blijft op één plek.

Afwijzen gebeurt met een echt HTTP-antwoord (`401`/`403`) vóór `socket.destroy()`.
Een kale destroy geeft de browser alleen een vage netwerkfout en is niet met
curl te controleren.

> **Denk hieraan bij elk nieuw kanaal dat niet via Express loopt** — SSE op de
> rauwe server, een tweede WS-endpoint, een raw TCP-listener. De gate beschermt
> alleen wat door de middleware-keten komt.

## Lokaal testen

`AUTH_INSECURE_COOKIES=1` zet de `Secure`-vlag uit zodat inloggen over plain http
werkt. **Nooit op productie zetten.**
