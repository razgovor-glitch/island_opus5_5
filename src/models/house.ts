// Timber cottages with shingled gable roofs, stone foundations and chimneys.

import * as THREE from 'three'
import { Parts, Vec3, mat, mul } from '../three/geom'
import { chimneyPart, doorPart, gableBody, gableRoof, windowPart } from './parts'
import type { HouseStyle } from '../game/layout'
import { mulberry32 } from '../game/noise'

export interface BuiltModel {
  geos: Map<string, THREE.BufferGeometry>
  chimneys: Vec3[]
  /** Local point just outside the main door (where villagers go). */
  door: Vec3
  height: number
  /** Local-space bounds of the whole model (used for obstacles / placement). */
  bounds: THREE.Box3
}

export function finalizeModel(parts: Parts, chimneys: Vec3[], door: Vec3): BuiltModel {
  const geos = parts.merge()
  const bounds = new THREE.Box3()
  for (const g of geos.values()) {
    if (!g.boundingBox) g.computeBoundingBox()
    bounds.union(g.boundingBox!)
  }
  return { geos, chimneys, door, height: bounds.max.y, bounds }
}

const cache = new Map<string, BuiltModel>()

export function buildHouse(style: HouseStyle): BuiltModel {
  const key = JSON.stringify(style)
  const hit = cache.get(key)
  if (hit) return hit

  const parts = new Parts()
  const rnd = mulberry32(style.seed)
  const { w, d, h, roofH } = style
  const y0 = 0.35
  const yt = y0 + h
  const hw = w / 2
  const hd = d / 2
  const chimneys: Vec3[] = []

  // foundation & walls
  parts.box('roughStone', [w + 0.36, 1.8 + y0, d + 0.36], [0, (y0 - 1.8) / 2, 0])
  parts.add('wall', gableBody(w, d, h, roofH, y0))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.box('beam', [0.26, h + 0.04, 0.26], [sx * (hw - 0.03), y0 + h / 2, sz * (hd - 0.03)])
    parts.box('beam', [0.2, 0.22, d + 0.12], [sx * (hw + 0.04), yt - 0.1, 0])
    parts.box('beam', [0.18, 0.16, d + 0.1], [sx * (hw + 0.03), y0 + 0.08, 0])
  }
  for (const sz of [-1, 1]) parts.box('beam', [w + 0.12, 0.2, 0.2], [0, yt - 0.02, sz * (hd + 0.04)])

  const roof = gableRoof(parts, 'roof', 'trim', w, d, roofH, yt, 0.5, 0.45, 0.24)

  // wing (L-shaped extension) on one side
  const wingSide = style.chimney === 1 ? -1 : 1
  let wingZ: [number, number] | null = null
  if (style.wing) {
    const ww = Math.min(d * 0.55, 3.4)
    const ext = 2.5
    const wlen = hw * 0.6 + ext
    const xc = wingSide * (hw * 0.4 + hw + ext) * 0.5
    const zc = hd - ww / 2 - 0.35
    const wh = h * 0.9
    const wRoofH = Math.min(roofH * 0.8, ww * 0.55)
    wingZ = [zc - ww / 2 - 0.4, zc + ww / 2 + 0.4]
    parts.with(mat([xc, 0, zc], [0, (wingSide * Math.PI) / 2, 0]), () => {
      parts.box('roughStone', [ww + 0.3, 1.8 + y0, wlen + 0.3], [0, (y0 - 1.8) / 2, 0])
      parts.add('wall', gableBody(ww, wlen, wh, wRoofH, y0))
      for (const sx of [-1, 1]) parts.box('beam', [0.24, wh, 0.24], [sx * (ww / 2 - 0.03), y0 + wh / 2, wlen / 2 - 0.03])
      gableRoof(parts, 'roof', 'trim', ww, wlen, wRoofH, y0 + wh, 0.4, 0.35, 0.2)
      windowPart(parts, mat([0, y0 + wh * 0.52, wlen / 2 + 0.02]), { shutters: true, flowers: rnd() < 0.7, seed: style.seed + 5 })
      windowPart(parts, mat([ww / 2 + 0.02, y0 + wh * 0.52, wlen * 0.12], [0, Math.PI / 2, 0]), { seed: style.seed + 6 })
      windowPart(parts, mat([-ww / 2 - 0.02, y0 + wh * 0.52, wlen * 0.12], [0, -Math.PI / 2, 0]), { seed: style.seed + 7 })
    })
  }

  // door on the front gable
  const doorX = style.wing ? -wingSide * hw * 0.28 : 0
  doorPart(parts, mat([doorX, y0, hd + 0.02]), 1.0, 1.85)
  // windows on the front gable
  if (style.wing) {
    windowPart(parts, mat([wingSide * hw * 0.42, y0 + h * 0.52, hd + 0.02]), { w: 0.62, seed: style.seed + 8 })
  } else if (w > 4.7) {
    windowPart(parts, mat([hw * 0.62, y0 + h * 0.52, hd + 0.02]), { w: 0.55, h: 0.85, seed: style.seed + 8, flowers: true })
  }
  windowPart(parts, mat([0, yt + roofH * 0.3, hd + 0.02]), { w: 0.55, h: 0.66, seed: style.seed + 9 })
  // back gable
  windowPart(parts, mat([0, y0 + h * 0.52, -hd - 0.02], [0, Math.PI, 0]), { seed: style.seed + 10, shutters: true })
  windowPart(parts, mat([0, yt + roofH * 0.3, -hd - 0.02], [0, Math.PI, 0]), { w: 0.5, h: 0.6, seed: style.seed + 11 })
  // side windows
  for (const sx of [-1, 1]) {
    const zs = d > 5.4 ? [-hd * 0.45, hd * 0.45] : [0]
    for (const z of zs) {
      if (wingZ && sx === wingSide && z > wingZ[0] && z < wingZ[1]) continue
      windowPart(parts, mat([sx * (hw + 0.02), y0 + h * 0.52, z], [0, (sx * Math.PI) / 2, 0]), {
        shutters: rnd() < 0.45,
        flowers: rnd() < 0.45,
        seed: style.seed * 13 + Math.round(z * 10) + sx,
      })
    }
  }

  // chimney
  if (style.chimney !== 0) {
    const cx = style.chimney * hw * 0.45
    const cz = -hd * 0.3
    chimneys.push(chimneyPart(parts, cx, cz, roof.topAt(cx) - 0.8, roof.ridgeY + 0.75))
  }

  // dormer on the slope opposite the chimney
  if (style.dormer) {
    const ds = style.chimney === 1 ? -1 : 1
    const dw = 1.45
    const depth = 2.4
    const dh = 1.05
    const xF = ds * hw * 0.64
    const y0d = roof.topAt(xF) - 0.25
    const xc = xF - (ds * depth) / 2
    const zPos = hd * 0.18
    parts.with(mul(mat([xc, 0, zPos]), mat([0, 0, 0], [0, (ds * Math.PI) / 2, 0])), () => {
      parts.add('wall', gableBody(dw, depth, dh, 0.72, y0d))
      for (const sx of [-1, 1]) parts.box('beam', [0.16, dh, 0.16], [sx * (dw / 2 - 0.02), y0d + dh / 2, depth / 2 - 0.02])
      gableRoof(parts, 'roof', 'trim', dw, depth, 0.72, y0d + dh, 0.22, 0.2, 0.16)
      windowPart(parts, mat([0, y0d + dh * 0.5, depth / 2 + 0.02]), { w: 0.6, h: 0.62, seed: style.seed + 20 })
    })
  }

  const model = finalizeModel(parts, chimneys, [doorX, 0, hd + 1.1])
  cache.set(key, model)
  return model
}
