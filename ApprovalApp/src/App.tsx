import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import QueuePage from './pages/QueuePage'
import ApprovalDetail from './pages/ApprovalDetail'
import type { PendingApproval } from './lib/api'

type Screen = 'login' | 'queue' | 'detail'

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    sessionStorage.getItem('approved') === '1' ? 'queue' : 'login'
  )
  const [selected, setSelected] = useState<PendingApproval | null>(null)

  const handleLogin = () => setScreen('queue')

  const handleSelect = (item: PendingApproval) => {
    setSelected(item)
    setScreen('detail')
  }

  const handleBack = () => {
    setSelected(null)
    setScreen('queue')
  }

  const handleDone = () => {
    setSelected(null)
    setScreen('queue')
  }

  return (
    <div className="h-full bg-[#0a0a0a] flex flex-col max-w-md mx-auto">
      {screen === 'login' && <LoginPage onLogin={handleLogin} />}
      {screen === 'queue' && <QueuePage onSelect={handleSelect} />}
      {screen === 'detail' && selected && (
        <ApprovalDetail item={selected} onBack={handleBack} onDone={handleDone} />
      )}
    </div>
  )
}
