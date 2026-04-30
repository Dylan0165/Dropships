/**
 * FaqSection — Accordion FAQ with smooth open/close animation.
 * One item open at a time by default; set allowMultiple for independent toggle.
 *
 * Props: faqs, title, allowMultiple
 * Placeholders: {{FAQS_JSON}} (parse with parseJson in parent)
 */
'use client'

import { useState } from 'react'

interface FAQ {
  question: string
  answer: string
}

interface FaqSectionProps {
  faqs: FAQ[]
  title?: string
  allowMultiple?: boolean
}

export default function FaqSection({
  faqs,
  title,
  allowMultiple = false,
}: FaqSectionProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        if (!allowMultiple) next.clear()
        next.add(i)
      }
      return next
    })
  }

  return (
    <>
      <style>{`
        .faq-body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.28s ease;
        }
        .faq-body.open { grid-template-rows: 1fr; }
        .faq-inner { overflow: hidden; }
      `}</style>

      <section className="py-14 px-5 sm:px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          {title && (
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-8">{title}</h2>
          )}

          <div className="space-y-2">
            {faqs.map((faq, i) => {
              const isOpen = openIndexes.has(i)
              return (
                <div
                  key={i}
                  className={`bg-white rounded-2xl border transition-colors duration-200 ${
                    isOpen ? 'border-gray-200 shadow-sm' : 'border-gray-100'
                  }`}
                >
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-gray-900 font-semibold text-sm sm:text-base">{faq.question}</span>
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-250 ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                      style={{ backgroundColor: isOpen ? 'var(--brand-primary, #7c3aed)' : '#f3f4f6' }}
                    >
                      <svg
                        className={`w-3.5 h-3.5 ${isOpen ? 'text-white' : 'text-gray-500'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </span>
                  </button>
                  <div className={`faq-body ${isOpen ? 'open' : ''}`}>
                    <div className="faq-inner">
                      <p className="px-5 pb-5 text-gray-600 text-sm leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
