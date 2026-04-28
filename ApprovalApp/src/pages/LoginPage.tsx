import { useState } from 'react'
import { Delete } from 'lucide-react'
import { verifyPin } from '../lib/api'

interface Props {
  onLogin: () => void
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function LoginPage({ onLogin }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleKey = async (key: string) => {
    if (loading) return
    setError(false)

    if (key === '⌫') {
      setPin(p => p.slice(0, -1))
      return
    }
    if (key === '') return

    const next = pin + key
    setPin(next)

    if (next.length === 4) {
      setLoading(true)
      try {
        const ok = await verifyPin(next)
        if (ok) {
          sessionStorage.setItem('approved', '1')
          onLogin()
        } else {
          setError(true)
          setTimeout(() => { setPin(''); setError(false) }, 800)
        }
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 safe-top safe-bottom">
      {/* Logo / title */}
      <div className="mb-10 text-center">
        <div className="text-3xl mb-1">🛒</div>
        <h1 className="text-white font-bold text-xl">Dropship Approvals</h1>
        <p className="text-zinc-500 text-sm mt-1">Voer je 4-cijferige PIN in</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-4 mb-10">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all duration-150 ${
              error
                ? 'bg-red-500'
                : pin.length > i
                  ? 'bg-orange-500 scale-110'
                  : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => handleKey(key)}
            disabled={loading || key === ''}
            className={`
              h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95
              ${key === '' ? 'invisible' : ''}
              ${key === '⌫'
                ? 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                : 'bg-zinc-800/80 text-white active:bg-zinc-700'}
            `}
          >
            {key === '⌫' ? <Delete size={20} className="mx-auto" /> : key}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-6 animate-pulse">Verkeerde PIN</p>
      )}
    </div>
  )
}
