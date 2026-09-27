// Grid path-finding for villagers. Dirt paths are cheaper, so villagers naturally use the roads.

import { getHeight, getPathMask } from './terrain'

export const NAV_CELL = 0.7
export const NAV_HALF = 56
export const NAV_N = Math.ceil((NAV_HALF * 2) / NAV_CELL)

export interface Obstacle {
  kind: 'box' | 'circle'
  x: number
  z: number
  // box
  hx?: number
  hz?: number
  rot?: number
  // circle
  r?: number
}

const walk = new Uint8Array(NAV_N * NAV_N) // 1 = walkable terrain
const blocked = new Uint16Array(NAV_N * NAV_N) // obstacle reference count
const cost = new Float32Array(NAV_N * NAV_N)

export const cellX = (i: number) => -NAV_HALF + (i + 0.5) * NAV_CELL
export const cellOf = (x: number) => Math.floor((x + NAV_HALF) / NAV_CELL)

;(function init() {
  for (let j = 0; j < NAV_N; j++) {
    for (let i = 0; i < NAV_N; i++) {
      const x = cellX(i)
      const z = cellX(j)
      const h = getHeight(x, z)
      let ok = h > 0.45
      if (ok) {
        const e = NAV_CELL
        const dh = Math.max(
          Math.abs(getHeight(x + e, z) - h),
          Math.abs(getHeight(x - e, z) - h),
          Math.abs(getHeight(x, z + e) - h),
          Math.abs(getHeight(x, z - e) - h),
        )
        ok = dh < 0.5
      }
      const k = j * NAV_N + i
      walk[k] = ok ? 1 : 0
      cost[k] = 1 - 0.45 * getPathMask(x, z)
    }
  }
})()

export function obstacleContains(o: Obstacle, x: number, z: number, pad = 0): boolean {
  if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) < (o.r ?? 0) + pad
  const dx = x - o.x
  const dz = z - o.z
  const c = Math.cos(o.rot ?? 0)
  const s = Math.sin(o.rot ?? 0)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) < (o.hx ?? 0) + pad && Math.abs(lz) < (o.hz ?? 0) + pad
}

function obstacleCells(o: Obstacle, pad: number, fn: (k: number) => void) {
  const rad = o.kind === 'circle' ? (o.r ?? 0) + pad : Math.hypot(o.hx ?? 0, o.hz ?? 0) + pad
  const i0 = Math.max(0, cellOf(o.x - rad))
  const i1 = Math.min(NAV_N - 1, cellOf(o.x + rad))
  const j0 = Math.max(0, cellOf(o.z - rad))
  const j1 = Math.min(NAV_N - 1, cellOf(o.z + rad))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (obstacleContains(o, cellX(i), cellX(j), pad)) fn(j * NAV_N + i)
    }
  }
}

export function addNavObstacle(o: Obstacle, pad = 0.3) {
  obstacleCells(o, pad, (k) => blocked[k]++)
}

export function removeNavObstacle(o: Obstacle, pad = 0.3) {
  obstacleCells(o, pad, (k) => {
    if (blocked[k] > 0) blocked[k]--
  })
}

export function isWalkable(x: number, z: number): boolean {
  const i = cellOf(x)
  const j = cellOf(z)
  if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) return false
  const k = j * NAV_N + i
  return walk[k] === 1 && blocked[k] === 0
}

const passable = (k: number) => walk[k] === 1 && blocked[k] === 0

/** Nearest walkable cell centre to (x,z) within `maxR` metres, or null. */
export function nearestWalkable(x: number, z: number, maxR = 6): [number, number] | null {
  const ci = cellOf(x)
  const cj = cellOf(z)
  const maxC = Math.ceil(maxR / NAV_CELL)
  let best: [number, number] | null = null
  let bestD = Infinity
  for (let r = 0; r <= maxC; r++) {
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
        if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) continue
        const k = j * NAV_N + i
        if (!passable(k)) continue
        const d = Math.hypot(cellX(i) - x, cellX(j) - z)
        if (d < bestD) {
          bestD = d
          best = [cellX(i), cellX(j)]
        }
      }
    }
    if (best && r * NAV_CELL > bestD) break
  }
  return best
}

// --- A* ---------------------------------------------------------------------

const gScore = new Float32Array(NAV_N * NAV_N)
const came = new Int32Array(NAV_N * NAV_N)
const stamp = new Uint32Array(NAV_N * NAV_N)
const closed = new Uint32Array(NAV_N * NAV_N)
let curStamp = 1

class Heap {
  k: number[] = []
  f: number[] = []
  push(key: number, f: number) {
    const a = this.k
    const b = this.f
    a.push(key)
    b.push(f)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (b[p] <= b[i]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      ;[b[p], b[i]] = [b[i], b[p]]
      i = p
    }
  }
  pop(): number {
    const a = this.k
    const b = this.f
    const top = a[0]
    const lk = a.pop()!
    const lf = b.pop()!
    if (a.length) {
      a[0] = lk
      b[0] = lf
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && b[l] < b[m]) m = l
        if (r < a.length && b[r] < b[m]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        ;[b[m], b[i]] = [b[i], b[m]]
        i = m
      }
    }
    return top
  }
  get size() {
    return this.k.length
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

function lineOk(x0: number, z0: number, x1: number, z1: number, maxCost: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0)
  const steps = Math.ceil(d / (NAV_CELL * 0.5))
  for (let s = 1; s < steps; s++) {
    const t = s / steps
    const i = cellOf(x0 + (x1 - x0) * t)
    const j = cellOf(z0 + (z1 - z0) * t)
    if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) return false
    const k = j * NAV_N + i
    if (!passable(k)) return false
    if (cost[k] > maxCost + 0.05) return false
  }
  return true
}

/** Find a walking route; returns world points (excluding the start) or null. */
export function findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] | null {
  const s = nearestWalkable(sx, sz, 4)
  const t = nearestWalkable(tx, tz, 5)
  if (!s || !t) return null
  const si = cellOf(s[0])
  const sj = cellOf(s[1])
  const ti = cellOf(t[0])
  const tj = cellOf(t[1])
  const start = sj * NAV_N + si
  const goal = tj * NAV_N + ti
  curStamp++
  const heap = new Heap()
  gScore[start] = 0
  stamp[start] = curStamp
  came[start] = -1
  heap.push(start, 0)
  let found = false
  let iter = 0
  while (heap.size && iter++ < 60000) {
    const cur = heap.pop()
    if (closed[cur] === curStamp) continue
    closed[cur] = curStamp
    if (cur === goal) {
      found = true
      break
    }
    const ci = cur % NAV_N
    const cj = (cur - ci) / NAV_N
    for (const [di, dj, dl] of DIRS) {
      const ni = ci + di
      const nj = cj + dj
      if (ni < 0 || nj < 0 || ni >= NAV_N || nj >= NAV_N) continue
      const nk = nj * NAV_N + ni
      if (!passable(nk) || closed[nk] === curStamp) continue
      if (di && dj && (!passable(cj * NAV_N + ni) || !passable(nj * NAV_N + ci))) continue
      const g = gScore[cur] + dl * (cost[cur] + cost[nk]) * 0.5
      if (stamp[nk] !== curStamp || g < gScore[nk]) {
        stamp[nk] = curStamp
        gScore[nk] = g
        came[nk] = cur
        const hx = Math.abs(ni - ti)
        const hz = Math.abs(nj - tj)
        const h = (Math.max(hx, hz) + (Math.SQRT2 - 1) * Math.min(hx, hz)) * 0.55
        heap.push(nk, g + h)
      }
    }
  }
  if (!found) return null
  const cells: number[] = []
  for (let k = goal; k !== -1; k = came[k]) cells.push(k)
  cells.reverse()
  const pts: [number, number][] = cells.map((k) => [cellX(k % NAV_N), cellX(Math.floor(k / NAV_N))])
  pts[0] = [sx, sz]
  pts.push([tx, tz])
  // string pulling that refuses shortcuts across more expensive ground
  const out: [number, number][] = []
  let a = 0
  while (a < pts.length - 1) {
    let b = Math.min(pts.length - 1, a + 32)
    for (; b > a + 1; b--) {
      let maxC = 0
      for (let q = a; q <= b; q++) {
        const i = cellOf(pts[q][0])
        const j = cellOf(pts[q][1])
        if (i >= 0 && j >= 0 && i < NAV_N && j < NAV_N) maxC = Math.max(maxC, cost[j * NAV_N + i])
      }
      if (lineOk(pts[a][0], pts[a][1], pts[b][0], pts[b][1], maxC)) break
    }
    out.push(pts[b])
    a = b
  }
  return out
}

/** Flood fill from a start point; returns a predicate telling whether a point is reachable. */
export function reachability(x: number, z: number): (px: number, pz: number) => boolean {
  const seen = new Uint8Array(NAV_N * NAV_N)
  const s = nearestWalkable(x, z, 4)
  if (!s) return () => false
  const q: number[] = [cellOf(s[1]) * NAV_N + cellOf(s[0])]
  seen[q[0]] = 1
  while (q.length) {
    const k = q.pop()!
    const i = k % NAV_N
    const j = (k - i) / NAV_N
    for (const [di, dj] of DIRS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= NAV_N || nj >= NAV_N) continue
      const nk = nj * NAV_N + ni
      if (seen[nk] || !passable(nk)) continue
      seen[nk] = 1
      q.push(nk)
    }
  }
  return (px, pz) => {
    const p = nearestWalkable(px, pz, 2.5)
    if (!p) return false
    return seen[cellOf(p[1]) * NAV_N + cellOf(p[0])] === 1
  }
}
