import { useEffect } from 'react'
import { useGame } from '../game/store'
import { BuildBar, MerchantChip, QuestCard, ResourceBar, TopButtons } from './HUD'
import { HelpPanel, TitleScreen, Toasts, Tooltip, TradePanel, WinScreen } from './Panels'
import { startAudio } from '../game/audio'

export function UI() {
  const phase = useGame((s) => s.phase)
  const start = useGame((s) => s.start)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('play')) start()
    const unlock = () => startAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState()
      if (e.key === 'Escape') {
        if (s.helpOpen) s.setHelp(false)
        else if (s.tradeOpen) s.setTradeOpen(false)
      }
      if (e.key === 't' || e.key === 'T') {
        if (s.merchant.status === 'docked') s.setTradeOpen(!s.tradeOpen)
      }
      if (e.key === 'h' || e.key === 'H' || e.key === '?') s.setHelp(!s.helpOpen)
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key)
      if (idx >= 0 && s.phase !== 'title') {
        const order = ['cottage', 'fishery', 'lumber', 'quarry', 'lighthouse'] as const
        s.setBuildMode(s.buildMode === order[idx] ? null : order[idx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', onKey)
    }
  }, [start])

  if (phase === 'title') return <TitleScreen />
  return (
    <div className="hud">
      <div className="brand panel">
        <span className="brand-mark">⚓</span> Harbor Isle
      </div>
      <ResourceBar />
      <TopButtons />
      <QuestCard />
      <MerchantChip />
      <BuildBar />
      <TradePanel />
      <Toasts />
      <Tooltip />
      <HelpPanel />
      {phase === 'won' && <WinScreen />}
    </div>
  )
}
