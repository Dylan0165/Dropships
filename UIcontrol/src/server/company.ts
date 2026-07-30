// ═══════ Bedrijfsgegevens — één bron voor alle winkels ═══════
//
// Elke winkel heeft z'n eigen merknaam, maar ze worden allemaal geëxploiteerd
// door hetzelfde bedrijf. De contactgegevens horen dus overal identiek te zijn.
//
// Wat er stond vóór 31 juli 2026:
//   contactpagina : support@<subdomein>.example   ← .example bestaat niet
//   footer        : hello@example.com             ← placeholder uit de catalogus
// Beide zijn onbereikbaar. Een webwinkel zonder werkend contactadres is niet
// alleen slordig maar in de EU ook niet toegestaan (informatieplicht bij
// verkoop op afstand).
//
// Alles komt uit environment-variabelen, zodat de gegevens op één plek op de
// VPS staan en niet in git. Ontbrekende velden worden WEGGELATEN in plaats van
// opgevuld met iets verzonnens — een fout adres is erger dan geen adres.

export interface CompanyContact {
  name: string
  email: string
  phone: string
  /** Straat, postcode+plaats, land — elke regel apart. */
  addressLines: string[]
  vat: string
  /** KvK-/handelsregisternummer. */
  registration: string
  hours: string
  website: string
}

function env(key: string, fallback = ''): string {
  const v = (process.env[key] ?? '').trim()
  // Placeholders uit .env.example tellen niet als ingevuld.
  if (!v || /^(your_|<|xxx|tbd|todo)/i.test(v)) return fallback
  return v
}

export function companyContact(): CompanyContact {
  return {
    name: env('COMPANY_NAME', 'Clynado'),
    // clynado.com is van ons, dus dit adres kán bestaan; zet hem aan op de mail-
    // server. De rest blijft leeg tot iemand hem invult.
    email: env('COMPANY_EMAIL', 'support@clynado.com'),
    phone: env('COMPANY_PHONE'),
    addressLines: env('COMPANY_ADDRESS').split('|').map(s => s.trim()).filter(Boolean),
    vat: env('COMPANY_VAT'),
    registration: env('COMPANY_REGISTRATION'),
    hours: env('COMPANY_HOURS', 'Mon-Fri, 09:00-17:00 CET'),
    website: env('COMPANY_WEBSITE', 'clynado.com'),
  }
}

/** Welke velden nog niet ingevuld zijn — voor een waarschuwing bij het opstarten. */
export function missingCompanyFields(): string[] {
  const c = companyContact()
  const missing: string[] = []
  if (!c.phone) missing.push('COMPANY_PHONE')
  if (c.addressLines.length === 0) missing.push('COMPANY_ADDRESS')
  if (!c.vat) missing.push('COMPANY_VAT')
  if (!c.registration) missing.push('COMPANY_REGISTRATION')
  return missing
}

/**
 * Contactblok voor de contactpagina van een winkel. De merknaam van de winkel
 * staat er los boven; dit is bewust het BEDRIJF achter de winkel.
 */
export function companyContactHtml(): string {
  const c = companyContact()
  const rows: string[] = []
  rows.push(`<p><strong>Email:</strong> <a href="mailto:${c.email}">${c.email}</a></p>`)
  if (c.phone) rows.push(`<p><strong>Phone:</strong> <a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${c.phone}</a></p>`)
  rows.push(`<p><strong>Support hours:</strong> ${c.hours}</p>`)
  if (c.addressLines.length) {
    rows.push(`<p><strong>Postal address:</strong><br>${c.name}<br>${c.addressLines.join('<br>')}</p>`)
  }
  const legal = [
    c.vat ? `VAT: ${c.vat}` : '',
    c.registration ? `Registration: ${c.registration}` : '',
  ].filter(Boolean)
  if (legal.length) rows.push(`<p style="opacity:.75">${legal.join(' &middot; ')}</p>`)
  return rows.join('\n        ')
}

/** Eén regel voor in de footer: "Operated by Clynado · support@clynado.com". */
export function companyFooterLine(): string {
  const c = companyContact()
  return `Operated by ${c.name} · ${c.email}`
}
