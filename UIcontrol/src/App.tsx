import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { PipelineCanvas } from './components/pipeline/PipelineCanvas'
import { RunsView } from './components/views/RunsView'
import { StoresView } from './components/views/StoresView'
import { SettingsView } from './components/views/SettingsView'
import { ObservabilityView } from './components/views/ObservabilityView'

export type View = 'pipeline' | 'stores' | 'runs' | 'settings' | 'observability'

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
            {view === 'stores'        && <StoresView />}
            {view === 'observability' && <ObservabilityView />}
            {view === 'runs'          && <RunsView onSelectRun={() => setView('pipeline')} />}
            {view === 'settings'      && <SettingsView />}
          </div>
        </div>
      </div>
    </div>
  )
}
