import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        border: '#1f1f1f',
      },
    },
  },
  plugins: [],
} satisfies Config
