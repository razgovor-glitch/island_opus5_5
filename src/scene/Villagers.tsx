import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getVillagerGeos, V_DIMS } from '../models/villager'
import { initVillagers, updateSim, villagers } from '../game/sim'

const MAX = 90
const V_SCALE = 1.18
const _base = new THREE.Matrix4()
const _m = new THREE.Matrix4()
const _t = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)
const _zero = new THREE.Matrix4().makeScale(0, 0, 0)
const _c = new THREE.Color()
const _armL = new THREE.Matrix4()
const _armR = new THREE.Matrix4()

function local(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _v.set(x, y, z)
  return _t.compose(_v, _q, _one.set(s, s, s))
}

export function Villagers() {
  const g = useMemo(getVillagerGeos, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), [])
  const refs = {
    torso: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hat: useRef<THREE.InstancedMesh>(null),
    armL: useRef<THREE.InstancedMesh>(null),
    armR: useRef<THREE.InstancedMesh>(null),
    legL: useRef<THREE.InstancedMesh>(null),
    legR: useRef<THREE.InstancedMesh>(null),
    tool: useRef<THREE.InstancedMesh>(null),
    load: useRef<THREE.InstancedMesh>(null),
  }
  const colored = useRef(0)

  useLayoutEffect(() => {
    initVillagers()
    for (const r of Object.values(refs)) {
      const m = r.current
      if (!m) continue
      for (let i = 0; i < MAX; i++) m.setMatrixAt(i, _zero)
      m.frustumCulled = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    updateSim(dt)
    const t = state.clock.elapsedTime
    const n = Math.min(MAX, villagers.length)
    const R = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current])) as Record<keyof typeof refs, THREE.InstancedMesh | null>
    if (!R.torso) return
    // colours for newly spawned villagers
    if (colored.current !== n) {
      for (let i = colored.current; i < n; i++) {
        const v = villagers[i]
        R.torso.setColorAt(i, _c.set(v.shirt))
        R.armL!.setColorAt(i, _c.set(v.shirt))
        R.armR!.setColorAt(i, _c.set(v.shirt))
        R.legL!.setColorAt(i, _c.set(v.pants))
        R.legR!.setColorAt(i, _c.set(v.pants))
        R.head!.setColorAt(i, _c.set(v.skin))
        R.hat!.setColorAt(i, _c.set(v.hasHat ? v.hat : 0x5a3f2a))
        R.tool!.setColorAt(i, _c.set(0xffffff))
        R.load!.setColorAt(i, _c.set(0xffffff))
      }
      for (const m of Object.values(R)) if (m?.instanceColor) m.instanceColor.needsUpdate = true
      colored.current = n
    }

    for (let i = 0; i < n; i++) {
      const v = villagers[i]
      const walk = v.moving
      const p = v.walkPhase
      const swing = Math.sin(p) * 0.65 * walk
      const bob = Math.abs(Math.cos(p)) * 0.05 * walk
      const idleBreath = Math.sin(t * 2 + i) * 0.01
      _e.set(0, v.heading, 0)
      _q.setFromEuler(_e)
      _v.set(v.x, v.y + bob + idleBreath, v.z)
      _base.compose(_v, _q, _one.set(V_SCALE, V_SCALE, V_SCALE))

      let armLx = -swing * 0.9
      let armRx = swing * 0.9
      let armLz = -0.08
      let armRz = 0.08
      let torsoLean = walk * 0.06
      let showTool = false
      let showLoad = false
      if (v.state === 'work' && v.task) {
        const kind = v.task.kind
        const period = kind === 'chop' ? 0.62 : kind === 'mine' ? 0.7 : 0.4
        const ph = (v.workPhase % period) / period
        // wind up slowly, strike fast
        const k = ph < 0.65 ? ph / 0.65 : 1 - (ph - 0.65) / 0.35
        const raise = kind === 'build' ? -1.4 - k * 1.0 : -0.8 - k * 2.1
        armRx = raise
        armLx = kind === 'build' ? -0.9 : raise * 0.85
        armLz = kind === 'build' ? -0.1 : 0.25
        torsoLean = 0.1 + (1 - k) * 0.12
        showTool = true
      } else if (v.carrying) {
        armRx = -2.7
        armRz = 0.25
        showLoad = true
      }

      _m.multiplyMatrices(_base, local(0, 0, 0, torsoLean, 0, 0))
      R.torso.setMatrixAt(i, _m)
      R.head!.setMatrixAt(i, _m)
      R.hat!.setMatrixAt(i, _m)
      _m.multiplyMatrices(_base, local(-V_DIMS.hipX, V_DIMS.hipY, 0, swing, 0, 0))
      R.legL!.setMatrixAt(i, _m)
      _m.multiplyMatrices(_base, local(V_DIMS.hipX, V_DIMS.hipY, 0, -swing, 0, 0))
      R.legR!.setMatrixAt(i, _m)
      _armL.multiplyMatrices(_base, local(-V_DIMS.shoulderX, V_DIMS.shoulderY, 0, armLx, 0, armLz))
      R.armL!.setMatrixAt(i, _armL)
      _armR.multiplyMatrices(_base, local(V_DIMS.shoulderX, V_DIMS.shoulderY, 0, armRx, 0, armRz))
      R.armR!.setMatrixAt(i, _armR)
      if (showTool) {
        _m.multiplyMatrices(_armR, local(0, -0.36, 0.02, Math.PI / 2, 0, 0))
        R.tool!.setMatrixAt(i, _m)
      } else R.tool!.setMatrixAt(i, _zero)
      if (showLoad) {
        const stone = v.carrying === 'stone'
        _m.multiplyMatrices(_base, local(0.14, 1.02, 0.02, 0, stone ? 0 : 0.2, 0, stone ? 0.55 : 1))
        R.load!.setMatrixAt(i, _m)
        R.load!.setColorAt(i, _c.set(stone ? 0xb9b4ac : 0xffffff))
        if (R.load!.instanceColor) R.load!.instanceColor.needsUpdate = true
      } else R.load!.setMatrixAt(i, _zero)
    }
    for (const m of Object.values(R)) {
      if (!m) continue
      m.count = n
      m.instanceMatrix.needsUpdate = true
    }
  })

  const part = (key: keyof typeof refs, geo: THREE.BufferGeometry, cast = true) => (
    <instancedMesh key={key} ref={refs[key]} args={[geo, mat, MAX]} castShadow={cast} receiveShadow />
  )
  return (
    <group>
      {part('torso', g.torso)}
      {part('head', g.head)}
      {part('hat', g.hat)}
      {part('armL', g.arm)}
      {part('armR', g.arm)}
      {part('legL', g.leg)}
      {part('legR', g.leg)}
      {part('tool', g.tool)}
      {part('load', g.load)}
    </group>
  )
}
