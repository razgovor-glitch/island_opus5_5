// Reusable architectural pieces: gable walls, roofs, windows, doors, chimneys, fences.

import * as THREE from 'three'
import { MeshData, Parts, Vec2, Vec3, mat, paint, planarUV } from '../three/geom'
import { mulberry32 } from '../game/noise'

/** Walls of a gabled building: front gable at +z, ridge along z. */
export function gableBody(w: number, d: number, h: number, roofH: number, y0: number, s = 0.5): THREE.BufferGeometry {
  const md = new MeshData()
  const hw = w / 2
  const hd = d / 2
  const yt = y0 + h
  const yr = yt + roofH
  const uvF = (x: number, y: number): Vec2 => [x * s, y * s]
  const uvB = (x: number, y: number): Vec2 => [-x * s, y * s]
  // front gable (+z)
  md.tri([-hw, y0, hd], [hw, y0, hd], [hw, yt, hd], uvF(-hw, y0), uvF(hw, y0), uvF(hw, yt), [0, 0, 1])
  md.tri([-hw, y0, hd], [hw, yt, hd], [-hw, yt, hd], uvF(-hw, y0), uvF(hw, yt), uvF(-hw, yt), [0, 0, 1])
  md.tri([-hw, yt, hd], [hw, yt, hd], [0, yr, hd], uvF(-hw, yt), uvF(hw, yt), uvF(0, yr), [0, 0, 1])
  // back gable (-z)
  md.tri([-hw, y0, -hd], [hw, y0, -hd], [hw, yt, -hd], uvB(-hw, y0), uvB(hw, y0), uvB(hw, yt), [0, 0, -1])
  md.tri([-hw, y0, -hd], [hw, yt, -hd], [-hw, yt, -hd], uvB(-hw, y0), uvB(hw, yt), uvB(-hw, yt), [0, 0, -1])
  md.tri([-hw, yt, -hd], [hw, yt, -hd], [0, yr, -hd], uvB(-hw, yt), uvB(hw, yt), uvB(0, yr), [0, 0, -1])
  // side walls
  md.quad([hw, y0, hd], [hw, y0, -hd], [hw, yt, -hd], [hw, yt, hd], [-hd * s, y0 * s], [hd * s, y0 * s], [hd * s, yt * s], [-hd * s, yt * s], [1, 0, 0])
  md.quad([-hw, y0, -hd], [-hw, y0, hd], [-hw, yt, hd], [-hw, yt, -hd], [-hd * s, y0 * s], [hd * s, y0 * s], [hd * s, yt * s], [-hd * s, yt * s], [-1, 0, 0])
  return md.geometry()
}

export interface RoofInfo {
  /** y of the roof's top surface at local x (between -xe and xe). */
  topAt: (x: number) => number
  ridgeY: number
  eaveX: number
}

/**
 * Gable roof over walls of width w (x) and length d (z) whose tops are at yt.
 * Adds shingles to `roofKey` and fascia / soffits to `trimKey`.
 */
export function gableRoof(
  parts: Parts,
  roofKey: string,
  trimKey: string,
  w: number,
  d: number,
  roofH: number,
  yt: number,
  ovSide = 0.45,
  ovEnd = 0.4,
  thick = 0.2,
  s = 0.5,
): RoofInfo {
  const hw = w / 2
  const L = d / 2 + ovEnd
  const k = roofH / hw
  const xe = hw + ovSide
  const ye = yt - k * ovSide
  const yr = yt + roofH
  const cosA = hw / Math.hypot(hw, roofH)
  const tv = thick / cosA
  const slope = Math.hypot(xe, yr - ye)
  const top = new MeshData()
  const trim = new MeshData()
  for (const side of [1, -1]) {
    const out: Vec3 = [side * roofH, hw, 0]
    top.quad(
      [side * xe, ye + tv, L],
      [side * xe, ye + tv, -L],
      [0, yr + tv, -L],
      [0, yr + tv, L],
      [side * L * s, 0],
      [-side * L * s, 0],
      [-side * L * s, slope * s],
      [side * L * s, slope * s],
      out,
    )
    // underside (soffit)
    trim.quad([side * xe, ye, L], [0, yr, L], [0, yr, -L], [side * xe, ye, -L], [0, 0], [slope * s, 0], [slope * s, 2 * L * s], [0, 2 * L * s], [-side * roofH, -hw, 0])
    // gable-end fascia boards
    for (const zs of [1, -1]) {
      trim.quad(
        [side * xe, ye, zs * L],
        [0, yr, zs * L],
        [0, yr + tv, zs * L],
        [side * xe, ye + tv, zs * L],
        [0, 0],
        [slope * s, 0],
        [slope * s, tv * s],
        [0, tv * s],
        [0, 0, zs],
      )
    }
    // eave edge
    trim.quad([side * xe, ye, -L], [side * xe, ye, L], [side * xe, ye + tv, L], [side * xe, ye + tv, -L], [0, 0], [2 * L * s, 0], [2 * L * s, tv * s], [0, tv * s], [side, -0.3, 0])
  }
  parts.add(roofKey, top.geometry())
  parts.add(trimKey, trim.geometry())
  // ridge cap
  const cap = planarUV(new THREE.BoxGeometry(0.26, 0.26, 2 * L + 0.1), 0.5)
  parts.add(trimKey, cap, mat([0, yr + tv - 0.02, 0], [0, 0, Math.PI / 4]))
  return {
    topAt: (x: number) => yr + tv - k * Math.abs(x),
    ridgeY: yr + tv,
    eaveX: xe,
  }
}

/** Window facing +z, centred at the origin (wall surface at z = 0). */
export function windowPart(
  parts: Parts,
  m: THREE.Matrix4,
  opt: { w?: number; h?: number; shutters?: boolean; flowers?: boolean; seed?: number; arch?: boolean } = {},
) {
  const w = opt.w ?? 0.78
  const h = opt.h ?? 0.92
  const rnd = mulberry32(opt.seed ?? 1)
  parts.with(m, () => {
    const fd = 0.14
    parts.box('trim', [w + 0.22, 0.11, fd], [0, h / 2 + 0.055, 0.03])
    parts.box('trim', [w + 0.22, 0.11, fd], [0, -h / 2 - 0.055, 0.03])
    parts.box('trim', [0.11, h, fd], [w / 2 + 0.055, 0, 0.03])
    parts.box('trim', [0.11, h, fd], [-w / 2 - 0.055, 0, 0.03])
    parts.box('glass', [w, h, 0.04], [0, 0, -0.01])
    parts.box('trim', [0.05, h, 0.05], [0, 0, 0.02])
    parts.box('trim', [w, 0.05, 0.05], [0, h * 0.08, 0.02])
    parts.box('trim', [w + 0.36, 0.07, 0.26], [0, -h / 2 - 0.13, 0.1])
    if (opt.shutters) {
      for (const sd of [-1, 1]) {
        parts.box('door', [w * 0.5, h + 0.06, 0.05], [sd * (w * 0.75 + 0.14), 0, 0.06], [0, 0, 0], 0.5, true)
      }
    }
    if (opt.flowers) {
      parts.box('beam', [w + 0.2, 0.2, 0.24], [0, -h / 2 - 0.27, 0.15])
      const cols = ['#d8413a', '#e8773a', '#f2c6d4', '#f4f0e6', '#e0a3c8', '#f2cd4a']
      const leaf = new THREE.IcosahedronGeometry(0.1, 0)
      for (let i = 0; i < 7; i++) {
        const x = -w / 2 + 0.05 + (i / 6) * (w - 0.1)
        parts.add('flowers', paint(leaf.clone(), '#4f7a39'), mat([x, -h / 2 - 0.12, 0.15 + (rnd() - 0.5) * 0.08], [rnd(), rnd(), 0], [1.1, 0.8, 1]))
        const f = new THREE.IcosahedronGeometry(0.055 + rnd() * 0.03, 0)
        parts.add('flowers', paint(f, cols[Math.floor(rnd() * cols.length)]), mat([x + (rnd() - 0.5) * 0.08, -h / 2 - 0.06 + rnd() * 0.05, 0.15 + (rnd() - 0.5) * 0.1]))
      }
    }
  })
}

function archShape(w: number, h: number, pointed = false): THREE.Shape {
  const s = new THREE.Shape()
  const r = w / 2
  const spring = h - (pointed ? w * 0.85 : r)
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, spring)
  if (pointed) {
    s.quadraticCurveTo(r, spring + (h - spring) * 0.72, 0, h)
    s.quadraticCurveTo(-r, spring + (h - spring) * 0.72, -r, spring)
  } else {
    s.absarc(0, spring, r, 0, Math.PI, false)
  }
  s.lineTo(-r, 0)
  return s
}

export function archGeometry(w: number, h: number, depth: number, pointed = false, swap = false): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(archShape(w, h, pointed), { depth, bevelEnabled: false, curveSegments: 10 })
  return planarUV(g, 0.5, swap)
}

/** Arched plank door facing +z with its bottom centre at the origin. */
export function doorPart(parts: Parts, m: THREE.Matrix4, w = 1.0, h = 1.9, frameKey = 'trim', stepKey = 'stone') {
  parts.with(m, () => {
    parts.add(frameKey, archGeometry(w + 0.28, h + 0.14, 0.12), mat([0, 0, -0.04]))
    parts.add('door', archGeometry(w, h, 0.12, false, true), mat([0, 0, -0.01]))
    // iron straps and ring handle
    parts.box('iron', [w * 0.9, 0.06, 0.03], [0, h * 0.25, 0.12])
    parts.box('iron', [w * 0.9, 0.06, 0.03], [0, h * 0.62, 0.12])
    parts.add('iron', new THREE.TorusGeometry(0.06, 0.015, 6, 12), mat([w * 0.3, h * 0.45, 0.13]))
    parts.box(stepKey, [w + 0.7, 0.45, 0.6], [0, -0.2, 0.3])
  })
}

/** Stone chimney standing at (x, z) from yBase up to yTop. Returns the top centre. */
export function chimneyPart(parts: Parts, x: number, z: number, yBase: number, yTop: number, size = 0.72): Vec3 {
  const h = yTop - yBase
  parts.box('stone', [size, h, size], [x, yBase + h / 2, z])
  parts.box('stone', [size + 0.18, 0.16, size + 0.18], [x, yTop + 0.02, z])
  parts.box('stone', [size - 0.12, 0.14, size - 0.12], [x, yTop + 0.16, z])
  parts.box('dark', [size - 0.3, 0.02, size - 0.3], [x, yTop + 0.235, z])
  return [x, yTop + 0.25, z]
}

/** Post-and-rail fence along a polyline in the current Parts frame, following terrain via yAt. */
export function fencePart(parts: Parts, pts: Vec2[], yAt: (x: number, z: number) => number, spacing = 1.35) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / spacing))
    const ang = Math.atan2(bx - ax, bz - az)
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue
      const t = k / n
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      const y = yAt(x, z)
      parts.box('beam', [0.13, 1.0, 0.13], [x, y + 0.42, z], [0, ang, 0])
      if (k < n) {
        const t2 = (k + 0.5) / n
        const mx = ax + (bx - ax) * t2
        const mz = az + (bz - az) * t2
        const y2 = yAt(ax + (bx - ax) * ((k + 1) / n), az + (bz - az) * ((k + 1) / n))
        const my = (y + y2) / 2
        const seg = len / n
        const tilt = Math.atan2(y2 - y, seg)
        for (const hh of [0.45, 0.78]) {
          const rail = planarUV(new THREE.BoxGeometry(0.07, 0.1, Math.hypot(seg, y2 - y) + 0.05), 0.5)
          parts.add('trim', rail, mat([mx, my + hh, mz], [-tilt, ang, 0], [1, 1, 1], 'YXZ'))
        }
      }
    }
  }
}

export { mat }
