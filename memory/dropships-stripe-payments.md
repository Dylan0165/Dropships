# Betalingen — Stripe

Stripe verving Mollie op 26 juli 2026. `mollie.ts` staat er nog als legacy (de
webhook is nog gemount) tot Stripe live is getest; daarna kan het weg.

## Flow — één centrale gateway

Elke store heeft een eigen adresformulier maar **géén eigen betaallogica**. Alle
stores POST'en naar hetzelfde endpoint op `api.clynado.com`:

```
<sub>.clynado.com/checkout/
        │  POST https://api.clynado.com/api/checkout/session
        ▼
checkout-gateway.ts   ① origin-check  ② winkel live?  ③ prijs herberekenen
        │
        ▼  createCheckoutSession()
   Stripe Checkout Session
        │
   klant betaalt bij Stripe
        │
POST /api/webhooks/stripe  ◄─── het ENIGE fulfillment-triggerpunt
        │ handtekening geverifieerd
        ▼
fulfillment.ts → getSupplier('cj').placeOrder()
```

## De drie verdedigingslagen (`server/checkout-gateway.ts`)

Dit endpoint is publiek — het wordt aangeroepen door een browser op een ánder
domein, die geen sessiecookie heeft. Het is daarmee het enige publieke endpoint
dat geld raakt, dus het verdedigt zichzelf zelf:

| | Wat | Waarom |
|---|---|---|
| ① | **Origin** — alleen `https://<sub>.clynado.com`, de apex en `www` | vervangt de sessie; `Vary: Origin` erbij zodat een cache de toestemming niet doorlekt |
| ② | **Winkel** — moet bestaan en `status = 'live'` zijn | een verwijderde winkel kan geen betalingen meer starten |
| ③ | **Prijs** — herberekend uit `store_data.products` | de client zegt wát hij koopt, niet wat het kost |

Ook de **supplier-velden** komen uit de catalogus, nooit uit de request:
`fulfillment.ts` bestelt daarop bij CJ, dus dat mag de client onder geen beding
bepalen. Klantvelden gaan door een allowlist en worden afgekapt. Aantallen zijn
begrensd op 20 per item, het totaal op €5000.

De subdomein-check kijkt naar het achtervoegsel **én** de lengte, zodat
`https://clynado.com.evil.com` niet doorglipt.

## De URL in de gegenereerde store

`checkoutApiUrl()` leidt het adres af uit de publieke tunnel-URL. Er is **geen
hardgecodeerd IP meer** — dat was de bron van de stale-IP-bug toen de
schoolomgeving van adres wisselde.

**`fulfillment.ts` is ongewijzigd gebleven.** Alleen de trigger komt nu van
Stripe in plaats van Mollie. Dat was de expliciete opzet van de migratie: het
order-pad naar CJ is beproefd en mocht niet meebewegen met de betaalprovider.

## `server/stripe.ts`

| Functie | Wat |
|---|---|
| `createCheckoutSession()` | maakt de Checkout Session; slaat de order-rij eerst op en koppelt die via `client_reference_id` |
| `handleStripeWebhook()` | verifieert `stripe-signature` met `STRIPE_WEBHOOK_SECRET`, routeert het event |
| `stripeIsMock()` | geen `STRIPE_SECRET_KEY` → mock-modus |

Alleen `checkout.session.completed` triggert fulfillment; andere events worden
gelogd en genegeerd. Sessies met een `payment_status` ≠ `paid` worden niet
gefulfild.

## Env

| Key | Vorm |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |

Geen key → mock-modus, zodat UI- en pipeline-ontwikkeling zonder Stripe-account
werkt (net als bij CJ).

## Twee dingen die niet vanzelfsprekend zijn

1. **Signatuurverificatie hangt aan het webhook-secret, niet aan de API-key.**
   `webhooks.constructEvent` verifieert offline en raakt de Stripe-API niet.
   Daarom maakt `client()` desnoods een dummy-key aan: zo werkt webhook-
   verificatie ook wanneer session-creatie in mock-modus draait.

2. **De raw body is verplicht.** De handtekening wordt over de onbewerkte bytes
   berekend, niet over de geparste JSON. `index.ts` vangt die op met
   `express.json({ verify })` → `req.rawBody`.

## Database

De `checkout_orders`-tabel is hergebruikt. De kolom heet nog
**`mollie_payment_id`** maar bevat nu de **Stripe session-id**. De naam is
behouden voor compatibiliteit; de semantiek is "payment reference". Verwar dit
niet met een resterende Mollie-koppeling.

## Publieke bereikbaarheid

De webhook moet publiek bereikbaar zijn — betaalproviders weigeren
LAN-adressen. Via de named tunnel is dat `https://api.clynado.com/api/webhooks/stripe`.
`getStripeWebhookUrl()` in `public-url.ts` leidt hem af;
`isPubliclyReachableUrl()` weigert privé-IP's, localhost en `.local`.

Het endpoint moet handmatig in het Stripe-dashboard geconfigureerd worden.

## Auth-uitzondering

`/api/webhooks/stripe` staat in `isPublicPath()` (`auth-routes.ts`) — Stripe
stuurt geen sessiecookie mee. Geverifieerd: zonder login geeft het endpoint 400
(bereikt de handler), niet 401 (geblokkeerd door de gate). Zie
`dropships-auth.md`.
