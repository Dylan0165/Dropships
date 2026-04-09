import { useEffect, useState } from 'react'
import { FolderOpen, FileCode, X, Copy, Check, Layers } from 'lucide-react'
import clsx from 'clsx'
import { type ComponentInfo } from '@/lib/api'
import * as api from '@/lib/api'

export function ComponentsView() {
  const [components, setComponents] = useState<ComponentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [selectedComponent, setSelectedComponent] = useState<ComponentInfo | null>(null)
  const [activeFile, setActiveFile] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getComponents()
        setComponents(data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const categories = ['all', ...new Set(components.map((c) => c.categorie))]
  const filtered = activeCategory === 'all' ? components : components.filter((c) => c.categorie === activeCategory)

  const handleSelect = (comp: ComponentInfo) => {
    setSelectedComponent(comp)
    const codeFile = comp.files.find(f => f.name.endsWith('.tsx') || f.name.endsWith('.ts'))
    setActiveFile(codeFile?.name ?? comp.files[0]?.name ?? '')
    setCopied(false)
  }

  const handleCopy = () => {
    const file = selectedComponent?.files.find(f => f.name === activeFile)
    if (file) {
      navigator.clipboard.writeText(file.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-slate-500">
          <Layers size={16} className="animate-pulse" />
          <span className="text-sm">Loading components...</span>
        </div>
      </div>
    )
  }

  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
        <Layers size={32} className="opacity-30" />
        <p className="text-sm">No components found</p>
        <p className="text-xs">Add files to Websitecomponentscodes/</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">Website Components</h2>
          <p className="text-xs text-slate-500 mt-0.5">{components.length} components in {categories.length - 1} categories</p>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
                activeCategory === cat
                  ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                  : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-slate-300 hover:bg-white/[0.05]',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((comp) => (
            <button
              key={comp.pad}
              onClick={() => handleSelect(comp)}
              className="bg-[#0d1117] border border-white/[0.07] hover:border-white/[0.14] rounded-xl p-3.5 text-left transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <FileCode size={13} className="text-violet-400" />
                </div>
                <span className="text-white text-sm font-medium truncate group-hover:text-violet-200 transition-colors">{comp.naam}</span>
              </div>
              <div className="flex items-center gap-2">
                <FolderOpen size={11} className="text-slate-600" />
                <span className="text-[11px] text-slate-500 truncate flex-1">{comp.categorie}</span>
                <span className="text-[10px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded-md">{comp.files.length} files</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Code Modal */}
      {selectedComponent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-8 animate-fade-in">
          <div className="bg-[#0d1117] border border-white/[0.1] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60 animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <h3 className="text-white font-semibold text-sm">{selectedComponent.naam}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{selectedComponent.pad}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-slate-200 transition-all"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setSelectedComponent(null)}
                  className="text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {selectedComponent.files.length > 1 && (
              <div className="flex gap-1 px-5 pt-3 border-b border-white/[0.07] overflow-x-auto">
                {selectedComponent.files.map(f => (
                  <button
                    key={f.name}
                    onClick={() => { setActiveFile(f.name); setCopied(false) }}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-t-lg transition-all flex-shrink-0',
                      activeFile === f.name
                        ? 'bg-white/[0.06] text-white border border-white/[0.1] border-b-0'
                        : 'text-slate-500 hover:text-slate-300',
                    )}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto p-5">
              {(() => {
                const file = selectedComponent.files.find(f => f.name === activeFile)
                return file ? (
                  <pre className="text-[11px] text-slate-300 leading-5 whitespace-pre font-mono overflow-x-auto">
                    {file.content}
                  </pre>
                ) : (
                  <p className="text-slate-500 text-sm">No file selected</p>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

