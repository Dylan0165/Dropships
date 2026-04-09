import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  outputJson: Record<string, unknown> | null
}

function highlightJson(json: string): JSX.Element[] {
  return json.split('\n').map((line, i) => {
    const highlighted = line
      .replace(/"([^"]+)"(?=\s*:)/g, '<span class="text-blue-300">"$1"</span>')
      .replace(/:\s*"([^"]*)"(,?)/g, ': <span class="text-emerald-300">"$1"</span>$2')
      .replace(/:\s*(\d+\.?\d*)(,?)/g, ': <span class="text-amber-300">$1</span>$2')
      .replace(/:\s*(true|false)(,?)/g, ': <span class="text-violet-300">$1</span>$2')
      .replace(/:\s*(null)(,?)/g, ': <span class="text-red-400">$1</span>$2')
    return (
      <div key={i} className="text-slate-300" dangerouslySetInnerHTML={{ __html: highlighted }} />
    )
  })
}

export function OutputPanel({ outputJson }: Props) {
  const [copied, setCopied] = useState(false)

  if (!outputJson) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-600">
        <span className="text-sm">No output yet</span>
        <span className="text-xs mt-1">Run the agent to see results</span>
      </div>
    )
  }

  const raw = JSON.stringify(outputJson, null, 2)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-0 right-0 flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-slate-200 transition-all"
      >
        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="text-[11px] leading-5 whitespace-pre-wrap break-all mt-9 font-mono">
        {highlightJson(raw)}
      </pre>
    </div>
  )
}
