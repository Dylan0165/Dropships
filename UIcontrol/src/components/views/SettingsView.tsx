import { useEffect, useState } from 'react'
import { Settings, Key, Cpu, Euro, Save, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import * as api from '@/lib/api'

interface Toast { message: string; type: 'success' | 'error' }

export function SettingsView() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const save = async (key: string, value: string) => {
    setSaving(key)
    try {
      await api.saveSetting(key, value)
      setSettings((s) => ({ ...s, [key]: value }))
      showToast(`${key.replace(/_/g, ' ')} opgeslagen`)
    } catch (err) {
      showToast(`Fout bij opslaan: ${err instanceof Error ? err.message : 'unknown'}`, 'error')
    } finally {
      setSaving(null)
    }
  }

  const saveApiKey = async () => {
    if (!apiKey.trim()) return
    setSaving('deepseek_api_key')
    try {
      await api.saveSetting('deepseek_api_key', apiKey.trim())
      setSettings((s) => ({ ...s, deepseek_api_key: `sk-...${apiKey.trim().slice(-6)}` }))
      setApiKey('')
      showToast('API key opgeslagen (alleen in geheugen, niet in DB)')
    } catch (err) {
      showToast(`Fout: ${err instanceof Error ? err.message : 'unknown'}`, 'error')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={24} className="text-slate-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Toast */}
      {toast && (
        <div
          className={clsx(
            'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm shadow-xl animate-in fade-in slide-in-from-right-2',
            toast.type === 'success'
              ? 'bg-emerald-900/80 border-emerald-700/50 text-emerald-200'
              : 'bg-red-900/80 border-red-700/50 text-red-200',
          )}
        >
          {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
            <Settings size={20} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Instellingen</h1>
            <p className="text-sm text-slate-500">API keys, model configuratie en limieten</p>
          </div>
        </div>

        {/* API Key */}
        <section className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Key size={16} className="text-amber-400" />
            DeepSeek API Key
          </div>

          {settings.deepseek_api_key && (
            <div className="text-sm text-slate-500">
              Huidige key: <code className="text-slate-400">{settings.deepseek_api_key}</code>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... (nieuwe key invoeren)"
                className="w-full bg-[#030712] border border-white/[0.08] rounded-lg px-3 py-2 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={saveApiKey}
              disabled={!apiKey.trim() || saving === 'deepseek_api_key'}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                apiKey.trim()
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-white/[0.04] text-slate-600 cursor-not-allowed',
              )}
            >
              {saving === 'deepseek_api_key' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          </div>

          <p className="text-xs text-slate-600">
            Key wordt alleen in server-geheugen opgeslagen — niet naar disk geschreven.
            Stel <code className="text-slate-500">DEEPSEEK_API_KEY</code> als environment variabele in voor permanente opslag.
          </p>
        </section>

        {/* Model Config */}
        <section className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Cpu size={16} className="text-sky-400" />
            Model Configuratie
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Executor Model</label>
              <select
                value={settings.deepseek_model ?? 'deepseek-chat'}
                onChange={(e) => save('deepseek_model', e.target.value)}
                className="w-full bg-[#030712] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                <option value="deepseek-chat">deepseek-chat (V3) — €0.27/1.10 per M</option>
                <option value="deepseek-reasoner">deepseek-reasoner (R1) — €0.55/2.19 per M</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Reviewer Model</label>
              <div className="bg-[#030712] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-400">
                deepseek-reasoner (R1) — vast
              </div>
              <p className="text-xs text-slate-600 mt-1">Reviewers gebruiken altijd R1 voor diepere analyse</p>
            </div>
          </div>
        </section>

        {/* Budget */}
        <section className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Euro size={16} className="text-emerald-400" />
            Budget Limiet
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Max kosten per pipeline run:</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">€</span>
              <input
                type="number"
                step="0.50"
                min="0.50"
                max="100"
                value={settings.budget_limit_eur ?? '10.00'}
                onChange={(e) => save('budget_limit_eur', e.target.value)}
                className="w-24 bg-[#030712] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Pipeline stopt automatisch als deze limiet bereikt wordt. Stel hoger in voor complexe niches.
          </p>
        </section>

        {/* Info */}
        <section className="bg-[#0d1117]/50 border border-white/[0.04] rounded-xl p-4">
          <h3 className="text-sm text-slate-400 font-medium mb-2">Over het systeem</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>Pipeline agents: <span className="text-slate-400">11</span></div>
            <div>Modellen: <span className="text-slate-400">V3 + R1</span></div>
            <div>Database: <span className="text-slate-400">SQLite (better-sqlite3)</span></div>
            <div>Architecture: <span className="text-slate-400">Direct DeepSeek API</span></div>
          </div>
        </section>
      </div>
    </div>
  )
}
