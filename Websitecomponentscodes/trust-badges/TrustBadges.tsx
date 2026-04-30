/**
 * TrustBadges — Row of five trust signals: secure payment, free shipping,
 * 30-day returns, rating, and NL/BE delivery. No props required.
 *
 * Placeholders: none (always the same trust set)
 */
const BADGES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    label: 'Veilig betalen',
    sub: 'iDEAL · Visa · PayPal',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    label: 'Gratis verzending',
    sub: 'Vanaf €50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    label: '30 dagen retour',
    sub: 'Geen gedoe',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ),
    label: '4.8/5 beoordeling',
    sub: '1.000+ klanten',
  },
  {
    icon: <span className="text-2xl">🇳🇱</span>,
    label: 'NL & BE bezorging',
    sub: '2–5 werkdagen',
  },
]

export default function TrustBadges() {
  return (
    <div className="py-8 px-4 sm:px-6 border-t border-b border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
        {BADGES.map((badge) => (
          <div key={badge.label} className="flex flex-col items-center text-center gap-1.5 group">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-600 group-hover:scale-110 transition-transform duration-200"
              style={{ backgroundColor: 'rgba(var(--brand-primary-rgb, 124 58 237) / 0.08)' }}
            >
              {badge.icon}
            </div>
            <p className="text-gray-900 font-semibold text-xs leading-tight">{badge.label}</p>
            <p className="text-gray-400 text-[11px]">{badge.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
