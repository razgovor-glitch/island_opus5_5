// Build mode: ghost preview that follows the cursor over the terrain, validation and placement.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { BUILDINGS } from '../game/config'
import { buildingModel } from '../models/buildings'
import { getHeight } from '../game/terrain'
import { allObstaclesContain, deposits, placed, trees } from '../game/world'
import { obstacleContains, Obstacle } from '../game/nav'
import { footprintObstacle, nextVariant, placeBuilding } from '../game/sim'
import { ModelMesh } from './ModelMesh'
import { cameraControl } from './CameraRig'
import { sfx } from '../game/audio'

const okMat = new THREE.MeshStandardMaterial({ color: '#7fdc8a', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#2f7a3a', emissiveIntensity: 0.4 })
const badMat = new THREE.MeshStandardMaterial({ color: '#f07a6a', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#7a2f2f', emissiveIntensity: 0.4 })

export interface PlacementCheck {
  ok: boolean
  reason: string
}

function obstacleCorners(o: Obstacle): [number, number][] {
  const c = Math.cos(o.rot ?? 0)
  const s = Math.sin(o.rot ?? 0)
  const pts: [number, number][] = []
  const hx = o.hx ?? 0
  const hz = o.hz ?? 0
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [0, 0],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const lx = a * hx
    const lz = b * hz
    pts.push([o.x + lx * c + lz * s, o.z - lx * s + lz * c])
  }
  return pts
}

export function checkPlacement(type: keyof typeof BUILDINGS, x: number, z: number, rot: number): PlacementCheck {
  const def = BUILDINGS[type]
  if (def.unique && placed.some((b) => b.type === type)) return { ok: false, reason: 'Only one can be built' }
  const o = footprintObstacle(type, x, z, rot, nextVariant(type), 0.2)
  const pts = obstacleCorners(o)
  let lo = Infinity
  let hi = -Infinity
  for (const [px, pz] of pts) {
    const h = getHeight(px, pz)
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  if (lo < 0.55) return { ok: false, reason: 'Too close to the water' }
  if (hi - lo > 2.2) return { ok: false, reason: 'Ground is too steep' }
  for (const [px, pz] of pts) if (allObstaclesContain(px, pz, 0.3)) return { ok: false, reason: 'Blocked by a building' }
  // does any existing obstacle poke into the footprint?
  for (const b of placed) for (const [px, pz] of obstacleCorners(b.obstacle)) if (obstacleContains(o, px, pz)) return { ok: false, reason: 'Blocked by a building' }
  for (const t of trees) if (t.state !== 'stump' && obstacleContains(o, t.x, t.z, 0.4)) return { ok: false, reason: 'A tree is in the way — chop it first' }
  for (const d of deposits) if (obstacleContains(o, d.x, d.z, d.size * 1.6)) return { ok: false, reason: 'Rocks are in the way' }
  if (def.nearWater) {
    let near = false
    for (let a = 0; a < 16 && !near; a++) {
      const ang = (a / 16) * Math.PI * 2
      for (let r = 2; r <= def.nearWater + Math.max(o.hx ?? 0, o.hz ?? 0); r += 1.5) {
        if (getHeight(x + Math.cos(ang) * r, z + Math.sin(ang) * r) < -0.2) {
          near = true
          break
        }
      }
    }
    if (!near) return { ok: false, reason: 'Must be built near the shore' }
  }
  if (!useGame.getState().canAfford(def.cost)) return { ok: false, reason: 'Not enough resources' }
  return { ok: true, reason: '' }
}

const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()

/** Intersect the pointer ray with the terrain heightfield (ray-marching). */
export function pickGround(camera: THREE.Camera, clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 | null {
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const o = ray.ray.origin
  const d = ray.ray.direction
  let prev = 0
  const step = 0.5
  for (let t = 0; t < 600; t += step) {
    const x = o.x + d.x * t
    const y = o.y + d.y * t
    const z = o.z + d.z * t
    const h = Math.max(getHeight(x, z), 0)
    if (y <= h) {
      // refine
      let a = prev
      let b = t
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2
        const mx = o.x + d.x * m
        const my = o.y + d.y * m
        const mz = o.z + d.z * m
        if (my <= Math.max(getHeight(mx, mz), 0)) b = m
        else a = m
      }
      return new THREE.Vector3(o.x + d.x * b, 0, o.z + d.z * b)
    }
    prev = t
  }
  return null
}

export const placementState = { check: { ok: false, reason: '' } as PlacementCheck, x: 0, z: 0, visible: false }

export function BuildGhost() {
  const buildMode = useGame((s) => s.buildMode)
  const rotation = useGame((s) => s.buildRotation)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const group = useRef<THREE.Group>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [ok, setOk] = useState(true)
  const model = useMemo(() => (buildMode ? buildingModel(buildMode, nextVariant(buildMode)) : null), [buildMode])

  useEffect(() => {
    if (!buildMode) return
    const el = gl.domElement
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
    }
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || cameraControl.dragDistance > 6) return
      const s = useGame.getState()
      if (!s.buildMode) return
      const c = placementState.check
      if (!placementState.visible) return
      if (!c.ok) {
        s.toast(c.reason, 'warn')
        sfx.error()
        return
      }
      if (placeBuilding(s.buildMode, placementState.x, placementState.z, s.buildRotation)) {
        // keep building cottages with shift held
        if (!e.shiftKey) s.setBuildMode(null)
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') useGame.getState().rotateBuild()
      if (e.key === 'Escape') useGame.getState().setBuildMode(null)
    }
    const cancel = (e: MouseEvent) => {
      if (e.button === 2 && cameraControl.dragDistance < 6) useGame.getState().setBuildMode(null)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('click', click)
    el.addEventListener('mouseup', cancel)
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('click', click)
      el.removeEventListener('mouseup', cancel)
      window.removeEventListener('keydown', key)
      placementState.visible = false
    }
  }, [buildMode, gl])

  useFrame(() => {
    const g = group.current
    if (!g || !buildMode || !pointer.current) {
      if (g) g.visible = false
      placementState.visible = false
      return
    }
    const hit = pickGround(camera, pointer.current.x, pointer.current.y, gl.domElement.getBoundingClientRect())
    if (!hit) {
      g.visible = false
      placementState.visible = false
      return
    }
    const x = Math.round(hit.x * 2) / 2
    const z = Math.round(hit.z * 2) / 2
    placementState.x = x
    placementState.z = z
    placementState.visible = true
    placementState.check = checkPlacement(buildMode, x, z, rotation)
    g.visible = true
    g.position.set(x, getHeight(x, z), z)
    g.rotation.y = rotation
    if (placementState.check.ok !== ok) setOk(placementState.check.ok)
  })

  if (!model) return null
  return (
    <group ref={group} visible={false}>
      <ModelMesh geos={model.geos} override={ok ? okMat : badMat} castShadow={false} />
      <mesh rotation-x={-Math.PI / 2} position={[(model.bounds.min.x + model.bounds.max.x) / 2, 0.15, (model.bounds.min.z + model.bounds.max.z) / 2]}>
        <planeGeometry args={[model.bounds.max.x - model.bounds.min.x + 0.6, model.bounds.max.z - model.bounds.min.z + 0.6]} />
        <meshBasicMaterial color={ok ? '#9dff9d' : '#ff8f7f'} transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}
