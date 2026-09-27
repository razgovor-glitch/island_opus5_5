// Stone chapel with a square bell tower and a tall shingled spire.

import * as THREE from 'three'
import { Parts, mat, mul, planarUV } from '../three/geom'
import { archGeometry, doorPart, gableBody, gableRoof } from './parts'
import { BuiltModel, finalizeModel } from './house'

let cached: BuiltModel | null = null

export const CHURCH_DIMS = { w: 7, d: 12, towerW: 4.1, towerH: 12.5, spireH: 9.5, zOffset: 1.7 }

export function buildChurch(): BuiltModel {
  if (cached) return cached
  const parts = new Parts()
  const { w, d, towerW: tw, towerH: th, spireH: sh, zOffset } = CHURCH_DIMS
  const y0 = 0.4
  const h = 5.4
  const roofH = 3.8
  const hw = w / 2
  const hd = d / 2
  const tz = -hd - tw / 2 + 0.6

  parts.with(mat([0, 0, zOffset]), () => {
    // nave
    parts.box('roughStone', [w + 0.5, 1.8 + y0, d + 0.5], [0, (y0 - 1.8) / 2, 0])
    parts.add('stone', gableBody(w, d, h, roofH, y0))
    parts.box('stone', [w + 0.3, 0.25, d + 0.3], [0, y0 + 0.9, 0])
    gableRoof(parts, 'roofCream', 'beam', w, d, roofH, y0 + h, 0.45, 0.35, 0.24)

    // buttresses between the windows
    for (const sx of [-1, 1]) {
      for (const z of [-3, 0, 3]) {
        parts.box('stone', [0.62, 3.5, 0.85], [sx * (hw + 0.3), y0 + 1.75, z])
        parts.box('stone', [0.5, 1.1, 0.75], [sx * (hw + 0.14), y0 + 3.75, z], [0, 0, sx * 0.55])
      }
      // lancet windows
      for (const z of [-4.5, -1.5, 1.5, 4.5]) {
        if (sx === -1 && z === 4.5) continue // side door goes here
        const m = mat([sx * (hw + 0.01), y0 + 1.5, z], [0, (sx * Math.PI) / 2, 0])
        parts.add('stone', archGeometry(1.3, 3.0, 0.12, true), mul(m, mat([0, -0.1, -0.06])))
        parts.add('glass', archGeometry(0.95, 2.65, 0.12, true), mul(m, mat([0, 0.07, -0.03])))
        parts.with(m, () => parts.box('stone', [0.08, 2.3, 0.06], [0, 1.25, 0.1]))
      }
    }
    // rose window on the east gable
    parts.add('stone', new THREE.CylinderGeometry(1.05, 1.05, 0.2, 24), mat([0, y0 + h + 1.2, hd + 0.04], [Math.PI / 2, 0, 0]))
    parts.add('glass', new THREE.CylinderGeometry(0.82, 0.82, 0.24, 24), mat([0, y0 + h + 1.2, hd + 0.06], [Math.PI / 2, 0, 0]))
    for (let k = 0; k < 4; k++) {
      parts.box('stone', [1.6, 0.07, 0.08], [0, y0 + h + 1.2, hd + 0.18], [0, 0, (k * Math.PI) / 4])
    }
    // east gable windows
    for (const sx of [-1, 1]) {
      const m = mat([sx * 1.6, y0 + 1.6, hd + 0.01])
      parts.add('stone', archGeometry(1.0, 2.4, 0.12, true), mul(m, mat([0, -0.1, -0.06])))
      parts.add('glass', archGeometry(0.72, 2.1, 0.12, true), mul(m, mat([0, 0.05, -0.03])))
    }
    // side door towards the village
    doorPart(parts, mat([-hw - 0.02, y0, 4.5], [0, -Math.PI / 2, 0]), 1.25, 2.4, 'stone', 'roughStone')

    // tower
    parts.box('roughStone', [tw + 0.45, 1.8 + y0, tw + 0.45], [0, (y0 - 1.8) / 2, tz])
    parts.box('stone', [tw, th, tw], [0, y0 + th / 2, tz])
    for (const yy of [4.6, 8.7]) parts.box('stone', [tw + 0.22, 0.24, tw + 0.22], [0, y0 + yy, tz])
    parts.box('stone', [tw + 0.55, 0.36, tw + 0.55], [0, y0 + th + 0.1, tz])
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2
      const face = mul(mat([0, 0, tz], [0, a, 0]), mat([0, 0, tw / 2 + 0.01]))
      // belfry opening
      parts.add('stone', archGeometry(1.7, 2.8, 0.1, true), mul(face, mat([0, y0 + th - 3.3, -0.05])))
      parts.add('dark', archGeometry(1.25, 2.45, 0.1, true), mul(face, mat([0, y0 + th - 3.15, -0.02])))
      parts.with(face, () => {
        for (let b = 0; b < 4; b++) parts.box('beam', [1.2, 0.07, 0.16], [0, y0 + th - 2.95 + b * 0.42, 0.02], [0.5, 0, 0])
      })
      // small lancet mid-tower
      if (k !== 2) {
        parts.add('stone', archGeometry(0.75, 1.7, 0.1, true), mul(face, mat([0, y0 + 5.6, -0.05])))
        parts.add('glass', archGeometry(0.5, 1.45, 0.1, true), mul(face, mat([0, y0 + 5.7, -0.02])))
      }
      // corner quoins
      for (let q = 0; q < 12; q++) {
        const yq = y0 + 0.4 + q * 1.0
        const big = q % 2 === 0
        parts.add('stone', planarUV(new THREE.BoxGeometry(big ? 0.7 : 0.45, 0.5, 0.12), 0.5), mul(mat([0, 0, tz], [0, a, 0]), mat([tw / 2 - (big ? 0.35 : 0.22), yq, tw / 2 + 0.04])))
      }
    }
    // spire
    const spire = new THREE.ConeGeometry((tw + 0.35) / Math.SQRT2, sh, 4, 1)
    spire.rotateY(Math.PI / 4)
    parts.add('roofCream', planarUV(spire, 0.5), mat([0, y0 + th + 0.28 + sh / 2, tz]))
    // little gablets at the spire foot
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2
      parts.with(mul(mat([0, 0, tz], [0, a, 0]), mat([0, y0 + th + 0.3, tw / 2 - 0.6])), () => {
        parts.add('stone', gableBody(0.9, 1.2, 0.7, 0.55, 0))
        gableRoof(parts, 'roofCream', 'beam', 0.9, 1.2, 0.55, 0.7, 0.12, 0.1, 0.1)
        parts.box('dark', [0.4, 0.5, 0.05], [0, 0.4, 0.61])
      })
    }
    const ty = y0 + th + 0.28 + sh
    parts.add('iron', new THREE.SphereGeometry(0.16, 10, 8), mat([0, ty + 0.02, tz]))
    parts.box('iron', [0.13, 1.6, 0.13], [0, ty + 0.75, tz])
    parts.box('iron', [0.85, 0.13, 0.13], [0, ty + 1.05, tz])
    // west door in the tower
    doorPart(parts, mat([0, y0, tz - tw / 2 - 0.02], [0, Math.PI, 0]), 1.3, 2.5, 'stone', 'roughStone')
  })

  cached = finalizeModel(parts, [], [-hw - 1.5, 0, 4.5 + zOffset])
  return cached
}
