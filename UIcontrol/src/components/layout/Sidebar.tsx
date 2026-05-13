import { Workflow, Store, History, Settings, ActivitySquare } from 'lucide-react'
import clsx from 'clsx'
import type { View } from '@/App'

const NAV_ITEMS: { view: View; Icon: typeof Workflow; tooltip: string }[] = [
  { view: 'pipeline',      Icon: Workflow,        tooltip: 'Pipeline' },
  { view: 'stores',        Icon: Store,           tooltip: 'Stores' },
  { view: 'observability', Icon: ActivitySquare,  tooltip: 'Observability' },
  { view: 'runs',          Icon: History,         tooltip: 'Run History' },
  { view: 'settings',      Icon: Settings,        tooltip: 'Instellingen' },
]

interface Props {
  activeView: View
  onViewChange: (v: View) => void
}

export function Sidebar({ activeView, onViewChange }: Props) {
  return (
    <aside className="w-[60px] flex-shrink-0 bg-[#0a0a0a] border-r border-white/[0.07] flex flex-col items-center py-4 z-40">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-5 shadow-lg flex-shrink-0">
        <span className="text-black text-[10px] font-bold tracking-tight">DS</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 w-full px-2">
        {NAV_ITEMS.map(({ view, Icon, tooltip }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={tooltip}
            className={clsx(
              'relative w-full h-10 flex items-center justify-center rounded-lg transition-all duration-150',
              activeView === view
                ? 'bg-white/[0.08] text-white'
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04]',
            )}
          >
            {activeView === view && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-white" />
            )}
            <Icon size={17} strokeWidth={activeView === view ? 2 : 1.5} />
          </button>
        ))}
      </nav>
    </aside>
  )
}
