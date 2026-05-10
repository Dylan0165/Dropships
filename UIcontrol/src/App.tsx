import { useState, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { PipelineCanvas } from './components/pipeline/PipelineCanvas'
import { LogPanel } from './components/panels/LogPanel'
import { RunsView } from './components/views/RunsView'
import { StoresView } from './components/views/StoresView'
import { ComponentsView } from './components/views/ComponentsView'
import { DashboardView } from './components/views/DashboardView'
import { SettingsView } from './components/views/SettingsView'
import { TrendScraperView } from './components/views/TrendScraperView'
import { AdManagerView } from './components/views/AdManagerView'
import { usePipeline } from './hooks/usePipeline'
import type { AgentId } from './types'

export type View = 'pipeline' | 'stores' | 'components' | 'runs' | 'dashboard' | 'settings' | 'trendscraper' | 'ads'

export default function App() {
  const [view, setView] = useState<View>('pipeline')
  const {
    activeRun,
    selectedRunId,
    selectedAgentId,
    setSelectedRunId,
    setSelectedAgentId,
    startPipeline,
    stopPipeline,
    approvePipeline,
    totalCostEur,
    activeEscalations,
    wsConnected,
  } = usePipeline()

  const handleSelectRun = useCallback(
    (runId: string) => {
      setSelectedRunId(runId)
      setView('pipeline')
    },
    [setSelectedRunId],
  )

  const handleApprove = useCallback(
    async (agentId: AgentId, decision: 'approve' | 'reject', opmerking?: string) => {
      if (!selectedRunId) return
      await approvePipeline(agentId, decision, opmerking)
    },
    [selectedRunId, approvePipeline],
  )

  return (
    <div className="h-screen w-screen flex flex-col bg-[#080808] text-white overflow-hidden relative selection:bg-white/20">
      <div className="relative z-10 flex flex-col h-full">
        <TopBar
          activeRun={activeRun}
          totalCostEur={totalCostEur}
          activeEscalations={activeEscalations}
          wsConnected={wsConnected}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={view} onViewChange={setView} />

          <div className="flex-1 flex overflow-hidden">
            {view === 'pipeline' && (
              <>
                <PipelineCanvas
                  activeRun={activeRun}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                  onStartPipeline={startPipeline}
                  onStopPipeline={stopPipeline}
                  lastNiche={activeRun?.niche}
                />
                {selectedAgentId && activeRun && activeRun.agents[selectedAgentId] && (
                  <LogPanel
                    agentId={selectedAgentId}
                    run={activeRun.agents[selectedAgentId]}
                    runId={activeRun.runId}
                    onClose={() => setSelectedAgentId(null)}
                    onApprove={handleApprove}
                  />
                )}
              </>
            )}
            {view === 'runs'        && <RunsView onSelectRun={handleSelectRun} />}
            {view === 'stores'      && <StoresView />}
            {view === 'ads'         && <AdManagerView />}
            {view === 'components'  && <ComponentsView />}
            {view === 'dashboard'   && <DashboardView />}
            {view === 'trendscraper'&& <TrendScraperView />}
            {view === 'settings'    && <SettingsView />}
          </div>
        </div>
      </div>
    </div>
  )
}
