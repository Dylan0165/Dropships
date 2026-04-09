import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 1: '#0d1117', 2: '#161b22', 3: '#21262d' },
        executor: { border: '#7c3aed', glow: '#7c3aed33' },
        reviewer: { border: '#0d9488', glow: '#0d948833' },
        security: { border: '#dc2626', glow: '#dc262633' },
        analytics: { border: '#2563eb', glow: '#2563eb33' },
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,0.4)' },
          '70%': { boxShadow: '0 0 0 8px rgba(34,197,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34,197,94,0)' },
        },
        'amber-blink': {
          '0%, 100%': { borderColor: 'rgba(245,158,11,0.8)' },
          '50%': { borderColor: 'rgba(245,158,11,0.2)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s ease infinite',
        'amber-blink': 'amber-blink 1.2s ease-in-out infinite',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
