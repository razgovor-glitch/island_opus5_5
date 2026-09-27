import { useLayoutEffect, useMemo, useRef } from 'react'
import { ThreeEvent, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { boulders, bushes, deposits, flowers, grass, trees, TreeState } from '../game/world'
import { bushGeometry, flowerGeometry, grassTuftGeometry, oakGeometry, pineGeometry, rockGeometry, stumpGeometry } from '../models/nature'
import { getVegetationMaterials, windUniforms } from '../three/materials'
import { requestChop, requestMine } from '../game/sim'
import { hover, ignoreClick } from './interaction'
import { TUNING } from '../game/config'
import { cameraFocus } from './CameraRig'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _c = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

function treeMatrix(t: TreeState, out: THREE.Matrix4) {
  let s = t.scale
  _q.setFromAxisAngle(UP, t.rot)
  _p.set(t.x, t.y - 0.12, t.z)
  if (t.state === 'falling') {
    const k = Math.min(1, t.t / 1.3)
    const ang = k * k * Math.PI * 0.47
    _axis.set(Math.cos(t.fallDir), 0, -Math.sin(t.fallDir))
    _q2.setFromAxisAngle(_axis, ang)
    _q.premultiply(_q2)
    if (t.t > 1.25) s *= Math.max(0, 1 - (t.t - 1.25) / 0.35)
  } else if (t.state === 'stump') {
    s = 0
  } else if (t.state === 'growing') {
    const k = Math.min(1, t.t / TUNING.treeGrowTime)
    s *= 0.12 + 0.88 * (1 - Math.pow(1 - k, 2))
  }
  _s.set(s, s, s)
  out.compose(_p, _q, _s)
}

function TreeGroup({ kind, variant }: { kind: 'pine' | 'oak'; variant: number }) {
  const list = useMemo(() => trees.filter((t) => t.kind === kind && t.variant === variant), [kind, variant])
  const geo = useMemo(() => (kind === 'pine' ? pineGeometry(10 + variant) : oakGeometry(20 + variant)), [kind, variant])
  const mats = getVegetationMaterials()
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    list.forEach((t, i) => {
      treeMatrix(t, _m)
      mesh.setMatrixAt(i, _m)
      const k = t.tint
      _c.setRGB(k * (0.96 + (t.id % 5) * 0.02), k, k * (0.95 + (t.id % 3) * 0.03))
      mesh.setColorAt(i, _c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [list])

  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    let dirty = false
    const p0 = camera.position
    const p1 = cameraFocus
    const sx = p1.x - p0.x
    const sy = p1.y - p0.y
    const sz = p1.z - p0.z
    const sl2 = sx * sx + sy * sy + sz * sz || 1
    for (let i = 0; i < list.length; i++) {
      const t = list[i] as TreeState & { _was?: string; _hidden?: boolean }
      // hide trees that sit between the camera and what it's looking at (close-up views only
      // affect the foreground part of that line, so the default overview never loses trees)
      const crown = t.kind === 'oak' ? t.scale * 0.5 : t.scale * 0.34
      const ccx = t.x
      const ccy = t.y + t.scale * (t.kind === 'oak' ? 0.62 : 0.5)
      const ccz = t.z
      const k = Math.max(0, Math.min(1, ((ccx - p0.x) * sx + (ccy - p0.y) * sy + (ccz - p0.z) * sz) / sl2))
      const qx = p0.x + sx * k - ccx
      const qy = p0.y + sy * k - ccy
      const qz = p0.z + sz * k - ccz
      const near = Math.sqrt(sl2) * k < 18
      const hidden = near && k < 0.8 && qx * qx + qy * qy * 0.5 + qz * qz < (crown + 0.6) * (crown + 0.6)
      if (hidden !== !!t._hidden || t.state !== 'grown' || t._was !== 'grown') {
        treeMatrix(t, _m)
        if (hidden) _m.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, _m)
        t._was = t.state
        t._hidden = hidden
        dirty = true
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const t = list[e.instanceId ?? -1]
    if (!t || !t.choppable) return hover(null)
    const ok = t.state === 'grown' && !t.reserved
    hover({
      kind: 'tree',
      title: t.kind === 'pine' ? 'Pine tree' : 'Oak tree',
      action: ok ? `Chop for +${TUNING.chopYield} wood` : t.reserved ? 'Villager on the way' : 'Still growing',
      x: t.x,
      y: t.y,
      z: t.z,
      radius: t.kind === 'oak' ? 1.6 : 1.2,
      enabled: ok,
    })
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (ignoreClick(e)) return
    e.stopPropagation()
    const t = list[e.instanceId ?? -1]
    if (t?.choppable) {
      requestChop(t.id)
      onMove(e as unknown as ThreeEvent<PointerEvent>)
    }
  }

  return (
    <instancedMesh
      ref={ref}
      args={[geo, kind === 'pine' ? mats.foliage : mats.leaves, list.length]}
      castShadow
      receiveShadow
      onPointerMove={onMove}
      onPointerOut={() => hover(null)}
      onClick={onClick}
    />
  )
}

function Stumps() {
  const geo = useMemo(stumpGeometry, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), [])
  const ref = useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let dirty = false
    trees.forEach((t, i) => {
      const show = t.state === 'stump' || (t.state === 'falling' && t.t > 0.2)
      const s = show ? t.scale * (t.kind === 'oak' ? 0.19 : 0.15) : 0
      const cur = (t as TreeState & { _stump?: number })._stump
      if (cur !== s) {
        _q.setFromAxisAngle(UP, t.rot)
        _p.set(t.x, t.y - 0.05, t.z)
        _s.set(s, s * 0.6, s)
        _m.compose(_p, _q, _s)
        mesh.setMatrixAt(i, _m)
        ;(t as TreeState & { _stump?: number })._stump = s
        dirty = true
      }
    })
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  })
  return <instancedMesh ref={ref} args={[geo, mat, trees.length]} castShadow receiveShadow frustumCulled={false} />
}

function DecorInstances({
  items,
  geo,
  mat,
  cast = true,
  yOffset = 0,
  scaleY = 1,
  tint,
}: {
  items: typeof bushes
  geo: THREE.BufferGeometry
  mat: THREE.Material
  cast?: boolean
  yOffset?: number
  scaleY?: number
  tint?: (i: number, c: THREE.Color) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((d, i) => {
      _q.setFromAxisAngle(UP, d.rot)
      _p.set(d.x, d.y + yOffset * d.s, d.z)
      _s.set(d.s, d.s * scaleY, d.s)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
      if (tint) {
        tint(i, _c)
        mesh.setColorAt(i, _c)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, yOffset, scaleY, tint])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={cast} receiveShadow />
}

function Deposits() {
  const mats = getVegetationMaterials()
  const ore = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d7d2c8', roughness: 0.6, metalness: 0.1 }), [])
  const groups = useRef<(THREE.Group | null)[]>([])
  // each outcrop is baked into a single mesh (plus one for the quartz)
  const baked = useMemo(() => {
    const rocks = [rockGeometry(301, 0.75), rockGeometry(302, 0.6), rockGeometry(303, 0.85), rockGeometry(304, 0.7)]
    return deposits.map((_, di) => {
      const r = (a: number) => (Math.sin(di * 12.9898 + a * 78.233) * 0.5 + 0.5) * 6
      const parts: [number, [number, number, number], [number, number, number], number][] = [
        [0, [0, 0.2, 0], [1.3, 1.25, 1.2], r(1)],
        [1, [1.1, 0.05, 0.5], [0.8, 0.9, 0.7], r(2)],
        [2, [-0.9, 0.0, 0.7], [0.7, 0.75, 0.8], r(3)],
        [3, [0.3, 0.0, -1.0], [0.75, 0.6, 0.65], r(4)],
        [1, [-0.6, -0.05, -0.8], [0.5, 0.45, 0.5], r(5)],
      ]
      const geos = parts.map(([gi, p, sc, ry]) => {
        const g = rocks[gi].clone()
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(...sc)))
        return g
      })
      const oreA = new THREE.OctahedronGeometry(0.28, 0)
      oreA.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0.35, 0.95, 0.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.3, 0.2)), new THREE.Vector3(1, 1, 1)))
      const oreB = new THREE.OctahedronGeometry(0.2, 0)
      oreB.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(-0.45, 0.55, 0.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.8, 0.5)), new THREE.Vector3(1, 1, 1)))
      return { rock: mergeGeometries(geos, false)!, ore: mergeGeometries([oreA, oreB], false)! }
    })
  }, [])
  useFrame(() => {
    deposits.forEach((d, i) => {
      const g = groups.current[i]
      if (!g) return
      const target = d.amount > 0 ? 0.6 + 0.4 * (d.amount / TUNING.depositCapacity) : 0.3
      const s = THREE.MathUtils.lerp(g.scale.x, target * d.size, 0.08)
      g.scale.setScalar(s)
    })
  })
  return (
    <>
      {deposits.map((d, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el
          }}
          position={[d.x, d.y, d.z]}
          scale={d.size}
          onPointerMove={(e) => {
            e.stopPropagation()
            hover({
              kind: 'deposit',
              title: 'Stone outcrop',
              action: d.amount > 0 ? (d.reserved ? 'Being quarried' : `Quarry for +${TUNING.mineYield} stone (${d.amount} left)`) : 'Exhausted — regrowing',
              x: d.x,
              y: d.y,
              z: d.z,
              radius: 2.4 * d.size,
              enabled: d.amount > 0 && !d.reserved,
            })
          }}
          onPointerOut={() => hover(null)}
          onClick={(e) => {
            if (ignoreClick(e)) return
            e.stopPropagation()
            requestMine(i)
            hover(null)
          }}
        >
          <mesh geometry={baked[i].rock} material={mats.rock} castShadow receiveShadow />
          <mesh geometry={baked[i].ore} material={ore} castShadow />
        </group>
      ))}
    </>
  )
}

export function Nature() {
  const mats = getVegetationMaterials()
  const bushGeos = useMemo(() => [bushGeometry(1), bushGeometry(2), bushGeometry(3)], [])
  const rockGeos = useMemo(() => [rockGeometry(11), rockGeometry(12, 0.55), rockGeometry(13, 0.8), rockGeometry(14, 0.9)], [])
  const tuft = useMemo(() => grassTuftGeometry(5), [])
  const flower = useMemo(flowerGeometry, [])
  const flowerMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), [])

  useFrame((_, dt) => {
    windUniforms.uTime.value += Math.min(dt, 0.1)
  })

  const grassTint = useMemo(
    () => (i: number, c: THREE.Color) => {
      const t = grass[i].tint ?? 1
      c.setRGB(t * 0.98, t, t * 0.9)
    },
    [],
  )
  const flowerTint = useMemo(() => (i: number, c: THREE.Color) => void c.set(flowers[i].tint ?? 0xffffff), [])

  return (
    <group>
      {(['pine', 'oak'] as const).map((k) => [0, 1, 2].map((v) => <TreeGroup key={`${k}${v}`} kind={k} variant={v} />))}
      <Stumps />
      <Deposits />
      {bushGeos.map((g, v) => (
        <DecorInstances key={`b${v}`} items={bushes.filter((b) => b.variant === v)} geo={g} mat={mats.leaves} />
      ))}
      {rockGeos.map((g, v) => (
        <DecorInstances key={`r${v}`} items={boulders.filter((b) => b.variant === v)} geo={g} mat={mats.rock} yOffset={0.05} />
      ))}
      <DecorInstances items={grass} geo={tuft} mat={mats.grass} cast={false} tint={grassTint} />
      <DecorInstances items={flowers} geo={flower} mat={flowerMat} cast={false} tint={flowerTint} />
    </group>
  )
}
