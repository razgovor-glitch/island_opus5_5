// Runtime world: static placements (built once) and the mutable simulation state that
// render components read every frame.

import { Simplex2, clamp, mulberry32, smoothstep } from './noise'
import {
  CHURCH,
  DEPOSITS,
  MEADOWS,
  HILL,
  HOUSES,
  ISLETS,
  MARKET,
  PIER,
  ROWBOAT_SPOTS,
  WELL,
  localToWorld,
} from './layout'
import { getHeight, getPathMask, getSlope, islandSDF, pathEdgeDistance } from './terrain'
import { Obstacle, addNavObstacle, obstacleContains, reachability } from './nav'
import { buildHouse } from '../models/house'
import { buildChurch } from '../models/church'
import { buildMarket, buildPier, buildWell } from '../models/props'
import type { BuildingType } from '../models/buildings'
import { mark } from './perf'

mark('world module start')

export interface TreeState {
  id: number
  kind: 'pine' | 'oak'
  variant: number
  x: number
  z: number
  y: number
  scale: number
  rot: number
  tint: number
  choppable: boolean
  state: 'grown' | 'falling' | 'stump' | 'growing'
  t: number
  fallDir: number
  reserved: boolean
}

export interface DepositState {
  id: number
  x: number
  z: number
  y: number
  size: number
  amount: number
  regrow: number
  reserved: boolean
}

export interface BoatState {
  id: number
  homeX: number
  homeZ: number
  homeRot: number
  x: number
  z: number
  rot: number
  state: 'beached' | 'out' | 'fishing' | 'returning'
  t: number
  route: [number, number][]
  routeLen: number
  dist: number
}

export interface PlacedBuilding {
  id: number
  type: BuildingType
  variant: number
  x: number
  z: number
  y: number
  rot: number
  progress: number
  done: boolean
  obstacle: Obstacle
  prodTimer: number
  chimneys: [number, number, number][]
}

export interface Decor {
  x: number
  y: number
  z: number
  s: number
  rot: number
  variant: number
  tint?: number
}

export interface StaticBuilding {
  id: string
  x: number
  z: number
  y: number
  rot: number
  door: [number, number]
  chimneys: [number, number, number][]
}

// ---------------------------------------------------------------------------

const rng = mulberry32(2024)
const snoise = new Simplex2(99)

export const staticObstacles: Obstacle[] = []

/** Solid volumes the camera must not pass through: an obstacle footprint plus a vertical extent. */
export interface CameraBlocker {
  o: Obstacle
  y0: number
  y1: number
}
export const cameraBlockers: CameraBlocker[] = []

function boxObstacle(x: number, z: number, rot: number, minX: number, maxX: number, minZ: number, maxZ: number, pad = 0): Obstacle {
  // local-space AABB (in the building frame) → world OBB
  const cxL = (minX + maxX) / 2
  const czL = (minZ + maxZ) / 2
  const [cx, cz] = localToWorld(x, z, rot, cxL, czL)
  return { kind: 'box', x: cx, z: cz, rot, hx: (maxX - minX) / 2 + pad, hz: (maxZ - minZ) / 2 + pad }
}

export const houses: StaticBuilding[] = HOUSES.map((h) => {
  const m = buildHouse(h.style)
  const y = getHeight(h.x, h.z)
  const b = m.bounds
  staticObstacles.push(boxObstacle(h.x, h.z, h.rot, b.min.x, b.max.x, b.min.z, b.max.z, -0.15))
  cameraBlockers.push({ o: boxObstacle(h.x, h.z, h.rot, b.min.x, b.max.x, b.min.z, b.max.z, 0.3), y0: y - 1, y1: y + b.max.y + 0.3 })
  const door = localToWorld(h.x, h.z, h.rot, m.door[0], m.door[2])
  const chimneys = m.chimneys.map(([cx, cy, cz]) => {
    const [wx, wz] = localToWorld(h.x, h.z, h.rot, cx, cz)
    return [wx, y + cy, wz] as [number, number, number]
  })
  return { id: h.id, x: h.x, z: h.z, y, rot: h.rot, door, chimneys }
})

export const church: StaticBuilding = (() => {
  const m = buildChurch()
  const y = getHeight(CHURCH.x, CHURCH.z)
  const b = m.bounds
  staticObstacles.push(boxObstacle(CHURCH.x, CHURCH.z, CHURCH.rot, b.min.x, b.max.x, b.min.z, b.max.z, -0.1))
  // nave and tower as separate volumes so the camera can still look over the low end of the nave
  cameraBlockers.push({ o: boxObstacle(CHURCH.x, CHURCH.z, CHURCH.rot, -4, 4, -6.5 + 1.7, 6.8 + 1.7, 0.3), y0: y - 1, y1: y + 10 })
  cameraBlockers.push({ o: boxObstacle(CHURCH.x, CHURCH.z, CHURCH.rot, -2.6, 2.6, -9.9 + 1.7, -4.5 + 1.7, 0.3), y0: y - 1, y1: y + 23 })
  const door = localToWorld(CHURCH.x, CHURCH.z, CHURCH.rot, m.door[0], m.door[2])
  return { id: 'church', x: CHURCH.x, z: CHURCH.z, y, rot: CHURCH.rot, door, chimneys: [] }
})()

export const market: StaticBuilding = (() => {
  const m = buildMarket()
  const y = getHeight(MARKET.x, MARKET.z)
  const b = m.bounds
  staticObstacles.push(boxObstacle(MARKET.x, MARKET.z, MARKET.rot, b.min.x, b.max.x, b.min.z, b.max.z, -0.2))
  cameraBlockers.push({ o: boxObstacle(MARKET.x, MARKET.z, MARKET.rot, b.min.x, b.max.x, b.min.z, b.max.z, 0.2), y0: y - 1, y1: y + b.max.y })
  const door = localToWorld(MARKET.x, MARKET.z, MARKET.rot, m.door[0], m.door[2])
  return { id: 'market', x: MARKET.x, z: MARKET.z, y, rot: MARKET.rot, door, chimneys: [] }
})()

export const well: StaticBuilding = (() => {
  buildWell()
  const y = getHeight(WELL.x, WELL.z)
  staticObstacles.push({ kind: 'circle', x: WELL.x, z: WELL.z, r: 1.1 })
  return { id: 'well', x: WELL.x, z: WELL.z, y, rot: 0, door: [WELL.x, WELL.z + 1.7], chimneys: [] }
})()

export const pier = (() => {
  buildPier(PIER.length, PIER.width)
  const dirX = Math.sin(PIER.rot)
  const dirZ = Math.cos(PIER.rot)
  const endX = PIER.x + dirX * PIER.length
  const endZ = PIER.z + dirZ * PIER.length
  // the merchant ship moors alongside the east face of the pier head
  const side = 1
  const perpX = Math.cos(PIER.rot) * side
  const perpZ = -Math.sin(PIER.rot) * side
  const dockX = PIER.x + dirX * (PIER.length - 4.5) + perpX * 4.2
  const dockZ = PIER.z + dirZ * (PIER.length - 4.5) + perpZ * 4.2
  // moored bow-in (bow pointing back towards the shore)
  return { ...PIER, dirX, dirZ, endX, endZ, dockX, dockZ, dockRot: PIER.rot + Math.PI / 2 }
})()

// ---------------------------------------------------------------------------
// Placement helpers

export function blockedByStatic(x: number, z: number, pad: number): boolean {
  for (const o of staticObstacles) if (obstacleContains(o, x, z, pad)) return true
  return false
}

function onPierLine(x: number, z: number, pad: number): boolean {
  const dx = x - PIER.x
  const dz = z - PIER.z
  const along = dx * pier.dirX + dz * pier.dirZ
  const across = Math.abs(dx * pier.dirZ - dz * pier.dirX)
  return along > -2 && along < PIER.length + 1 && across < PIER.width / 2 + pad
}

function poisson(count: number, minDist: number, tries: number, sample: () => [number, number], accept: (x: number, z: number) => boolean, existing: [number, number][] = []): [number, number][] {
  const out: [number, number][] = []
  const all = [...existing]
  for (let t = 0; t < tries && out.length < count; t++) {
    const [x, z] = sample()
    if (!accept(x, z)) continue
    let ok = true
    for (const [px, pz] of all) {
      if ((px - x) * (px - x) + (pz - z) * (pz - z) < minDist * minDist) {
        ok = false
        break
      }
    }
    if (!ok) continue
    out.push([x, z])
    all.push([x, z])
  }
  return out
}

const inRect = (x0: number, x1: number, z0: number, z1: number) => (): [number, number] => [x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0)]

// ---------------------------------------------------------------------------
// Trees

export const trees: TreeState[] = []
const treePts: [number, number][] = []

function addTree(kind: 'pine' | 'oak', x: number, z: number, scale: number) {
  const y = getHeight(x, z)
  trees.push({
    id: trees.length,
    kind,
    variant: Math.floor(rng() * 3),
    x,
    z,
    y,
    scale,
    rot: rng() * Math.PI * 2,
    tint: 0.85 + rng() * 0.3,
    choppable: false,
    state: 'grown',
    t: 0,
    fallDir: 0,
    reserved: false,
  })
  treePts.push([x, z])
}

const inMeadow = (x: number, z: number, pad = 0) => MEADOWS.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r + pad)
const clearOfBuildings = (x: number, z: number, pad: number) => !blockedByStatic(x, z, pad) && !onPierLine(x, z, pad) && !inMeadow(x, z)
const depositClear = (x: number, z: number, pad: number) => DEPOSITS.every((d) => Math.hypot(d.x - x, d.z - z) > d.size * 2 + pad)

;(function scatterTrees() {
  // pines on and around the hill
  const hillPines = poisson(
    55,
    2.6,
    5000,
    () => {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * HILL.r * 1.25
      return [HILL.x + Math.cos(a) * r, HILL.z + Math.sin(a) * r]
    },
    (x, z) => {
      const h = getHeight(x, z)
      const s = getSlope(x, z)
      if (h < 1.2 || s > 0.42) return false
      if (!clearOfBuildings(x, z, 2.2) || !depositClear(x, z, 0.5)) return false
      if (pathEdgeDistance(x, z) < 1.2) return false
      // a few tall pines on the summit, a band around the foot, forest on the back slope
      const top = smoothstep(13, 17, h)
      const foot = 1 - smoothstep(3, 7, h)
      return rng() < 0.1 + top * 0.15 + foot * 0.6 || (z < HILL.z - 9 && rng() < 0.6)
    },
    treePts,
  )
  for (const [x, z] of hillPines) addTree('pine', x, z, 6.5 + rng() * 4.5 + smoothstep(8, 20, getHeight(x, z)) * 2)

  // broadleaf trees around the village
  const oaks = poisson(
    24,
    5.6,
    6000,
    inRect(-34, 34, -22, 24),
    (x, z) => {
      const h = getHeight(x, z)
      if (h < 1.0 || getSlope(x, z) > 0.28) return false
      if (islandSDF(x, z) > -2.5) return false
      if (!clearOfBuildings(x, z, 2.6) || !depositClear(x, z, 1)) return false
      if (pathEdgeDistance(x, z) < 1.8) return false
      return true
    },
    treePts,
  )
  for (const [x, z] of oaks) addTree('oak', x, z, 4.8 + rng() * 2.4)

  // a few pines scattered in the village edge
  const edgePines = poisson(
    9,
    4.5,
    3000,
    inRect(-34, 34, -20, 18),
    (x, z) => {
      const h = getHeight(x, z)
      if (h < 1.2 || getSlope(x, z) > 0.3) return false
      if (!clearOfBuildings(x, z, 2.4) || !depositClear(x, z, 1)) return false
      if (pathEdgeDistance(x, z) < 1.6) return false
      return Math.abs(x) > 14 || z < -10
    },
    treePts,
  )
  for (const [x, z] of edgePines) addTree('pine', x, z, 6 + rng() * 3)

  // islets
  for (const [cx, cz, r, H, n] of ISLETS) {
    const pts = poisson(
      n,
      2.4,
      400,
      () => {
        const a = rng() * Math.PI * 2
        const rr = Math.sqrt(rng()) * r * 0.75
        return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]
      },
      (x, z) => getHeight(x, z) > Math.min(1.5, H * 0.4) && getSlope(x, z) < 0.45,
      treePts,
    )
    for (const [x, z] of pts) addTree(rng() < 0.5 ? 'pine' : 'oak', x, z, rng() < 0.5 ? 5 + rng() * 3 : 4 + rng() * 2)
  }
})()

// ---------------------------------------------------------------------------
// Stone deposits

export const deposits: DepositState[] = DEPOSITS.map((d, i) => ({
  id: i,
  x: d.x,
  z: d.z,
  y: getHeight(d.x, d.z),
  size: d.size,
  amount: 25,
  regrow: 0,
  reserved: false,
}))

// ---------------------------------------------------------------------------
// Decorative scatter: bushes, boulders, grass, flowers

export const bushes: Decor[] = []
export const boulders: Decor[] = []
export const grass: Decor[] = []
export const flowers: Decor[] = []

;(function scatterDecor() {
  const bushPts = poisson(
    90,
    1.6,
    8000,
    inRect(-40, 40, -46, 30),
    (x, z) => {
      const h = getHeight(x, z)
      if (h < 0.9) return false
      const s = getSlope(x, z)
      if (s > 0.5) return false
      if (!clearOfBuildings(x, z, 1.2) || !depositClear(x, z, 0.2)) return false
      if (pathEdgeDistance(x, z) < 1.0) return false
      const nearHillFoot = Math.abs(Math.hypot(x - HILL.x, z - HILL.z) - HILL.r * 0.95) < 5
      const nearCoast = islandSDF(x, z) > -5
      return nearHillFoot || nearCoast || rng() < 0.15
    },
    treePts,
  )
  for (const [x, z] of bushPts) bushes.push({ x, z, y: getHeight(x, z), s: 0.9 + rng() * 1.1, rot: rng() * 6.28, variant: Math.floor(rng() * 3) })
  // bushes on the foreground islets too
  for (const [cx, cz, r] of ISLETS) {
    for (let i = 0; i < r * 1.2; i++) {
      const a = rng() * Math.PI * 2
      const rr = Math.sqrt(rng()) * r * 0.85
      const x = cx + Math.cos(a) * rr
      const z = cz + Math.sin(a) * rr
      const h = getHeight(x, z)
      if (h > 0.6 && getSlope(x, z) < 0.55) bushes.push({ x, z, y: h, s: 1 + rng() * 1.4, rot: rng() * 6.28, variant: Math.floor(rng() * 3) })
    }
  }

  // boulders along the coast and at the foot of the hill
  const rockPts = poisson(
    42,
    2.6,
    9000,
    inRect(-42, 42, -48, 34),
    (x, z) => {
      const h = getHeight(x, z)
      const sdf = islandSDF(x, z)
      if (!clearOfBuildings(x, z, 1.5) || !depositClear(x, z, 0.5)) return false
      if (onPierLine(x, z, 1.5) || inMeadow(x, z, 1)) return false
      if (pathEdgeDistance(x, z) < 0.8) return false
      // keep the rowboat beach clear
      for (const b of ROWBOAT_SPOTS) if (Math.hypot(b.x - x, b.z - z) < 4) return false
      const coast = h > -1.6 && h < 1.2 && Math.abs(sdf) < 6
      const hillFoot = Math.abs(Math.hypot(x - HILL.x, z - HILL.z) - HILL.r * 0.9) < 4 && h > 1
      return coast || (hillFoot && rng() < 0.5)
    },
    [],
  )
  for (const [x, z] of rockPts) {
    const h = getHeight(x, z)
    const s = h < 0.5 ? 0.6 + rng() * 1.3 : 0.4 + rng() * 0.8
    boulders.push({ x, z, y: h, s, rot: rng() * 6.28, variant: Math.floor(rng() * 4) })
  }
  // a landmark rock in the shallows in front of the beach
  boulders.push({ x: 7.5, z: 31, y: getHeight(7.5, 31), s: 2.2, rot: 0.6, variant: 1 })
  boulders.push({ x: -8, z: 30.5, y: getHeight(-8, 30.5), s: 0.9, rot: 1.6, variant: 2 })
  boulders.push({ x: -5.6, z: 29.2, y: getHeight(-5.6, 29.2), s: 0.6, rot: 2.6, variant: 0 })
  // islet rock caps
  for (const [cx, cz, r, H] of ISLETS) {
    if (r < 5) boulders.push({ x: cx, z: cz, y: getHeight(cx, cz) - H * 0.3, s: r * 0.6, rot: rng() * 6, variant: 3 })
  }

  // grass tufts
  for (let i = 0; i < 26000 && grass.length < 7000; i++) {
    const x = -40 + rng() * 80
    const z = -46 + rng() * 78
    const h = getHeight(x, z)
    if (h < 1.0) continue
    if (getSlope(x, z) > 0.32) continue
    if (getPathMask(x, z) > 0.15) continue
    if (blockedByStatic(x, z, 0.2) || onPierLine(x, z, 0.5)) continue
    const dens = snoise.noise(x * 0.12, z * 0.12) * 0.5 + 0.5
    if (rng() > 0.35 + dens * 0.65) continue
    grass.push({ x, z, y: h, s: 0.28 + rng() * 0.3 + dens * 0.15, rot: rng() * 6.28, variant: 0, tint: 0.8 + rng() * 0.35 })
  }

  // flower patches near houses and along paths
  const palette = [0xd8453c, 0xef8a3c, 0xf4e9d8, 0xf1c9d6, 0xf2cd4a, 0xc86fb0]
  const patchCenters: [number, number][] = []
  for (const h of houses) {
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2
      patchCenters.push([h.door[0] + Math.cos(a) * 2.2, h.door[1] + Math.sin(a) * 2.2])
    }
  }
  for (let k = 0; k < 18; k++) patchCenters.push([-22 + rng() * 44, -12 + rng() * 34])
  for (const [px, pz] of patchCenters) {
    const col = palette[Math.floor(rng() * palette.length)]
    const n = 5 + Math.floor(rng() * 8)
    for (let i = 0; i < n; i++) {
      const x = px + (rng() - 0.5) * 1.8
      const z = pz + (rng() - 0.5) * 1.8
      const h = getHeight(x, z)
      if (h < 0.9 || getPathMask(x, z) > 0.3 || blockedByStatic(x, z, 0.1)) continue
      flowers.push({ x, z, y: h, s: 0.8 + rng() * 0.6, rot: rng() * 6, variant: 0, tint: rng() < 0.8 ? col : palette[Math.floor(rng() * palette.length)] })
    }
  }
})()

// ---------------------------------------------------------------------------
// Navigation obstacles & reachability

for (const o of staticObstacles) addNavObstacle(o, 0.25)
for (const t of trees) addNavObstacle({ kind: 'circle', x: t.x, z: t.z, r: t.kind === 'oak' ? 0.35 : 0.3 }, 0.1)
for (const d of deposits) addNavObstacle({ kind: 'circle', x: d.x, z: d.z, r: d.size * 1.3 }, 0.1)
for (const b of boulders) if (b.y > 0.2) addNavObstacle({ kind: 'circle', x: b.x, z: b.z, r: b.s * 0.8 }, 0.1)

mark('world scatter done')
export const reachable = reachability(1, 8)
for (const t of trees) {
  t.choppable = reachable(t.x + 1, t.z) || reachable(t.x - 1, t.z) || reachable(t.x, t.z + 1) || reachable(t.x, t.z - 1)
}

mark('world reachability done')

// Points of interest villagers like to wander to.
export const POIS: [number, number][] = [
  ...houses.map((h) => h.door),
  church.door,
  market.door,
  well.door,
  [PIER.x + pier.dirX * 3, PIER.z + pier.dirZ * 3],
  [1.5, 24],
  [-3, 22],
  [4, 23.5],
  [0, 6],
  [-2, -4],
  [10, 6],
  [-10, 5],
]

export function randomPOI(r = Math.random): [number, number] {
  const p = POIS[Math.floor(r() * POIS.length)]
  return [p[0] + (r() - 0.5) * 2, p[1] + (r() - 0.5) * 2]
}

// ---------------------------------------------------------------------------
// Rowboats

export const boats: BoatState[] = ROWBOAT_SPOTS.map((b, i) => {
  // rowboats sit on the beach pointing out to sea (+z)
  return {
    id: i,
    homeX: b.x,
    homeZ: b.z,
    homeRot: b.rot,
    x: b.x,
    z: b.z,
    rot: b.rot,
    state: 'beached',
    t: 0,
    route: [],
    routeLen: 0,
    dist: 0,
  }
})

// ---------------------------------------------------------------------------
// Player-built structures

export const placed: PlacedBuilding[] = []

export function allObstaclesContain(x: number, z: number, pad: number): boolean {
  if (blockedByStatic(x, z, pad)) return true
  for (const b of placed) if (obstacleContains(b.obstacle, x, z, pad)) return true
  return false
}

export { clamp }
