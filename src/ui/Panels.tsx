import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { RES_LABEL } from '../game/config'
import { ResIcon, ShipIcon } from './icons'
import { trade } from '../game/sim'
import { startAudio, sfx } from '../game/audio'
import { clearSave, continueGame, readSave } from '../game/save'

export function TradePanel() {
  const open = useGame((s) => s.tradeOpen)
  const m = useGame((s) => s.merchant)
  const res = useGame((s) => s.res)
  const setTradeOpen = useGame((s) => s.setTradeOpen)
  if (!open || m.status !== 'docked') return null
  return (
    <div className="trade-panel panel">
      <div className="trade-head">
        <ShipIcon size={28} />
        <div>
          <div className="trade-title">Merchant of the Azure Sea</div>
          <div className="trade-sub">Leaves in {Math.ceil(m.timeLeft)}s · each deal can be made up to 3 times</div>
        </div>
        <button className="btn-icon close" onClick={() => setTradeOpen(false)}>
          ✕
        </button>
      </div>
      <div className="offers">
        {m.offers.map((o) => {
          const can = o.left > 0 && res[o.give.res] >= o.give.amount
          return (
            <div key={o.id} className={`offer ${o.left <= 0 ? 'sold' : ''}`}>
              <div className="offer-side give">
                <span className="offer-label">You give</span>
                <span className="offer-amount">
                  <ResIcon res={o.give.res} size={20} /> {o.give.amount} {RES_LABEL[o.give.res]}
                </span>
              </div>
              <div className="offer-arrow">➜</div>
              <div className="offer-side get">
                <span className="offer-label">You get</span>
                <span className="offer-amount">
                  <ResIcon res={o.get.res} size={20} /> {o.get.amount} {RES_LABEL[o.get.res]}
                </span>
              </div>
              <button className="btn-small" disabled={!can} onClick={() => trade(o.id)}>
                {o.left <= 0 ? 'Sold out' : `Trade (${o.left})`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Tooltip() {
  const hover = useGame((s) => s.hover)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  return (
    <div ref={ref} className={`tooltip ${hover ? 'show' : ''} ${hover && !hover.enabled ? 'disabled' : ''}`}>
      {hover && (
        <>
          <div className="tooltip-title">{hover.title}</div>
          <div className="tooltip-action">{hover.action}</div>
        </>
      )}
    </div>
  )
}

function ago(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function TitleScreen() {
  const start = useGame((s) => s.start)
  const [save] = useState(readSave)
  const go = () => {
    startAudio()
    sfx.bell()
    if (save) clearSave()
    start()
  }
  const resume = () => {
    startAudio()
    sfx.bell()
    continueGame()
  }
  return (
    <div className="title-screen">
      <div className="title-card">
        <div className="title-kicker">A cozy island village</div>
        <h1 className="title-logo">Harbor Isle</h1>
        <p className="title-text">
          Chop timber, quarry stone and send rowboats out fishing. Trade with passing merchants, build cottages for new settlers — and raise a
          lighthouse to guide ships home.
        </p>
        {save ? (
          <div className="title-actions">
            <button className="btn-primary" onClick={resume}>
              Continue
            </button>
            <button className="btn-secondary" onClick={go}>
              New village
            </button>
            <div className="title-save">
              {save.population} villagers · {save.buildings.length} buildings · saved {ago(save.savedAt)}
            </div>
          </div>
        ) : (
          <button className="btn-primary" onClick={go}>
            Set sail
          </button>
        )}
        <div className="title-controls">
          <span>
            <kbd>Drag</kbd> pan
          </span>
          <span>
            <kbd>Right-drag</kbd> rotate
          </span>
          <span>
            <kbd>Wheel</kbd> zoom
          </span>
          <span>
            <kbd>WASD</kbd> move
          </span>
        </div>
      </div>
    </div>
  )
}

export function WinScreen() {
  const stats = useGame((s) => s.stats)
  const pop = useGame((s) => s.population)
  const cont = useGame((s) => s.continuePlaying)
  return (
    <div className="modal-backdrop">
      <div className="win-card panel">
        <div className="title-kicker">Victory</div>
        <h2>The light is lit!</h2>
        <p>Ships from every harbor can now find their way to your island. Harbor Isle has become a thriving port.</p>
        <div className="win-stats">
          <div>
            <b>{pop}</b> villagers
          </div>
          <div>
            <b>{stats.treesChopped}</b> trees felled
          </div>
          <div>
            <b>{stats.fishingTrips}</b> fishing trips
          </div>
          <div>
            <b>{stats.trades}</b> trades
          </div>
        </div>
        <button className="btn-primary" onClick={cont}>
          Keep playing
        </button>
      </div>
    </div>
  )
}

export function HelpPanel() {
  const open = useGame((s) => s.helpOpen)
  const setHelp = useGame((s) => s.setHelp)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => setHelp(false)}>
      <div className="help-card panel" onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon close" onClick={() => setHelp(false)}>
          ✕
        </button>
        <h2>How to play</h2>
        <ul>
          <li>
            <b>Trees</b> — click one to send a villager to chop it for wood. Stumps regrow.
          </li>
          <li>
            <b>Stone outcrops</b> — the grey boulder piles; click to quarry stone.
          </li>
          <li>
            <b>Rowboats</b> on the beach — click to send them fishing. Villagers eat fish; hungry villagers pay less tax and nobody new moves in.
          </li>
          <li>
            <b>Gold</b> comes from taxes and from trading with merchant ships that dock at the pier.
          </li>
          <li>
            <b>Build</b> with the bar at the bottom. Cottages house 4 villagers; workshops produce resources on their own.
          </li>
          <li>
            <b>Goal</b> — follow the quests and build the Lighthouse on the coast.
          </li>
        </ul>
        <h3>Camera</h3>
        <p>
          Drag to pan · right-drag (or Shift-drag) to rotate · mouse wheel to zoom · <kbd>WASD</kbd>/arrows to move · <kbd>Q</kbd>/<kbd>E</kbd> to turn.
        </p>
      </div>
    </div>
  )
}
