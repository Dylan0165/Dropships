// ═══════ CHECKOUT — het VASTE component (bewuste uitzondering) ═══════
//
// Checkout valt NIET onder de combineerbare component-catalogus. Dit is een
// expliciete architectuurkeuze, geen omissie:
//
//   1. Checkout is het meest kritieke conversiemoment. Eén crash of bug kost
//      direct omzet — precies waar eerdere problemen (Mollie 422, esc()-crashes)
//      de meeste schade aanrichtten.
//   2. Daarom is er ÉÉN vast, grondig getest checkout-component dat in ELKE store
//      exact hetzelfde werkt: zelfde structuur (order-summary + adresformulier),
//      zelfde velden, zelfde validatie, zelfde flow (POST /api/checkout/session →
//      betaalprovider → redirect /thank-you/). Geen varianten, geen LLM-keuze.
//   3. Alleen de KLEUREN/FONTS uit het design-DNA van die store worden toegepast
//      (via de PRIMARY-kleur + geërfde fonts) zodat het visueel bij de winkel
//      past — layout en logica blijven identiek over alle stores.
//   4. De pipeline voegt checkout ALTIJD automatisch toe (buildCheckoutAndInfoPages
//      in store-platform/template-engine.ts), ongeacht welke andere componenten
//      de LLM koos. De LLM krijgt checkout dus nooit als keuze voorgelegd — het
//      staat bewust niet in buildCatalog().
//
// De koppeling met de betaalprovider (Stripe) loopt via het vaste
// /api/checkout/session endpoint. Zie server/stripe.ts. Omdat het checkout-
// component overal identiek is, werkt die koppeling in elke store hetzelfde.
//
// Dit bestand is documentatie + een guard: als iemand ooit een "checkout"-id in
// de catalogus zet, faalt de assert hieronder in de tests.

import { buildCatalog } from './registry.js'

/** true als de catalogus (terecht) GEEN checkout-component bevat. */
export function checkoutIsExcludedFromCatalog(): boolean {
  return !buildCatalog().some(c => /checkout/i.test(c.id) || /checkout/i.test(c.category))
}

export const CHECKOUT_IS_FIXED = true as const
