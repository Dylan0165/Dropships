import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { PipelineCanvas } from './components/pipeline/PipelineCanvas'
import { RunsView } from './components/views/RunsView'
import { StoresView } from './components/views/StoresView'
import { ComponentsView } from './components/views/ComponentsView'
import { DashboardView } from './components/views/DashboardView'
import { SettingsView } from './components/views/SettingsView'
import { TrendScraperView } from './components/views/TrendScraperView'
import { AdManagerView } from './components/views/AdManagerView'
import { ObservabilityView } from './components/views/ObservabilityView'

export type View = 'pipeline' | 'stores' | 'components' | 'runs' | 'dashboard' | 'settings' | 'trendscraper' | 'ads' | 'observability'

export default function App() {
  const [view, setView] = useState<View>('pipeline')

  return (
    <div className="h-screen w-screen flex flex-col bg-[#080808] text-white overflow-hidden relative selection:bg-white/20">
      <div className="relative z-10 flex flex-col h-full">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={view} onViewChange={setView} />

          <div className="flex-1 flex overflow-hidden">
            {view === 'pipeline'      && <PipelineCanvas />}
            {view === 'runs'          && <RunsView onSelectRun={() => setView('pipeline')} />}
            {view === 'stores'        && <StoresView />}
            {view === 'ads'           && <AdManagerView />}
            {view === 'components'    && <ComponentsView />}
            {view === 'dashboard'     && <DashboardView />}
            {view === 'trendscraper'  && <TrendScraperView />}
            {view === 'observability' && <ObservabilityView />}
            {view === 'settings'      && <SettingsView />}
          </div>
        </div>
      </div>
    </div>
  )
}
