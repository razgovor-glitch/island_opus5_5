// Heightfield for the main island (plus the small islets around it).
// Everything that needs to know "how high is the ground here" samples the same grid,
// so buildings, villagers, trees and the water shader all agree with the rendered mesh.

import { Simplex2, smoothstep, smin, lerp, clamp } from './noise'
import { CHURCH, HILL, HOUSES, ISLAND_BLOBS, ISLETS, MARKET, PATHS, PIER, WELL } from './layout'
import { mark } from './perf'

export const T_SIZE = 180
export const T_RES = 300
export const T_HALF = T_SIZE / 2
export const T_STEP = T_SIZE / T_RES
export const T_VERTS = T_RES + 1

export const sx = new Simplex2(1337)
const sx2 = new Simplex2(4242)

/** Signed distance-ish to the coastline of the main island (negative inside). */
export function islandSDF(x: number, z: number): number {
  let d = 1e9
  for (const [cx, cz, r] of ISLAND_BLOBS) d = smin(d, Math.hypot(x - cx, z - cz) - r, 8)
  d += sx.fbm(x * 0.045, z * 0.045, 3) * 3.4 + sx.noise(x * 0.17 + 7.1, z * 0.17 - 3.3) * 0.8
  return d
}

/** How "beachy" the coast is here (1 = wide sandy beach, 0 = rocky, steep shore). */
export function beachFactor(x: number, z: number): number {
  const south = smoothstep(8, 20, z)
  const southWest = smoothstep(12, 4, Math.hypot(x + 14, z - 17)) * 0.8
  return clamp(Math.max(south * (1 - smoothstep(18, 30, Math.abs(x - 2))), southWest), 0, 1)
}

function hillHeight(x: number, z: number): number {
  // broad grassy mound
  const dM = Math.hypot(x - HILL.x, z - HILL.z) / (HILL.r * 1.2)
  let h = 0
  if (dM < 1) h += 5.5 * Math.pow(smoothstep(0, 1, 1 - dM), 1.3)
  // rounded granite dome sitting towards the back of the mound
  const cx = HILL.x + 1
  const cz = HILL.z - 2
  const dx = x - cx
  const dz = z - cz
  const ang = Math.atan2(dz, dx)
  const warp = 1 + 0.14 * sx2.noise(Math.cos(ang) * 1.3 + 4.2, Math.sin(ang) * 1.3 - 2.1) + 0.05 * sx.noise(x * 0.15, z * 0.15)
  const rD = Math.hypot(dx * 0.92, dz * 1.1) / (15.5 * warp)
  if (rD < 1) {
    // steep granite face towards the village (south), rounder grassy shoulders elsewhere
    const front = smoothstep(-0.3, 0.7, dz / (Math.hypot(dx, dz) + 1e-3))
    const k = 1.8 + 1.0 * front
    const m = 1.2 - 0.5 * front
    const dome = 11 * Math.pow(Math.max(0, 1 - Math.pow(rD, k)), m)
    h += dome
    // ledges and buttresses on the flanks
    const flank = smoothstep(0.45, 0.75, rD) * (1 - smoothstep(0.92, 1, rD))
    h += flank * (sx.ridged(x * 0.12 + 3, z * 0.12, 3) - 0.5) * 3.2
  }
  // a lower knoll to the west so the silhouette is not a perfect dome
  const k = Math.hypot(x - (HILL.x - 10), z - (HILL.z + 1)) / 8
  if (k < 1) h = Math.max(h, 6.5 * Math.pow(1 - k * k, 1.2) + sx.noise(x * 0.3, z * 0.3) * 0.3)
  return h
}

function isletHeight(x: number, z: number): number {
  let best = -99
  for (const [cx, cz, r, H] of ISLETS) {
    const dx = x - cx
    const dz = z - cz
    const d0 = Math.hypot(dx, dz)
    if (d0 > r * 3) continue
    const ang = Math.atan2(dz, dx)
    const warp = 1 + 0.25 * sx2.noise(Math.cos(ang) * 1.1 + cx * 0.1, Math.sin(ang) * 1.1 + cz * 0.1)
    const d = d0 / (r * warp)
    let h: number
    if (d < 1) {
      const t = 1 - d
      h = H * (1 - Math.pow(1 - t, 2.4))
      h += (sx.ridged(x * 0.22 + cx, z * 0.22, 3) - 0.45) * H * 0.4 * smoothstep(0, 0.5, t)
      h = Math.max(h, 0.05)
    } else {
      h = -(d - 1) * r * 1.1
    }
    best = Math.max(best, h)
  }
  return best
}

/** Height before local flattening (pads / paths). */
export function rawHeight(x: number, z: number): number {
  const d = islandSDF(x, z)
  const beach = beachFactor(x, z)
  let h: number
  if (d < 0) {
    const inland = -d
    const southFlat = lerp(1, 0.5, smoothstep(6, 20, z))
    h = 0.55 + 1.9 * smoothstep(0, lerp(4, 13, beach), inland) * southFlat
    h += sx.fbm(x * 0.07 + 11, z * 0.07, 3) * 0.4 * smoothstep(0, 6, inland)
  } else {
    const dd = d * lerp(3, 1, beach)
    h = 0.55 - 1.2 * smoothstep(0, 6, dd) - 6.3 * smoothstep(3, 20, dd)
  }
  h += hillHeight(x, z)
  return Math.max(h, isletHeight(x, z))
}

// ---------------------------------------------------------------------------
// Flattened pads under buildings

interface Pad {
  x: number
  z: number
  r: number
  fall: number
  h: number
}
const pads: Pad[] = []
function addPad(x: number, z: number, r: number, fall = 3.5, dh = 0) {
  pads.push({ x, z, r, fall, h: rawHeight(x, z) + dh })
}
for (const h of HOUSES) addPad(h.x, h.z, Math.max(h.style.w, h.style.d) * 0.5 + 1.3)
addPad(CHURCH.x, CHURCH.z, 8.2, 4)
addPad(MARKET.x, MARKET.z, 2.8, 2.5)
addPad(WELL.x, WELL.z, 1.6, 2)
addPad(PIER.x, PIER.z, 2.2, 3, 0.1)

// ---------------------------------------------------------------------------
// Paths

type Seg = [number, number, number, number, number] // ax, az, bx, bz, halfWidth
export const PATH_SEGS: Seg[] = []
for (const p of PATHS) {
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az] = p.pts[i]
    const [bx, bz] = p.pts[i + 1]
    PATH_SEGS.push([ax, az, bx, bz, p.width / 2])
  }
}

function segDist(px: number, pz: number, s: Seg): number {
  const [ax, az, bx, bz] = s
  const vx = bx - ax
  const vz = bz - az
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1)
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t))
}

/** Distance to the nearest path edge (negative = on the path). */
export function pathEdgeDistance(x: number, z: number): number {
  let best = 1e9
  for (const s of PATH_SEGS) {
    const d = segDist(x, z, s) - s[4]
    if (d < best) best = d
  }
  return best
}

// ---------------------------------------------------------------------------
// The grid

export const heights = new Float32Array(T_VERTS * T_VERTS)
export const pathGrid = new Float32Array(T_VERTS * T_VERTS) // 0..1 dirt coverage

;(function buildGrid() {
  mark('terrain grid start')
  for (let j = 0; j < T_VERTS; j++) {
    const z = -T_HALF + j * T_STEP
    for (let i = 0; i < T_VERTS; i++) {
      const x = -T_HALF + i * T_STEP
      let h = rawHeight(x, z)
      for (const p of pads) {
        const dd = Math.hypot(x - p.x, z - p.z)
        if (dd < p.r + p.fall) {
          const w = 1 - smoothstep(p.r, p.r + p.fall, dd)
          h = lerp(h, p.h, w)
        }
      }
      let pm = 0
      if (h > 0.2 && Math.abs(x) < 40 && z > -30 && z < 32) {
        const pd = pathEdgeDistance(x, z) + sx.noise(x * 0.9, z * 0.9) * 0.22 + sx.noise(x * 0.25 + 3, z * 0.25) * 0.25
        pm = 1 - smoothstep(-0.35, 0.3, pd)
        h -= 0.06 * pm
      }
      heights[j * T_VERTS + i] = h
      pathGrid[j * T_VERTS + i] = pm
    }
  }
  mark('terrain grid done')
})()

function sampleGrid(grid: Float32Array, x: number, z: number, outside: number): number {
  const fx = (x + T_HALF) / T_STEP
  const fz = (z + T_HALF) / T_STEP
  if (fx < 0 || fz < 0 || fx >= T_RES || fz >= T_RES) return outside
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const tx = fx - i
  const tz = fz - j
  const k = j * T_VERTS + i
  const a = grid[k]
  const b = grid[k + 1]
  const c = grid[k + T_VERTS]
  const d = grid[k + T_VERTS + 1]
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
}

/** Ground height (world y) at a world position. */
export function getHeight(x: number, z: number): number {
  const fx = (x + T_HALF) / T_STEP
  const fz = (z + T_HALF) / T_STEP
  if (fx < 0 || fz < 0 || fx >= T_RES || fz >= T_RES) return -8
  return sampleGrid(heights, x, z, -8)
}

export function getPathMask(x: number, z: number): number {
  return sampleGrid(pathGrid, x, z, 0)
}

/** Unit normal of the terrain at (x,z). */
export function getNormal(x: number, z: number, e = 0.6): [number, number, number] {
  const hx = getHeight(x + e, z) - getHeight(x - e, z)
  const hz = getHeight(x, z + e) - getHeight(x, z - e)
  const nx = -hx
  const ny = 2 * e
  const nz = -hz
  const l = Math.hypot(nx, ny, nz)
  return [nx / l, ny / l, nz / l]
}

/** Slope as 1 - normal.y (0 = flat). */
export function getSlope(x: number, z: number): number {
  return 1 - getNormal(x, z)[1]
}

export const HILL_INFO = HILL
