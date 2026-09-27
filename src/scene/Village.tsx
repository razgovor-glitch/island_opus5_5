import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CHURCH, FENCES, HOUSES, MARKET, PIER, WELL } from '../game/layout'
import { getHeight } from '../game/terrain'
import { buildHouse } from '../models/house'
import { buildChurch } from '../models/church'
import { buildCrateStack, buildMarket, buildPier, buildWell } from '../models/props'
import { fencePart } from '../models/parts'
import { Parts, mat } from '../three/geom'
import { ModelMesh } from './ModelMesh'
import { timed } from '../game/perf'

type Geos = Map<string, THREE.BufferGeometry>

/** Bake many placed models into one geometry per material (a handful of draw calls for the whole village). */
function bake(items: { geos: Geos; x: number; y: number; z: number; rot: number }[]): Geos {
  const groups = new Map<string, THREE.BufferGeometry[]>()
  for (const it of items) {
    const m = mat([it.x, it.y, it.z], [0, it.rot, 0])
    for (const [key, geo] of it.geos) {
      const g = geo.clone()
      g.applyMatrix4(m)
      let list = groups.get(key)
      if (!list) groups.set(key, (list = []))
      list.push(g)
    }
  }
  const out: Geos = new Map()
  for (const [key, list] of groups) {
    const needColor = list.some((g) => g.attributes.color)
    if (needColor) {
      for (const g of list) {
        if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3))
      }
    }
    const merged = mergeGeometries(list, false)
    if (merged) {
      merged.computeBoundingSphere()
      out.set(key, merged)
    }
    list.forEach((g) => g.dispose())
  }
  return out
}

export function Village() {
  const geos = useMemo(() => timed('village bake', () => {
    const items: { geos: Geos; x: number; y: number; z: number; rot: number }[] = []
    HOUSES.forEach((h) => items.push({ geos: buildHouse(h.style).geos, x: h.x, y: getHeight(h.x, h.z), z: h.z, rot: h.rot }))
    items.push({ geos: buildChurch().geos, x: CHURCH.x, y: getHeight(CHURCH.x, CHURCH.z), z: CHURCH.z, rot: CHURCH.rot })
    items.push({ geos: buildMarket().geos, x: MARKET.x, y: getHeight(MARKET.x, MARKET.z), z: MARKET.z, rot: MARKET.rot })
    items.push({ geos: buildWell().geos, x: WELL.x, y: getHeight(WELL.x, WELL.z), z: WELL.z, rot: 0.4 })
    items.push({ geos: buildPier(PIER.length, PIER.width).geos, x: PIER.x, y: 0, z: PIER.z, rot: PIER.rot })
    items.push({ geos: buildCrateStack(3).geos, x: 10.2, y: getHeight(10.2, 17.2), z: 17.2, rot: 0.5 })
    items.push({ geos: buildCrateStack(8).geos, x: -2.5, y: getHeight(-2.5, -8.8), z: -8.8, rot: -0.4 })
    const p = new Parts()
    for (const f of FENCES) fencePart(p, f, getHeight)
    items.push({ geos: p.merge(), x: 0, y: 0, z: 0, rot: 0 })
    return bake(items)
  }), [])
  return <ModelMesh geos={geos} />
}
