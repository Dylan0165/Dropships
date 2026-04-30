/**
 * NavBar — Sticky responsive navigation with logo, desktop links,
 * cart badge, and animated mobile drawer.
 *
 * Props: brandName, logoUrl, links, cartCount, cartHref
 * Placeholders: {{BRAND_NAME}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { useState } from 'react'

interface NavLink {
  label: string
  href: string
}

interface NavBarProps {
  brandName: string
  logoUrl?: string
  links: NavLink[]
  cartCount?: number
  cartHref?: string
}

export default function NavBar({
  brandName,
  logoUrl,
  links,
  cartCount = 0,
  cartHref = '/cart',
}: NavBarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <style>{`
        .nav-drawer {
          transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
          overflow: hidden;
        }
        .nav-drawer.closed { max-height: 0; opacity: 0; }
        .nav-drawer.open   { max-height: 400px; opacity: 1; }
      `}</style>

      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            {logoUrl && (
              <img src={logoUrl} alt={brandName} className="h-8 w-auto" />
            )}
            <span className="font-extrabold text-xl text-gray-900 tracking-tight">
              {brandName}
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-7">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors relative group"
              >
                {link.label}
                <span
                  className="absolute -bottom-0.5 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-250 rounded-full"
                  style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
                />
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Cart */}
            <a href={cartHref} className="relative p-2 text-gray-700 hover:text-gray-900 transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
              </svg>
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--brand-primary, #7c3aed)' }}
                >
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </a>

            {/* Hamburger */}
            <button
              onClick={() => setOpen(!open)}
              className="md:hidden p-2 text-gray-700 hover:text-gray-900 transition-colors"
              aria-label={open ? 'Menu sluiten' : 'Menu openen'}
              aria-expanded={open}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <div className={`nav-drawer md:hidden border-t border-gray-100 bg-white px-5 ${open ? 'open' : 'closed'}`}>
          <div className="py-4 space-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block text-gray-700 hover:text-gray-900 font-medium py-2.5 text-sm transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
    </>
  )
}
