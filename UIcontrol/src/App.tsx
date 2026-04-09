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
import { usePipeline } from './hooks/usePipeline'
import type { AgentId } from './types'

type View = 'pipeline' | 'stores' | 'components' | 'runs' | 'dashboard' | 'settings'

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
    <div className="h-screen w-screen flex flex-col bg-[#030712] text-slate-200 overflow-hidden relative selection:bg-violet-500/30">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[10%] w-[45%] h-[45%] bg-violet-900/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[10%] w-[35%] h-[35%] bg-teal-900/8 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[25%] w-[15%] h-[15%] bg-blue-900/6 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <TopBar
          activeRun={activeRun}
          totalCostEur={totalCostEur}
          activeEscalations={activeEscalations}
          wsConnected={wsConnected}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={view} onViewChange={setView} />

          {/* Main content */}
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
            {view === 'runs' && <RunsView onSelectRun={handleSelectRun} />}
            {view === 'stores' && <StoresView />}
            {view === 'components' && <ComponentsView />}
            {view === 'dashboard' && <DashboardView />}
            {view === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>
    </div>
  )
}
