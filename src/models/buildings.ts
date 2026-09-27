// Models for the buildings the player can construct.

import * as THREE from 'three'
import { Parts, mat, mul, paint, planarUV } from '../three/geom'
import { mulberry32 } from '../game/noise'
import { chimneyPart, doorPart, gableBody, gableRoof, windowPart } from './parts'
import { BuiltModel, buildHouse, finalizeModel } from './house'
import { barrel, crate } from './props'

export type BuildingType = 'cottage' | 'fishery' | 'lumber' | 'quarry' | 'lighthouse'

export function buildFishery(): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(41)
  const w = 3.4
  const d = 3.8
  const y0 = 0.35
  const h = 2.2
  parts.box('roughStone', [w + 0.3, 1.8 + y0, d + 0.3], [0, (y0 - 1.8) / 2, 0])
  parts.add('wall', gableBody(w, d, h, 1.5, y0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.box('beam', [0.22, h, 0.22], [sx * (w / 2 - 0.02), y0 + h / 2, sz * (d / 2 - 0.02)])
  const roof = gableRoof(parts, 'roof', 'trim', w, d, 1.5, y0 + h, 0.4, 0.35, 0.2)
  doorPart(parts, mat([-0.5, y0, d / 2 + 0.02]), 0.9, 1.7)
  windowPart(parts, mat([0.9, y0 + h * 0.55, d / 2 + 0.02]), { w: 0.55, h: 0.6, seed: 3 })
  windowPart(parts, mat([w / 2 + 0.02, y0 + h * 0.55, 0], [0, Math.PI / 2, 0]), { seed: 4, shutters: true })
  const chim = chimneyPart(parts, -w * 0.22, -d * 0.25, roof.topAt(-w * 0.22) - 0.6, roof.ridgeY + 0.6, 0.55)
  // fish drying rack
  parts.with(mat([w / 2 + 1.4, 0, 0.4]), () => {
    for (const sz of [-1, 1]) parts.box('beam', [0.1, 1.9, 0.1], [0, 0.95, sz * 1.1])
    parts.box('beam', [0.08, 0.08, 2.4], [0, 1.8, 0])
    parts.box('beam', [0.08, 0.08, 2.4], [0, 1.3, 0])
    for (let i = 0; i < 7; i++) {
      const g = paint(new THREE.SphereGeometry(0.1, 6, 5), '#a9b9c0')
      parts.add('goods', g, mat([0, 1.55 + (i % 2) * -0.5, -0.9 + i * 0.3], [0, 0, 0], [0.6, 2.2, 0.4]))
    }
  })
  // nets draped over a frame
  const net = new THREE.PlaneGeometry(1.8, 1.2, 8, 6)
  const pos = net.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) + 0.9) * 1.8) * 0.12 + Math.sin(pos.getY(i) * 3) * 0.05)
  net.computeVertexNormals()
  parts.add('cloth', net, mat([-w / 2 - 0.9, 0.9, 0.6], [-0.2, Math.PI / 2, 0]))
  parts.box('beam', [0.08, 1.5, 0.08], [-w / 2 - 0.9, 0.75, -0.3])
  parts.box('beam', [0.08, 1.5, 0.08], [-w / 2 - 0.9, 0.75, 1.5])
  barrel(parts, [0.8, 0, d / 2 + 0.9], 0.85, false, rnd())
  barrel(parts, [1.5, 0, d / 2 + 0.6], 0.8, false, rnd())
  crate(parts, [-1.6, 0, d / 2 + 0.7], 0.6, 0.4)
  return finalizeModel(parts, [chim], [-0.5, 0, d / 2 + 1.1])
}

export function buildLumberCamp(): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(51)
  const w = 3.6
  const d = 2.8
  // open shed with a lean-to roof
  for (const sx of [-1, 1]) {
    parts.box('beam', [0.2, 2.6, 0.2], [sx * (w / 2 - 0.1), 1.3, -d / 2 + 0.1])
    parts.box('beam', [0.2, 2.0, 0.2], [sx * (w / 2 - 0.1), 1.0, d / 2 - 0.1])
  }
  parts.with(mat([0, 2.35, 0], [Math.atan2(0.6, d), 0, 0]), () => {
    parts.box('roof', [w + 0.7, 0.18, d + 0.8], [0, 0, 0], [0, Math.PI, 0])
  })
  parts.box('wall', [w, 1.9, 0.1], [0, 1.05, -d / 2 + 0.05])
  // stacked logs under the shed
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5 - row; i++) {
      const x = -1.1 + i * 0.5 + row * 0.25
      parts.cyl('beam', 0.22, 0.22, 2.2, [x, 0.22 + row * 0.4, -0.1], [Math.PI / 2, 0, 0], 9)
      parts.add('trim', new THREE.CircleGeometry(0.2, 9), mat([x, 0.22 + row * 0.4, 1.01]))
    }
  }
  // chopping block with an axe
  parts.cyl('beam', 0.35, 0.38, 0.55, [w / 2 + 1.0, 0.27, 1.0], [0, 0, 0], 10)
  parts.add('trim', new THREE.CircleGeometry(0.34, 10), mat([w / 2 + 1.0, 0.555, 1.0], [-Math.PI / 2, 0, 0]))
  parts.cyl('trim', 0.035, 0.035, 0.8, [w / 2 + 1.0, 0.85, 1.0], [0.4, 0, 0.2], 6)
  parts.box('iron', [0.05, 0.22, 0.28], [w / 2 + 0.93, 0.6, 0.9])
  // sawhorse with a log
  parts.with(mat([-w / 2 - 1.2, 0, 0.6], [0, 0.3, 0]), () => {
    for (const sz of [-0.6, 0.6]) {
      parts.box('beam', [0.08, 0.9, 0.08], [0.25, 0.42, sz], [0, 0, 0.35])
      parts.box('beam', [0.08, 0.9, 0.08], [-0.25, 0.42, sz], [0, 0, -0.35])
    }
    parts.cyl('beam', 0.2, 0.2, 2.0, [0, 0.95, 0], [Math.PI / 2, 0, 0], 9)
  })
  for (let i = 0; i < 6; i++) {
    parts.box('trim', [0.12, 0.05, 0.3], [-w / 2 - 0.8 + rnd() * 1.2, 0.03, -0.4 + rnd() * 1.4], [0, rnd() * 3, 0])
  }
  return finalizeModel(parts, [], [0, 0, d / 2 + 1.2])
}

export function buildQuarry(): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(61)
  // cut stone blocks
  for (let i = 0; i < 9; i++) {
    const x = -1.4 + (i % 3) * 0.75
    const z = -0.6 + Math.floor(i / 3) * 0.7
    parts.box('stone', [0.62, 0.45, 0.55], [x, 0.22, z], [0, (rnd() - 0.5) * 0.2, 0], 0.5, false, [rnd(), rnd()])
    if (rnd() < 0.5) parts.box('stone', [0.55, 0.42, 0.5], [x, 0.66, z], [0, (rnd() - 0.5) * 0.3, 0], 0.5, false, [rnd(), rnd()])
  }
  // wooden treadwheel crane
  parts.with(mat([1.4, 0, 0.2]), () => {
    for (const sz of [-0.5, 0.5]) {
      parts.box('beam', [0.14, 3.2, 0.14], [-0.4, 1.5, sz], [0, 0, 0.14])
      parts.box('beam', [0.14, 3.2, 0.14], [0.4, 1.5, sz], [0, 0, -0.14])
    }
    parts.box('beam', [0.14, 0.14, 1.2], [0, 3.05, 0])
    parts.cyl('beam', 0.08, 0.1, 3.2, [0.9, 2.6, 0], [0, 0, -1.05], 8)
    parts.cyl('rope', 0.015, 0.015, 1.6, [2.1, 2.3, 0])
    parts.box('iron', [0.12, 0.12, 0.12], [2.1, 1.5, 0])
    const wheel = new THREE.TorusGeometry(0.85, 0.07, 6, 18)
    parts.add('beam', wheel, mat([0, 1.0, 0.75]))
    for (let k = 0; k < 4; k++) parts.box('beam', [1.7, 0.06, 0.06], [0, 1.0, 0.75], [0, 0, (k * Math.PI) / 4])
  })
  // tool shed
  parts.with(mat([-1.1, 0, -1.9]), () => {
    parts.add('wall', gableBody(2.4, 1.8, 1.6, 0.9, 0.2))
    parts.box('roughStone', [2.6, 1.4, 2.0], [0, -0.5, 0])
    gableRoof(parts, 'roof', 'trim', 2.4, 1.8, 0.9, 1.8, 0.3, 0.25, 0.16)
    doorPart(parts, mat([0.4, 0.2, 0.92]), 0.75, 1.3)
  })
  crate(parts, [0.4, 0, 1.4], 0.6, 0.5)
  return finalizeModel(parts, [], [0, 0, 1.8])
}

export function buildLighthouse(): BuiltModel {
  const parts = new Parts()
  const H = 13
  const rBot = 2.0
  const rTop = 1.35
  // base
  parts.add('roughStone', planarUV(new THREE.CylinderGeometry(rBot + 0.5, rBot + 0.7, 2.6, 20), 0.5), mat([0, -0.3, 0]))
  // banded tower
  const bands = 6
  for (let i = 0; i < bands; i++) {
    const y0 = 1.0 + (i * H) / bands
    const y1 = 1.0 + ((i + 1) * H) / bands
    const r0 = rBot + (rTop - rBot) * (i / bands)
    const r1 = rBot + (rTop - rBot) * ((i + 1) / bands)
    parts.add(i % 2 === 0 ? 'paintWhite' : 'paintRed', new THREE.CylinderGeometry(r1, r0, y1 - y0, 22), mat([0, (y0 + y1) / 2, 0]))
  }
  const topY = 1.0 + H
  // gallery
  parts.add('stone', new THREE.CylinderGeometry(rTop + 0.75, rTop + 0.3, 0.35, 22), mat([0, topY + 0.15, 0]))
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    parts.box('iron', [0.05, 0.75, 0.05], [Math.cos(a) * (rTop + 0.65), topY + 0.7, Math.sin(a) * (rTop + 0.65)])
  }
  parts.add('iron', new THREE.TorusGeometry(rTop + 0.65, 0.04, 5, 32), mat([0, topY + 1.05, 0], [Math.PI / 2, 0, 0]))
  // lantern room
  parts.add('iron', new THREE.CylinderGeometry(rTop * 0.85, rTop * 0.85, 0.2, 16), mat([0, topY + 0.42, 0]))
  parts.add('glass', new THREE.CylinderGeometry(rTop * 0.78, rTop * 0.78, 1.6, 16, 1, true), mat([0, topY + 1.3, 0]))
  parts.add('lamp', new THREE.SphereGeometry(0.5, 14, 10), mat([0, topY + 1.3, 0]))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    parts.box('iron', [0.08, 1.6, 0.08], [Math.cos(a) * rTop * 0.8, topY + 1.3, Math.sin(a) * rTop * 0.8])
  }
  parts.add('paintRed', new THREE.ConeGeometry(rTop * 1.02, 1.5, 16), mat([0, topY + 2.85, 0]))
  parts.add('iron', new THREE.SphereGeometry(0.15, 8, 6), mat([0, topY + 3.65, 0]))
  // door & windows
  doorPart(parts, mat([0, 1.0, rBot + 0.02]), 1.0, 1.9, 'stone', 'roughStone')
  for (const [y, a] of [
    [5, 0.5],
    [8.5, -0.6],
    [11.5, 0.2],
  ]) {
    const r = rBot + (rTop - rBot) * ((y - 1) / H)
    windowPart(parts, mul(mat([0, y, 0], [0, a, 0]), mat([0, 0, r + 0.02])), { w: 0.45, h: 0.7, seed: 7 })
  }
  return finalizeModel(parts, [], [0, 0, rBot + 1.6])
}

export const COTTAGE_STYLES = [
  { w: 4.4, d: 5.2, h: 2.6, roofH: 2.4, chimney: 1, dormer: false, wing: false, seed: 101 },
  { w: 4.6, d: 5.8, h: 2.7, roofH: 2.5, chimney: -1, dormer: true, wing: false, seed: 102 },
  { w: 4.2, d: 5.0, h: 2.5, roofH: 2.3, chimney: 1, dormer: false, wing: false, seed: 103 },
  { w: 4.8, d: 5.6, h: 2.8, roofH: 2.6, chimney: 1, dormer: true, wing: false, seed: 104 },
]

const cache = new Map<string, BuiltModel>()
export function buildingModel(type: BuildingType, variant = 0): BuiltModel {
  const key = `${type}-${variant}`
  let m = cache.get(key)
  if (m) return m
  switch (type) {
    case 'cottage':
      m = buildHouse(COTTAGE_STYLES[variant % COTTAGE_STYLES.length])
      break
    case 'fishery':
      m = buildFishery()
      break
    case 'lumber':
      m = buildLumberCamp()
      break
    case 'quarry':
      m = buildQuarry()
      break
    case 'lighthouse':
      m = buildLighthouse()
      break
  }
  cache.set(key, m)
  return m
}
