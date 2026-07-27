# Betalingen — Stripe

Stripe verving Mollie op 26 juli 2026. `mollie.ts` staat er nog als legacy (de
webhook is nog gemount) tot Stripe live is getest; daarna kan het weg.

## Flow

```
store /checkout/  ──POST /api/checkout/session──►  createCheckoutSession()
                                                          │
                                                  Stripe Checkout Session
                                                          │
                                              klant betaalt bij Stripe
                                                          │
                          POST /api/webhooks/stripe  ◄────┘
                                    │ handtekening geverifieerd
                                    ▼
                       fulfillment.ts → getSupplier('cj').placeOrder()
```

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
