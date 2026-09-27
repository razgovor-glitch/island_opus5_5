// Harbour furniture: pier, market stall, well, crates and barrels.

import * as THREE from 'three'
import { Parts, Vec3, flipGeometry, mat, mul, paint, planarUV } from '../three/geom'
import { mulberry32 } from '../game/noise'
import { gableRoof } from './parts'
import { BuiltModel, finalizeModel } from './house'

export function barrel(parts: Parts, p: Vec3, s = 1, lying = false, rotY = 0) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    pts.push(new THREE.Vector2((0.34 + Math.sin(t * Math.PI) * 0.07) * s, t * 0.95 * s))
  }
  const g = new THREE.LatheGeometry(pts, 14)
  // staves: vertical planks
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.5, uv.getX(i) * 1.2)
  const m = lying ? mat(p, [Math.PI / 2, rotY, 0], [1, 1, 1], 'YXZ') : mat(p, [0, rotY, 0])
  parts.add('door', g, m)
  parts.add('beam', new THREE.CircleGeometry(0.33 * s, 14), mul(m, mat([0, 0.95 * s, 0], [-Math.PI / 2, 0, 0])))
  for (const hy of [0.12, 0.83]) {
    parts.add('iron', new THREE.TorusGeometry((0.36 + Math.sin(hy * Math.PI) * 0.06) * s, 0.022 * s, 5, 16), mul(m, mat([0, hy * 0.95 * s, 0], [Math.PI / 2, 0, 0])))
  }
}

export function crate(parts: Parts, p: Vec3, s = 0.7, rotY = 0) {
  parts.with(mat(p, [0, rotY, 0]), () => {
    parts.box('deck', [s, s, s], [0, s / 2, 0])
    const e = 0.06
    for (const [x, z] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      parts.box('beam', [e * 1.4, s + 0.01, e * 1.4], [(x * (s - e)) / 2, s / 2, (z * (s - e)) / 2])
    }
    for (const y of [e / 2, s - e / 2]) {
      parts.box('beam', [s + 0.01, e, e * 1.4], [0, y, (s - e) / 2])
      parts.box('beam', [s + 0.01, e, e * 1.4], [0, y, -(s - e) / 2])
      parts.box('beam', [e * 1.4, e, s + 0.01], [(s - e) / 2, y, 0])
      parts.box('beam', [e * 1.4, e, s + 0.01], [-(s - e) / 2, y, 0])
    }
  })
}

/** Pier from the origin out along +z. Deck top sits at world y = deckY. */
export function buildPier(length: number, width: number, deckY = 1.05): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(99)
  const hw = width / 2
  // posts
  const n = Math.round(length / 2.2)
  for (let i = 0; i <= n; i++) {
    const z = 0.4 + (i / n) * (length - 0.6)
    for (const sx of [-1, 1]) {
      const tall = i % 3 === 0 || i === n
      const top = deckY + (tall ? 0.55 : -0.05)
      const bottom = -4.5
      parts.cyl('beam', 0.15, 0.17, top - bottom, [sx * (hw - 0.05), (top + bottom) / 2, z], [0, rnd() * 3, 0], 9)
      if (tall) parts.cyl('beam', 0.18, 0.18, 0.08, [sx * (hw - 0.05), top, z], [0, 0, 0], 9)
    }
    // cross brace under the deck
    if (i < n) {
      parts.box('beam', [width - 0.1, 0.16, 0.16], [0, deckY - 0.55, z])
    }
  }
  // stringers
  for (const sx of [-1, 1]) parts.box('beam', [0.22, 0.26, length], [sx * (hw - 0.3), deckY - 0.21, length / 2])
  parts.box('beam', [0.22, 0.26, length], [0, deckY - 0.21, length / 2])
  // deck planks
  let z = 0.1
  while (z < length) {
    const pw = 0.28 + rnd() * 0.06
    const lenJ = width + (rnd() - 0.5) * 0.18
    parts.box(
      'deck',
      [lenJ, 0.08, pw],
      [(rnd() - 0.5) * 0.08, deckY - 0.04 + (rnd() - 0.5) * 0.025, z + pw / 2],
      [(rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.02],
      0.4,
      false,
      [rnd(), 1 - (Math.floor(rnd() * 7) + 0.5) / 7],
    )
    z += pw + 0.045
  }
  // ladder at the end
  for (const sx of [-0.3, 0.3]) parts.box('beam', [0.07, 2.2, 0.07], [sx, deckY - 1.0, length + 0.05])
  for (let r = 0; r < 5; r++) parts.box('trim', [0.6, 0.05, 0.06], [0, deckY - 0.3 - r * 0.38, length + 0.05])
  // rope coils and cargo
  parts.add('rope', new THREE.TorusGeometry(0.28, 0.07, 6, 14), mat([hw - 0.55, deckY + 0.07, length - 1.2], [Math.PI / 2, 0, 0]))
  parts.add('rope', new THREE.TorusGeometry(0.2, 0.06, 6, 14), mat([hw - 0.55, deckY + 0.18, length - 1.2], [Math.PI / 2, 0, 0]))
  barrel(parts, [-hw + 0.5, deckY, 2.2], 0.9)
  barrel(parts, [-hw + 0.55, deckY, 3.0], 0.85, false, 1)
  crate(parts, [hw - 0.6, deckY, 4.2], 0.7, 0.3)
  // lantern post
  parts.cyl('beam', 0.06, 0.07, 2.3, [-hw + 0.25, deckY + 1.15, length - 0.4])
  parts.box('beam', [0.5, 0.06, 0.06], [-hw + 0.45, deckY + 2.25, length - 0.4])
  parts.cyl('iron', 0.1, 0.13, 0.32, [-hw + 0.65, deckY + 2.0, length - 0.4], [0, 0, 0], 6)
  parts.add('lamp', new THREE.SphereGeometry(0.09, 8, 6), mat([-hw + 0.65, deckY + 1.98, length - 0.4]))
  return finalizeModel(parts, [], [0, 0, 0])
}

export function buildMarket(): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(5)
  const w = 3.4
  const d = 2.4
  // posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.box('beam', [0.16, 2.5, 0.16], [(sx * (w - 0.2)) / 2, 1.25, (sz * (d - 0.2)) / 2])
  }
  // thatched gable roof, ridge along x
  parts.with(mat([0, 0, 0], [0, Math.PI / 2, 0]), () => {
    gableRoof(parts, 'thatch', 'beam', d, w, 1.0, 2.45, 0.45, 0.3, 0.16)
  })
  // fringe of straw along the eaves
  for (const sz of [-1, 1]) {
    const g = new THREE.PlaneGeometry(w + 0.6, 0.35, 16, 1)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) pos.setY(i, -0.175 - Math.abs(Math.sin(i * 1.7)) * 0.15)
    }
    parts.add('thatch', g, mat([0, 1.98, sz * (d / 2 + 0.45)], [sz * 0.25, 0, 0]))
  }
  // counter
  parts.box('trim', [w - 0.1, 0.1, 0.95], [0, 0.95, d / 2 - 0.55])
  parts.box('deck', [w - 0.2, 0.9, 0.08], [0, 0.45, d / 2 - 0.1])
  // goods on the counter
  const goods = (color: string, p: Vec3, s: Vec3) => {
    const g = paint(new THREE.IcosahedronGeometry(0.12, 1), color)
    parts.add('goods', g, mat(p, [rnd(), rnd(), rnd()], s))
  }
  // basket of fish
  parts.cyl('trim', 0.34, 0.26, 0.2, [-1.05, 1.1, d / 2 - 0.55], [0, 0, 0], 12)
  for (let i = 0; i < 6; i++) goods('#9fb3bd', [-1.05 + (rnd() - 0.5) * 0.4, 1.23, d / 2 - 0.55 + (rnd() - 0.5) * 0.35], [1.8, 0.5, 0.7])
  // basket of apples
  parts.cyl('trim', 0.3, 0.24, 0.18, [0, 1.09, d / 2 - 0.5], [0, 0, 0], 12)
  for (let i = 0; i < 9; i++) goods(rnd() < 0.7 ? '#c0392b' : '#8fae3b', [(rnd() - 0.5) * 0.4, 1.21 + rnd() * 0.05, d / 2 - 0.5 + (rnd() - 0.5) * 0.35], [0.75, 0.75, 0.75])
  // bread / cabbages
  for (let i = 0; i < 4; i++) goods('#c99a5b', [0.9 + (rnd() - 0.5) * 0.5, 1.07, d / 2 - 0.6 + (rnd() - 0.5) * 0.3], [1.5, 0.6, 0.9])
  for (let i = 0; i < 3; i++) goods('#7fa650', [1.3 + (rnd() - 0.5) * 0.3, 1.1, d / 2 - 0.45 + (rnd() - 0.5) * 0.3], [1.3, 1.1, 1.3])
  // barrels & crates around
  barrel(parts, [-w / 2 - 0.5, 0, 0.3], 1)
  barrel(parts, [-w / 2 - 0.35, 0, -0.55], 0.9, false, 0.7)
  crate(parts, [w / 2 + 0.45, 0, 0.2], 0.75, 0.25)
  crate(parts, [w / 2 + 0.45, 0.75, 0.2], 0.55, -0.2)
  crate(parts, [0.4, 0, -d / 2 + 0.35], 0.65, 0.1)
  // sacks
  for (let i = 0; i < 3; i++) {
    const g = new THREE.SphereGeometry(0.3, 10, 8)
    parts.add('cloth', g, mat([-0.8 + i * 0.45, 0.24, -d / 2 + 0.45], [0, rnd(), 0], [1, 0.8, 0.85]))
  }
  return finalizeModel(parts, [], [0, 0, d / 2 + 1.1])
}

export function buildWell(): BuiltModel {
  const parts = new Parts()
  const ring = new THREE.CylinderGeometry(0.95, 1.0, 0.95, 18, 1, true)
  parts.add('roughStone', planarUV(ring, 0.5), mat([0, 0.47, 0]))
  parts.add('roughStone', flipGeometry(planarUV(new THREE.CylinderGeometry(0.72, 0.72, 0.95, 18, 1, true), 0.5)), mat([0, 0.47, 0]))
  parts.add('roughStone', new THREE.RingGeometry(0.72, 1.0, 18), mat([0, 0.95, 0], [-Math.PI / 2, 0, 0]))
  parts.add('dark', new THREE.CircleGeometry(0.72, 18), mat([0, 0.35, 0], [-Math.PI / 2, 0, 0]))
  for (const sx of [-1, 1]) parts.box('beam', [0.14, 2.0, 0.14], [sx * 0.85, 1.0, 0])
  parts.cyl('beam', 0.07, 0.07, 1.9, [0, 1.65, 0], [0, 0, Math.PI / 2], 8)
  parts.box('beam', [0.3, 0.05, 0.05], [1.05, 1.65, 0.12])
  parts.with(mat([0, 0, 0], [0, Math.PI / 2, 0]), () => {
    gableRoof(parts, 'roof', 'trim', 1.4, 2.0, 0.6, 2.0, 0.25, 0.2, 0.12)
  })
  parts.cyl('rope', 0.012, 0.012, 0.8, [0, 1.25, 0])
  parts.cyl('door', 0.16, 0.13, 0.26, [0, 0.8, 0], [0, 0, 0], 10)
  return finalizeModel(parts, [], [0, 0, 1.6])
}

export function buildCrateStack(seed: number): BuiltModel {
  const parts = new Parts()
  const rnd = mulberry32(seed)
  crate(parts, [0, 0, 0], 0.75, rnd())
  crate(parts, [0.85, 0, 0.1], 0.7, rnd())
  crate(parts, [0.4, 0.72, 0.05], 0.6, rnd())
  barrel(parts, [-0.8, 0, 0.3], 0.95, false, rnd())
  barrel(parts, [-0.3, 0.35, 1.0], 0.9, true, 0.3)
  return finalizeModel(parts, [], [0, 0, 1.5])
}
