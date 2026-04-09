import { Workflow, Store, Package, History, BarChart2, Settings } from 'lucide-react'
import clsx from 'clsx'

type View = 'pipeline' | 'stores' | 'components' | 'runs' | 'dashboard' | 'settings'

const NAV_ITEMS: { view: View; Icon: typeof Workflow; tooltip: string }[] = [
  { view: 'pipeline',   Icon: Workflow,   tooltip: 'Pipeline' },
  { view: 'dashboard',  Icon: BarChart2,  tooltip: 'Dashboard' },
  { view: 'stores',     Icon: Store,      tooltip: 'Stores' },
  { view: 'components', Icon: Package,    tooltip: 'Components' },
  { view: 'runs',       Icon: History,    tooltip: 'Runs' },
  { view: 'settings',   Icon: Settings,   tooltip: 'Settings' },
]

interface Props {
  activeView: View
  onViewChange: (v: View) => void
}

export function Sidebar({ activeView, onViewChange }: Props) {
  return (
    <aside className="w-[60px] flex-shrink-0 bg-[#0d1117]/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col items-center py-4 z-40">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-violet-800 flex items-center justify-center mb-5 shadow-lg shadow-violet-900/40 flex-shrink-0">
        <span className="text-white text-[10px] font-bold tracking-tight">DS</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 w-full px-2">
        {NAV_ITEMS.map(({ view, Icon, tooltip }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={tooltip}
            className={clsx(
              'relative w-full h-10 flex items-center justify-center rounded-lg transition-all duration-150',
              activeView === view
                ? 'bg-violet-600/20 text-violet-300'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]',
            )}
          >
            {activeView === view && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-violet-500" />
            )}
            <Icon size={18} />
          </button>
        ))}
      </nav>
    </aside>
  )
}