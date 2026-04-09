/**
 * Footer — Multi-column footer with link groups,
 * optional newsletter signup, and copyright line.
 */
interface FooterLink {
  label: string
  href: string
}

interface FooterColumn {
  title: string
  links: FooterLink[]
}

interface FooterProps {
  brandName: string
  columns: FooterColumn[]
  showNewsletter?: boolean
  copyrightYear?: number
}

export default function Footer({ brandName, columns, showNewsletter = true, copyrightYear }: FooterProps) {
  const year = copyrightYear ?? new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-400 pt-16 pb-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-white font-semibold text-sm mb-4">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="text-sm hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {showNewsletter && (
          <div className="border-t border-gray-800 pt-8 mb-8">
            <div className="max-w-md">
              <h4 className="text-white font-semibold mb-2">Stay updated</h4>
              <p className="text-sm mb-4">Get notified about new products and exclusive deals.</p>
              <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
                />
                <button
                  type="submit"
                  className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 pt-6 text-center text-xs">
          © {year} {brandName}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
