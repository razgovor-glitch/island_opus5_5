// Wooden sailing ships and rowboats built from lofted hull stations.

import * as THREE from 'three'
import { MeshData, Parts, Vec3, mat, mul, planarUV } from '../three/geom'
import { smoothstep } from '../game/noise'

export interface HullSpec {
  length: number
  beam: number
  depth: number // keel to the waist gunwale
  sternRise: number
  bowRise: number
  transom: number // stern half-width fraction (0 = pointed)
  open?: boolean // rowboat: no decks
}

interface Station {
  x: number
  hb: number // half beam
  keel: number
  gun: number // gunwale height
}

function stations(spec: HullSpec, n: number): Station[] {
  const out: Station[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n // 0 = stern, 1 = bow
    const x = (t - 0.5) * spec.length
    let f: number
    if (t < 0.42) f = spec.transom + (1 - spec.transom) * Math.sin((t / 0.42) * Math.PI * 0.5)
    else f = Math.pow(Math.max(0, Math.cos(Math.min(1, (t - 0.42) / 0.58) * Math.PI * 0.5)), 0.75)
    const hb = Math.max(0.001, (spec.beam / 2) * f)
    const keel = -spec.depth * 0.62 + spec.depth * 0.42 * Math.pow(smoothstep(0.72, 1, t), 1.4) + spec.depth * 0.12 * smoothstep(0.12, 0, t)
    const gun = spec.depth * 0.38 + spec.sternRise * smoothstep(0.34, 0.02, t) + spec.bowRise * smoothstep(0.7, 1, t)
    out.push({ x, hb, keel, gun })
  }
  return out
}

/** Point on a station's cross-section: s in [0,1] from keel (0) to gunwale (1), side = ±1. */
function sectionPoint(st: Station, s: number, side: number): Vec3 {
  const phi = Math.min(1, Math.max(0, s)) * Math.PI * 0.5
  let across = st.hb * Math.pow(Math.max(0, Math.sin(phi)), 0.55)
  across *= 1 - 0.07 * smoothstep(0.75, 1, s) // slight tumblehome
  const y = st.keel + (st.gun - st.keel) * Math.pow(Math.max(0, 1 - Math.cos(phi)), 0.95)
  return [st.x, y, side * across]
}

function hullColor(y: number, gun: number): Vec3 {
  if (y < -0.05) return [0.52, 0.47, 0.4] // wet, darker below the waterline
  if (y < 0.28) return [0.42, 0.29, 0.2] // dark wale band
  if (gun - y < 0.22) return [1.08, 0.98, 0.86] // light cap rail
  return [1, 1, 1]
}

export function buildHull(parts: Parts, spec: HullSpec, n = 26, k = 10): Station[] {
  const st = stations(spec, n)
  const md = new MeshData()
  const s = 0.5
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < k; j++) {
        const a = sectionPoint(st[i], j / k, side)
        const b = sectionPoint(st[i + 1], j / k, side)
        const c = sectionPoint(st[i + 1], (j + 1) / k, side)
        const d = sectionPoint(st[i], (j + 1) / k, side)
        const cy = (a[1] + c[1]) / 2
        md.color = hullColor(cy, (st[i].gun + st[i + 1].gun) / 2)
        md.quad(a, b, c, d, [a[0] * s, a[1] * s], [b[0] * s, b[1] * s], [c[0] * s, c[1] * s], [d[0] * s, d[1] * s], [0, -0.45, side])
      }
    }
  }
  // transom (flat stern)
  const s0 = st[0]
  md.color = [0.95, 0.9, 0.85]
  for (let j = 0; j < k; j++) {
    const a = sectionPoint(s0, j / k, 1)
    const b = sectionPoint(s0, (j + 1) / k, 1)
    const c = sectionPoint(s0, (j + 1) / k, -1)
    const d = sectionPoint(s0, j / k, -1)
    md.quad(a, b, c, d, [a[2] * s, a[1] * s], [b[2] * s, b[1] * s], [c[2] * s, c[1] * s], [d[2] * s, d[1] * s], [-1, 0, 0])
  }
  parts.add('hull', md.geometry())
  return st
}

function deckStrip(parts: Parts, st: Station[], from: number, to: number, y: number, inset = 0.92) {
  const md = new MeshData()
  const s = 0.5
  for (let i = from; i < to; i++) {
    const a = st[i]
    const b = st[i + 1]
    md.quad(
      [a.x, y, a.hb * inset],
      [b.x, y, b.hb * inset],
      [b.x, y, -b.hb * inset],
      [a.x, y, -a.hb * inset],
      [a.x * s, a.hb * s],
      [b.x * s, b.hb * s],
      [b.x * s, -b.hb * s],
      [a.x * s, -a.hb * s],
      [0, 1, 0],
    )
  }
  parts.add('deck', md.geometry())
}

export interface ShipModel {
  geos: Map<string, THREE.BufferGeometry>
  rigging: THREE.BufferGeometry
  flagPos: Vec3
  sails: THREE.BufferGeometry | null
  length: number
}

/** A three-masted carrack. Local frame: bow towards +x, waterline at y = 0. */
export function buildShip(opts: { seed?: number; sails?: boolean } = {}): ShipModel {
  const parts = new Parts()
  const spec: HullSpec = { length: 14, beam: 4.4, depth: 2.6, sternRise: 1.6, bowRise: 0.9, transom: 0.72 }
  const n = 28
  const st = buildHull(parts, spec, n)
  const at = (t: number) => st[Math.round(t * n)]

  // decks at three levels
  const iQ = Math.round(0.3 * n)
  const iF = Math.round(0.74 * n)
  const waistY = at(0.5).gun - 0.6
  const quarterY = at(0.05).gun - 0.55
  const foreY = at(0.9).gun - 0.5
  deckStrip(parts, st, 0, iQ, quarterY)
  deckStrip(parts, st, iQ, iF, waistY)
  deckStrip(parts, st, iF, n - 1, foreY, 0.85)
  // bulkheads between deck levels
  const bq = st[iQ]
  parts.box('hull', [0.12, quarterY - waistY + 0.02, bq.hb * 1.8], [bq.x, (quarterY + waistY) / 2, 0])
  const bf = st[iF]
  parts.box('hull', [0.12, foreY - waistY + 0.02, bf.hb * 1.7], [bf.x, (foreY + waistY) / 2, 0])
  // doors & windows on the aft bulkhead
  parts.box('dark', [0.06, 0.95, 0.6], [bq.x + 0.07, waistY + 0.5, 0])
  for (const zz of [-1, 1]) parts.box('glass', [0.05, 0.35, 0.35], [bq.x + 0.07, waistY + 0.75, zz * 1.2])
  // stern windows & lantern
  const s0 = st[0]
  for (const zz of [-0.9, 0, 0.9]) parts.box('glass', [0.06, 0.4, 0.42], [s0.x - 0.03, s0.gun - 0.75, zz])
  parts.box('trim', [0.1, 0.12, s0.hb * 1.9], [s0.x - 0.02, s0.gun - 0.45, 0])
  parts.cyl('iron', 0.12, 0.16, 0.45, [s0.x - 0.15, s0.gun + 0.55, 0])
  parts.add('lamp', new THREE.SphereGeometry(0.11, 8, 6), mat([s0.x - 0.15, s0.gun + 0.55, 0]))
  parts.cyl('beam', 0.04, 0.04, 0.7, [s0.x - 0.05, s0.gun + 0.2, 0])
  // rudder
  parts.box('hull', [0.5, 2.4, 0.14], [s0.x - 0.18, s0.keel + 1.1, 0])

  // portholes along the sides
  for (const side of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const t = 0.3 + i * 0.075
      const stt = at(t)
      const y = 0.55
      const p = sectionPoint(stt, 0.72, side)
      parts.add('dark', new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), mat([p[0], y, p[2] * 1.01], [Math.PI / 2, 0, 0]))
      parts.add('trim', new THREE.TorusGeometry(0.15, 0.035, 6, 12), mat([p[0], y, p[2] * 1.02]))
    }
    // rail posts on the waist
    for (let i = iQ; i <= iF; i += 2) {
      const stt = st[i]
      parts.box('trim', [0.09, 0.5, 0.09], [stt.x, stt.gun + 0.22, side * stt.hb * 0.95])
    }
  }
  // cap rail on the waist
  for (const side of [1, -1]) {
    const md = new MeshData()
    for (let i = iQ; i < iF; i++) {
      const a = st[i]
      const b = st[i + 1]
      md.quad(
        [a.x, a.gun + 0.47, side * a.hb * 0.9],
        [b.x, b.gun + 0.47, side * b.hb * 0.9],
        [b.x, b.gun + 0.47, side * b.hb],
        [a.x, a.gun + 0.47, side * a.hb],
        [0, 0],
        [0.5, 0],
        [0.5, 0.05],
        [0, 0.05],
        [0, 1, 0],
      )
    }
    parts.add('trim', md.geometry())
  }

  // masts, yards, furled sails, fighting top
  const masts: { t: number; h: number }[] = [
    { t: 0.72, h: 10.5 },
    { t: 0.47, h: 13 },
    { t: 0.2, h: 8.5 },
  ]
  const tops: Vec3[] = []
  const yardEnds: Vec3[] = []
  const sailGeos: THREE.BufferGeometry[] = []
  for (const mm of masts) {
    const stt = at(mm.t)
    const baseY = mm.t > 0.3 ? waistY : quarterY
    const top = baseY + mm.h
    parts.cyl('beam', 0.12, 0.2, mm.h, [stt.x, baseY + mm.h / 2, 0], [0, 0, 0], 10)
    tops.push([stt.x, top, 0])
    const yards = mm.t === 0.2 ? [0.75] : [0.52, 0.82]
    for (const yf of yards) {
      const yy = baseY + mm.h * yf
      const len = spec.beam * (yf < 0.6 ? 1.55 : 1.15) * (mm.t === 0.2 ? 0.8 : 1)
      parts.cyl('beam', 0.07, 0.07, len, [stt.x + 0.12, yy, 0], [Math.PI / 2, 0, 0], 8)
      yardEnds.push([stt.x + 0.12, yy, len / 2], [stt.x + 0.12, yy, -len / 2])
      if (!opts.sails) {
        // furled sail bundled on the yard
        const furl = new THREE.CapsuleGeometry(0.17, len * 0.82, 4, 8)
        parts.add('sail', furl, mat([stt.x + 0.18, yy - 0.12, 0], [Math.PI / 2, 0, 0]))
      } else {
        // a billowing square sail hanging below the yard
        const sh = mm.h * (yf < 0.6 ? 0.36 : 0.26)
        const g = new THREE.PlaneGeometry(len * 0.92, sh, 10, 6)
        const pos = g.attributes.position
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const y = pos.getY(i)
          const u = x / (len * 0.46)
          const v = (y + sh / 2) / sh
          const belly = (1 - u * u) * Math.sin(v * Math.PI * 0.85 + 0.2) * 0.9
          pos.setXYZ(i, x, y, belly)
        }
        g.computeVertexNormals()
        g.applyMatrix4(mat([stt.x + 0.3, yy - sh / 2 - 0.08, 0], [0, Math.PI / 2, 0]))
        sailGeos.push(g)
      }
    }
    if (mm.t === 0.47) {
      const ty = baseY + mm.h * 0.7
      parts.cyl('beam', 0.62, 0.45, 0.45, [stt.x, ty, 0], [0, 0, 0], 12)
      parts.cyl('trim', 0.66, 0.66, 0.08, [stt.x, ty + 0.24, 0], [0, 0, 0], 12)
    }
  }
  // bowsprit
  const bow = st[n]
  const bsLen = 5
  const bsA = 0.35
  const bsBase: Vec3 = [bow.x - 1.2, foreY + 0.4, 0]
  const bsTip: Vec3 = [bsBase[0] + Math.cos(bsA) * bsLen, bsBase[1] + Math.sin(bsA) * bsLen, 0]
  parts.cyl('beam', 0.07, 0.13, bsLen, [(bsBase[0] + bsTip[0]) / 2, (bsBase[1] + bsTip[1]) / 2, 0], [0, 0, bsA - Math.PI / 2], 8)
  // figurehead-ish bow knob
  parts.add('trim', new THREE.SphereGeometry(0.2, 8, 6), mat([bow.x - 0.05, bow.gun + 0.05, 0]))

  // anchor hanging at the bow
  parts.box('iron', [0.08, 0.9, 0.08], [bow.x - 1.6, 0.9, bow.hb + 0.9], [0, 0, 0.1])

  // rigging lines
  const lines: number[] = []
  const L = (a: Vec3, b: Vec3) => lines.push(...a, ...b)
  for (let m = 0; m < masts.length; m++) {
    const mm = masts[m]
    const top = tops[m]
    const i0 = Math.round(mm.t * n)
    for (const side of [1, -1]) {
      for (const di of [-2, -1, 0, 1]) {
        const stt = st[Math.max(0, Math.min(n, i0 + di))]
        L([top[0], top[1] - 0.4, 0], [stt.x, stt.gun + 0.45, side * stt.hb * 0.98])
      }
      // ratlines (horizontal steps) between two shrouds
      const sa = st[Math.max(0, i0 - 1)]
      for (let r = 1; r < 7; r++) {
        const f = r / 8
        const y = sa.gun + 0.45 + (top[1] - 0.4 - sa.gun - 0.45) * f
        const zA = side * sa.hb * 0.98 * (1 - f)
        L([sa.x + (top[0] - sa.x) * f - 0.25 * (1 - f), y, zA], [sa.x + (top[0] - sa.x) * f + 0.25 * (1 - f), y, zA])
      }
    }
  }
  L(tops[1], [tops[0][0], tops[0][1] - 3, 0])
  L(tops[0], bsTip)
  L([tops[0][0], tops[0][1] - 4, 0], [bsTip[0] - 1.5, bsTip[1] - 0.5, 0])
  L(tops[2], [tops[1][0], tops[1][1] - 5, 0])
  L(tops[2], [s0.x, s0.gun + 0.5, 0])
  for (let e = 0; e < yardEnds.length; e += 2) {
    const a = yardEnds[e]
    const b = yardEnds[e + 1]
    // braces from yard-arms towards the deck
    L(a, [a[0] - 2.5, waistY + 1.2, a[2] * 0.4])
    L(b, [b[0] - 2.5, waistY + 1.2, b[2] * 0.4])
  }
  const rigging = new THREE.BufferGeometry()
  rigging.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))

  let sails: THREE.BufferGeometry | null = null
  if (sailGeos.length) {
    const merged = new Parts()
    for (const g of sailGeos) merged.add('sail', g)
    sails = merged.merge().get('sail') ?? null
  }

  return {
    geos: parts.merge(),
    rigging,
    flagPos: [tops[1][0], tops[1][1] + 0.1, 0],
    sails,
    length: spec.length,
  }
}

/** Small open rowboat. Bow towards +x. */
export function buildRowboat(): { geos: Map<string, THREE.BufferGeometry> } {
  const parts = new Parts()
  const spec: HullSpec = { length: 3.9, beam: 1.45, depth: 0.62, sternRise: 0.08, bowRise: 0.18, transom: 0.55, open: true }
  const st = buildHull(parts, spec, 16, 6)
  // floor boards
  deckStrip(parts, st, 1, 15, st[8].keel + 0.12, 0.7)
  // thwarts
  for (const t of [0.3, 0.55, 0.8]) {
    const s = st[Math.round(t * 16)]
    parts.box('deck', [0.26, 0.05, s.hb * 1.85], [s.x, s.gun - 0.16, 0])
  }
  // gunwale rail
  for (const side of [1, -1]) {
    const md = new MeshData()
    for (let i = 0; i < 16; i++) {
      const a = st[i]
      const b = st[i + 1]
      md.quad(
        [a.x, a.gun + 0.02, side * a.hb * 0.86],
        [b.x, b.gun + 0.02, side * b.hb * 0.86],
        [b.x, b.gun + 0.02, side * b.hb * 1.02],
        [a.x, a.gun + 0.02, side * a.hb * 1.02],
        [0, 0],
        [0.3, 0],
        [0.3, 0.05],
        [0, 0.05],
        [0, 1, 0],
      )
    }
    parts.add('trim', md.geometry())
  }
  return { geos: parts.merge() }
}

/** Oar geometry (along +x, blade at +x end). */
export function buildOar(): THREE.BufferGeometry {
  const parts = new Parts()
  parts.cyl('trim', 0.03, 0.03, 2.2, [0, 0, 0], [0, 0, Math.PI / 2], 6)
  parts.box('trim', [0.6, 0.02, 0.16], [1.3, 0, 0])
  return parts.merge().get('trim')!
}

export function shipBounds(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-7.5, -2, -2.4), new THREE.Vector3(10, 14, 2.4))
}

export { mul, planarUV }
