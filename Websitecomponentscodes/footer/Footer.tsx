/**
 * Footer — Multi-column dark footer with links, newsletter signup,
 * payment icons, and copyright. Brand colour on subscribe button.
 *
 * Props: brandName, columns, showNewsletter, showPayments, copyrightYear
 * Placeholders: {{BRAND_NAME}}, {{PRIMARY_COLOR}} (via CSS var)
 */
interface FooterLink { label: string; href: string }
interface FooterColumn { title: string; links: FooterLink[] }

interface FooterProps {
  brandName: string
  columns: FooterColumn[]
  showNewsletter?: boolean
  showPayments?: boolean
  copyrightYear?: number
  labels?: {
    newsletterTitle?: string
    newsletterSub?: string
    emailPlaceholder?: string
    subscribeBtn?: string
  }
}

export default function Footer({
  brandName,
  columns,
  showNewsletter = true,
  showPayments = true,
  copyrightYear,
  labels = {},
}: FooterProps) {
  const year = copyrightYear ?? new Date().getFullYear()

  const l = {
    newsletterTitle: labels.newsletterTitle ?? 'Blijf op de hoogte',
    newsletterSub:   labels.newsletterSub   ?? 'Nieuwe producten en exclusieve aanbiedingen direct in je inbox.',
    emailPlaceholder: labels.emailPlaceholder ?? 'Jouw e-mailadres',
    subscribeBtn:    labels.subscribeBtn    ?? 'Aanmelden',
  }

  return (
    <footer className="bg-gray-950 text-gray-400 pt-16 pb-8 px-5 sm:px-6">
      <div className="max-w-7xl mx-auto">

        {/* Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-white font-bold text-sm mb-4 tracking-wide">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm hover:text-white transition-colors duration-150"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter */}
        {showNewsletter && (
          <div className="border-t border-gray-800 pt-10 mb-10">
            <div className="max-w-md">
              <h4 className="text-white font-bold mb-1.5">{l.newsletterTitle}</h4>
              <p className="text-sm mb-4 leading-relaxed">{l.newsletterSub}</p>
              <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
                <input
                  type="email"
                  placeholder={l.emailPlaceholder}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
                />
                <button
                  type="submit"
                  className="text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all duration-200 hover:opacity-90 shrink-0"
                  style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
                >
                  {l.subscribeBtn}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Payment icons */}
        {showPayments && (
          <div className="border-t border-gray-800 pt-8 mb-8 flex flex-wrap gap-3 items-center">
            <span className="text-xs text-gray-500 mr-2">Betaalmethoden:</span>
            {['iDEAL', 'Visa', 'Mastercard', 'PayPal', 'Bancontact'].map((method) => (
              <span key={method} className="bg-gray-800 border border-gray-700 text-gray-300 text-xs font-medium px-2.5 py-1 rounded-lg">
                {method}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-gray-800 pt-6 text-center text-xs">
          © {year} {brandName} · Alle rechten voorbehouden
        </div>
      </div>
    </footer>
  )
}
