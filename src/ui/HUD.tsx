import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { BUILD_ORDER, BUILDINGS, Cost, QUESTS, ResKey, RES_LABEL } from '../game/config'
import { BuildingIcon, HouseIcon, PeopleIcon, ResIcon, ShipIcon } from './icons'
import { cameraControl } from '../scene/CameraRig'
import { merchantShip } from '../game/sim'
import { placed } from '../game/world'
import { sfx } from '../game/audio'

function useAnimatedNumber(value: number) {
  const [shown, setShown] = useState(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(value)
  useEffect(() => {
    if (value === prev.current) return
    setFlash(value > prev.current ? 'up' : 'down')
    prev.current = value
    const start = shown
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 350)
      setShown(Math.round(start + (value - start) * k))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const to = setTimeout(() => setFlash(null), 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return [shown, flash] as const
}

function ResChip({ res }: { res: ResKey }) {
  const value = useGame((s) => s.res[res])
  const [shown, flash] = useAnimatedNumber(value)
  return (
    <div className={`res-chip ${flash ? `flash-${flash}` : ''}`} title={RES_LABEL[res]}>
      <ResIcon res={res} />
      <span className="res-value">{shown}</span>
    </div>
  )
}

export function ResourceBar() {
  const pop = useGame((s) => s.population)
  const housing = useGame((s) => s.housing)
  const hungry = useGame((s) => s.hungry)
  return (
    <div className="resource-bar panel">
      <ResChip res="wood" />
      <ResChip res="stone" />
      <ResChip res="fish" />
      <ResChip res="gold" />
      <div className="res-divider" />
      <div className={`res-chip ${hungry ? 'hungry' : ''}`} title={hungry ? 'Villagers are hungry — catch fish!' : 'Villagers / housing'}>
        <PeopleIcon />
        <span className="res-value">
          {pop}
          <span className="res-sub">
            /{housing} <HouseIcon size={13} />
          </span>
        </span>
        {hungry && <span className="hungry-badge">hungry</span>}
      </div>
    </div>
  )
}

function costList(cost: Cost) {
  return (Object.keys(cost) as ResKey[]).map((k) => ({ res: k, amount: cost[k] ?? 0 }))
}

export function CostChips({ cost, have }: { cost: Cost; have?: Record<ResKey, number> }) {
  return (
    <div className="cost-chips">
      {costList(cost).map(({ res, amount }) => (
        <span key={res} className={`cost-chip ${have && have[res] < amount ? 'short' : ''}`}>
          <ResIcon res={res} size={14} />
          {amount}
        </span>
      ))}
    </div>
  )
}

export function QuestCard() {
  const qi = useGame((s) => s.questIndex)
  const stats = useGame((s) => s.stats)
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 600)
  if (qi >= QUESTS.length) {
    return (
      <div className="quest-card panel">
        <div className="quest-kicker">All quests complete</div>
        <div className="quest-title">Harbor master</div>
        <div className="quest-text">Your island thrives. Keep building as you like!</div>
      </div>
    )
  }
  const q = QUESTS[qi]
  const cur = Math.min(q.goal, stats[q.stat])
  return (
    <div className={`quest-card panel ${collapsed ? 'collapsed' : ''}`} onClick={() => setCollapsed(!collapsed)}>
      <div className="quest-kicker">
        Quest {qi + 1} / {QUESTS.length}
      </div>
      <div className="quest-title">{q.title}</div>
      {!collapsed && (
        <>
          <div className="quest-text">{q.text}</div>
          <div className="quest-progress">
            <div className="quest-progress-fill" style={{ width: `${(cur / q.goal) * 100}%` }} />
            <span>
              {cur} / {q.goal}
            </span>
          </div>
          {Object.keys(q.reward).length > 0 && (
            <div className="quest-reward">
              Reward <CostChips cost={q.reward} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function BuildBar() {
  const buildMode = useGame((s) => s.buildMode)
  const res = useGame((s) => s.res)
  const setBuildMode = useGame((s) => s.setBuildMode)
  const version = useGame((s) => s.buildingsVersion)
  void version
  return (
    <div className="build-bar-wrap">
      {buildMode && (
        <div className="build-hint panel">
          Placing <b>{BUILDINGS[buildMode].name}</b> · click to build · <kbd>R</kbd> rotate · <kbd>Shift</kbd> keep building · right-click / <kbd>Esc</kbd> cancel
        </div>
      )}
      <div className="build-bar panel">
        {BUILD_ORDER.map((type) => {
          const def = BUILDINGS[type]
          const afford = (Object.keys(def.cost) as ResKey[]).every((k) => res[k] >= (def.cost[k] ?? 0))
          const built = def.unique && placed.some((b) => b.type === type)
          return (
            <button
              key={type}
              className={`build-card ${buildMode === type ? 'active' : ''} ${!afford || built ? 'unaffordable' : ''} ${type === 'lighthouse' ? 'goal' : ''}`}
              onClick={() => {
                sfx.click()
                if (built) return
                setBuildMode(buildMode === type ? null : type)
              }}
              title={def.blurb}
            >
              <BuildingIcon type={type} />
              <div className="build-name">{def.name}</div>
              <CostChips cost={def.cost} have={res} />
              <div className="build-tip">{built ? 'Already built' : def.blurb}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function MerchantChip() {
  const m = useGame((s) => s.merchant)
  const setTradeOpen = useGame((s) => s.setTradeOpen)
  let text = 'No ships in sight'
  if (m.status === 'arriving') text = 'Merchant ship arriving…'
  if (m.status === 'docked') text = `Merchant docked · ${fmt(m.timeLeft)} left`
  if (m.status === 'leaving') text = 'Merchant setting sail'
  return (
    <div className={`merchant-chip panel ${m.status}`}>
      <ShipIcon />
      <span>{text}</span>
      {m.status === 'docked' && (
        <>
          <button
            className="btn-small"
            onClick={() => {
              sfx.click()
              setTradeOpen(true)
            }}
          >
            Trade
          </button>
          <button className="btn-icon" title="Look at the ship" onClick={() => cameraControl.focus(merchantShip.x, merchantShip.z - 6, 55)}>
            ◎
          </button>
        </>
      )}
    </div>
  )
}

export function TopButtons() {
  const quality = useGame((s) => s.quality)
  const setQuality = useGame((s) => s.setQuality)
  const muted = useGame((s) => s.muted)
  const toggleMute = useGame((s) => s.toggleMute)
  const setHelp = useGame((s) => s.setHelp)
  const next = quality === 'high' ? 'medium' : quality === 'medium' ? 'low' : 'high'
  return (
    <div className="top-buttons">
      <button className="btn-round" title="Reset camera" onClick={() => cameraControl.reset()}>
        ⌂
      </button>
      <button className="btn-round" title={`Graphics: ${quality} (click for ${next})`} onClick={() => setQuality(next)}>
        {quality === 'high' ? 'HQ' : quality === 'medium' ? 'MQ' : 'LQ'}
      </button>
      <button className="btn-round" title={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
        {muted ? '🔇' : '🔊'}
      </button>
      <button className="btn-round" title="How to play" onClick={() => setHelp(true)}>
        ?
      </button>
    </div>
  )
}
