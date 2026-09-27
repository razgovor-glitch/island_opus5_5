import { create } from 'zustand'
import type { BuildingType } from '../models/buildings'
import { Cost, QUESTS, ResKey, StatKey, TUNING } from './config'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'good' | 'warn' | 'quest'
}

export interface FloatLabel {
  id: number
  text: string
  x: number
  y: number
  z: number
  kind: ResKey | 'info'
}

export interface HoverInfo {
  kind: 'tree' | 'deposit' | 'boat' | 'merchant' | 'building' | 'villager'
  title: string
  action: string
  x: number
  y: number
  z: number
  radius: number
  enabled: boolean
}

export interface Offer {
  id: number
  give: { res: ResKey; amount: number }
  get: { res: ResKey; amount: number }
  left: number
}

export type MerchantStatus = 'away' | 'arriving' | 'docked' | 'leaving'

export type Quality = 'high' | 'medium' | 'low'

interface GameState {
  phase: 'title' | 'playing' | 'won'
  res: Record<ResKey, number>
  population: number
  housing: number
  hungry: boolean
  stats: Record<StatKey, number>
  questIndex: number
  buildMode: BuildingType | null
  buildRotation: number
  hover: HoverInfo | null
  tradeOpen: boolean
  merchant: { status: MerchantStatus; timeLeft: number; offers: Offer[] }
  toasts: Toast[]
  labels: FloatLabel[]
  quality: Quality
  qualityAuto: boolean
  muted: boolean
  helpOpen: boolean
  buildingsVersion: number
  lighthouseBuilt: boolean

  start: () => void
  canAfford: (c: Cost) => boolean
  spend: (c: Cost) => boolean
  addRes: (c: Cost) => void
  bumpStat: (k: StatKey, n?: number) => void
  setStat: (k: StatKey, v: number) => void
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  floatText: (text: string, x: number, y: number, z: number, kind: FloatLabel['kind']) => void
  setBuildMode: (t: BuildingType | null) => void
  rotateBuild: () => void
  setHover: (h: HoverInfo | null) => void
  setTradeOpen: (v: boolean) => void
  setQuality: (q: Quality) => void
  toggleMute: () => void
  setHelp: (v: boolean) => void
  bumpBuildings: () => void
  win: () => void
  continuePlaying: () => void
}

let nextId = 1
const startListeners: (() => void)[] = []
export function onGameStart(fn: () => void) {
  startListeners.push(fn)
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  res: { ...TUNING.startRes },
  population: TUNING.startPopulation,
  housing: TUNING.baseHousing,
  hungry: false,
  stats: { treesChopped: 0, stoneMined: 0, fishingTrips: 0, cottagesBuilt: 0, trades: 0, workshopsBuilt: 0, population: TUNING.startPopulation, lighthouseBuilt: 0 },
  questIndex: 0,
  buildMode: null,
  buildRotation: 0,
  hover: null,
  tradeOpen: false,
  merchant: { status: 'away', timeLeft: 30, offers: [] },
  toasts: [],
  labels: [],
  quality: 'high',
  qualityAuto: true,
  muted: false,
  helpOpen: false,
  buildingsVersion: 0,
  lighthouseBuilt: false,

  start: () => {
    set({ phase: 'playing' })
    for (const fn of startListeners) fn()
  },

  canAfford: (c) => {
    const r = get().res
    return (Object.keys(c) as ResKey[]).every((k) => r[k] >= (c[k] ?? 0))
  },

  spend: (c) => {
    if (!get().canAfford(c)) return false
    const r = { ...get().res }
    for (const k of Object.keys(c) as ResKey[]) r[k] -= c[k] ?? 0
    set({ res: r })
    return true
  },

  addRes: (c) => {
    const r = { ...get().res }
    for (const k of Object.keys(c) as ResKey[]) r[k] = Math.max(0, r[k] + (c[k] ?? 0))
    set({ res: r })
  },

  bumpStat: (k, n = 1) => {
    get().setStat(k, get().stats[k] + n)
  },

  setStat: (k, v) => {
    const stats = { ...get().stats, [k]: v }
    set({ stats })
    // quest progression
    let qi = get().questIndex
    while (qi < QUESTS.length && stats[QUESTS[qi].stat] >= QUESTS[qi].goal) {
      const q = QUESTS[qi]
      get().addRes(q.reward)
      const rewardText = (Object.keys(q.reward) as ResKey[]).map((r) => `+${q.reward[r]} ${r}`).join(', ')
      get().toast(`Quest complete: ${q.title}${rewardText ? ` (${rewardText})` : ''}`, 'quest')
      qi++
    }
    if (qi !== get().questIndex) set({ questIndex: qi })
  },

  toast: (text, kind = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind }] })
    setTimeout(() => get().dismissToast(id), kind === 'quest' ? 6000 : 3800)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  floatText: (text, x, y, z, kind) => {
    const id = nextId++
    set({ labels: [...get().labels.slice(-12), { id, text, x, y, z, kind }] })
    setTimeout(() => set({ labels: get().labels.filter((l) => l.id !== id) }), 1900)
  },

  setBuildMode: (t) => set({ buildMode: t, hover: null, tradeOpen: false }),
  rotateBuild: () => set({ buildRotation: (get().buildRotation + Math.PI / 2) % (Math.PI * 2) }),
  setHover: (h) => {
    const cur = get().hover
    if (cur === h) return
    if (cur && h && cur.kind === h.kind && cur.x === h.x && cur.z === h.z && cur.action === h.action && cur.enabled === h.enabled) return
    set({ hover: h })
  },
  setTradeOpen: (v) => set({ tradeOpen: v }),
  setQuality: (q) => set({ quality: q, qualityAuto: false }),
  toggleMute: () => set({ muted: !get().muted }),
  setHelp: (v) => set({ helpOpen: v }),
  bumpBuildings: () => set({ buildingsVersion: get().buildingsVersion + 1 }),
  win: () => set({ phase: 'won', lighthouseBuilt: true }),
  continuePlaying: () => set({ phase: 'playing' }),
}))

export const game = () => useGame.getState()
