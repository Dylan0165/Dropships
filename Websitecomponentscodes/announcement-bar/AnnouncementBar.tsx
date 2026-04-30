/**
 * AnnouncementBar — Dismissable top banner for promotions and announcements.
 * Dismissed state persists in localStorage per message key.
 *
 * Props: message, backgroundColor, textColor, dismissable
 * Placeholders: {{ANNOUNCEMENT_TEXT}}, {{PRIMARY_COLOR}} (via CSS var)
 */
'use client'

import { useState, useEffect } from 'react'

interface AnnouncementBarProps {
  message: string
  backgroundColor?: string
  textColor?: string
  dismissable?: boolean
  linkText?: string
  linkHref?: string
}

export default function AnnouncementBar({
  message,
  backgroundColor,
  textColor = '#ffffff',
  dismissable = true,
  linkText,
  linkHref,
}: AnnouncementBarProps) {
  const storageKey = `ab_dismissed_${message.slice(0, 32)}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem(storageKey) === '1'
    setVisible(!dismissed)
  }, [storageKey])

  const dismiss = () => {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="w-full py-2.5 px-4 flex items-center justify-center gap-3 text-sm font-medium relative"
      style={{
        backgroundColor: backgroundColor ?? 'var(--brand-primary, #7c3aed)',
        color: textColor,
      }}
      role="banner"
    >
      <span className="text-center">{message}</span>
      {linkText && linkHref && (
        <a
          href={linkHref}
          className="underline underline-offset-2 hover:no-underline font-bold shrink-0"
          style={{ color: textColor }}
        >
          {linkText}
        </a>
      )}
      {dismissable && (
        <button
          onClick={dismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity p-1"
          aria-label="Sluiten"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
