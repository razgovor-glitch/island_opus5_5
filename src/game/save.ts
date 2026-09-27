// Autosave to localStorage so a village survives a page reload.

import { useGame, onGameStart } from './store'
import { placed } from './world'
import { restoreBuilding, spawnVillagersTo, villagers } from './sim'
import type { BuildingType } from '../models/buildings'
import type { ResKey, StatKey } from './config'

const KEY = 'harbor-isle-save-v1'

interface SaveData {
  v: 1
  savedAt: number
  res: Record<ResKey, number>
  stats: Record<StatKey, number>
  questIndex: number
  housing: number
  population: number
  lighthouseBuilt: boolean
  buildings: { type: BuildingType; variant: number; x: number; z: number; rot: number; done: boolean; progress: number }[]
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as SaveData
    return d && d.v === 1 ? d : null
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export function saveGame() {
  const s = useGame.getState()
  if (s.phase === 'title') return
  const data: SaveData = {
    v: 1,
    savedAt: Date.now(),
    res: s.res,
    stats: s.stats,
    questIndex: s.questIndex,
    housing: s.housing,
    population: villagers.length,
    lighthouseBuilt: s.lighthouseBuilt || s.stats.lighthouseBuilt > 0,
    buildings: placed.map((b) => ({ type: b.type, variant: b.variant, x: b.x, z: b.z, rot: b.rot, done: b.done, progress: b.progress })),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage full or unavailable — the game just won't persist */
  }
}

/** Restore a saved village and start playing. */
export function continueGame() {
  const d = readSave()
  if (!d) return useGame.getState().start()
  for (const b of d.buildings) restoreBuilding(b.type, b.variant, b.x, b.z, b.rot, b.done, b.progress)
  spawnVillagersTo(d.population)
  useGame.setState({
    res: d.res,
    stats: d.stats,
    questIndex: d.questIndex,
    housing: d.housing,
    population: villagers.length,
    lighthouseBuilt: d.lighthouseBuilt,
  })
  useGame.getState().bumpBuildings()
  useGame.getState().start()
  useGame.getState().toast('Welcome back to Harbor Isle!', 'good')
}

let timer: number | undefined
onGameStart(() => {
  if (timer) return
  timer = window.setInterval(saveGame, 15000)
  const flush = () => {
    if (document.visibilityState === 'hidden') saveGame()
  }
  document.addEventListener('visibilitychange', flush)
  window.addEventListener('pagehide', saveGame)
})
