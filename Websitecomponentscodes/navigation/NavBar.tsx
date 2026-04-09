/**
 * NavBar — Responsive navigation with logo, links, cart icon,
 * and mobile hamburger menu.
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
}

export default function NavBar({ brandName, logoUrl, links, cartCount = 0 }: NavBarProps) {
  const [open, setOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          {logoUrl && <img src={logoUrl} alt={brandName} className="h-8 w-auto" />}
          <span className="font-bold text-xl text-gray-900">{brandName}</span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
              {link.label}
            </a>
          ))}
        </div>

        {/* Cart + mobile toggle */}
        <div className="flex items-center gap-4">
          <a href="/cart" className="relative text-gray-700 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-violet-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                {cartCount}
              </span>
            )}
          </a>

          {/* Hamburger */}
          <button onClick={() => setOpen(!open)} className="md:hidden text-gray-700">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 space-y-3">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="block text-gray-700 hover:text-gray-900 font-medium">
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  )
}
