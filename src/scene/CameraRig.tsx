import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getHeight } from '../game/terrain'
import { clamp } from '../game/noise'
import { onGameStart, useGame } from '../game/store'
import { cameraBlockers, placed } from '../game/world'
import { buildingModel } from '../models/buildings'
import { obstacleContains } from '../game/nav'

export const DEFAULT_VIEW = { x: 1, y: 3, z: -5, yaw: 0.0, pitch: 0.3, dist: 95 }

const desired = { target: new THREE.Vector3(DEFAULT_VIEW.x, DEFAULT_VIEW.y, DEFAULT_VIEW.z), yaw: DEFAULT_VIEW.yaw, pitch: DEFAULT_VIEW.pitch, dist: DEFAULT_VIEW.dist }
const current = { target: desired.target.clone(), yaw: desired.yaw - 0.9, pitch: 0.5, dist: 105 }
const keys = new Set<string>()
let liftY = 0
/** Where the camera is currently looking (smoothed). */
export const cameraFocus = current.target

export const cameraControl = {
  focus(x: number, z: number, dist?: number) {
    desired.target.set(x, Math.max(1, getHeight(x, z)), z)
    if (dist) desired.dist = dist
  },
  reset() {
    desired.target.set(DEFAULT_VIEW.x, DEFAULT_VIEW.y, DEFAULT_VIEW.z)
    // turn the short way round to the default heading
    const d = DEFAULT_VIEW.yaw - current.yaw
    desired.yaw = current.yaw + Math.atan2(Math.sin(d), Math.cos(d))
    desired.pitch = DEFAULT_VIEW.pitch
    desired.dist = DEFAULT_VIEW.dist
  },
  /** Debug / scripted camera moves. */
  set(v: Partial<{ x: number; z: number; yaw: number; pitch: number; dist: number }>) {
    if (v.x !== undefined) desired.target.x = v.x
    if (v.z !== undefined) desired.target.z = v.z
    if (v.yaw !== undefined) desired.yaw = v.yaw
    if (v.pitch !== undefined) desired.pitch = v.pitch
    if (v.dist !== undefined) desired.dist = v.dist
  },
  /** True while the user is dragging the view (used to suppress clicks). */
  dragging: false,
  dragDistance: 0,
}

onGameStart(() => cameraControl.reset())

/** Lowest height the camera may have at (x, z): above the ground and above any building roof. */
function minCameraHeight(x: number, z: number): number {
  let h = getHeight(x, z) + 3
  for (const b of cameraBlockers) if (obstacleContains(b.o, x, z, 1.5)) h = Math.max(h, b.y1 + 1.5)
  for (const p of placed) {
    if (!obstacleContains(p.obstacle, x, z, 1.8)) continue
    h = Math.max(h, p.y + buildingModel(p.type, p.variant).bounds.max.y + 1.5)
  }
  return h
}

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const el = gl.domElement
    let mode: 'none' | 'pan' | 'rotate' = 'none'
    let lastX = 0
    let lastY = 0
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        mode = 'rotate'
      } else {
        mode = e.button === 2 || e.button === 1 || (e.button === 0 && (e.shiftKey || e.altKey)) ? 'rotate' : 'pan'
      }
      lastX = e.clientX
      lastY = e.clientY
      cameraControl.dragDistance = 0
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (mode === 'none') return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      cameraControl.dragDistance += Math.abs(dx) + Math.abs(dy)
      if (cameraControl.dragDistance > 6) cameraControl.dragging = true
      if (useGame.getState().phase === 'title') return
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0) desired.dist = clamp(desired.dist * (pinchDist / d), 16, 170)
        pinchDist = d
        desired.yaw -= dx * 0.003
        return
      }
      if (mode === 'rotate') {
        desired.yaw -= dx * 0.005
        desired.pitch = clamp(desired.pitch + dy * 0.004, 0.14, 1.35)
      } else if (mode === 'pan') {
        const s = desired.dist * 0.0017
        const y = desired.yaw
        const rx = Math.cos(y)
        const rz = -Math.sin(y)
        const fx = -Math.sin(y)
        const fz = -Math.cos(y)
        desired.target.x += -rx * dx * s + fx * dy * s
        desired.target.z += -rz * dx * s + fz * dy * s
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size === 0) {
        mode = 'none'
        // let click handlers see the drag state first
        setTimeout(() => (cameraControl.dragging = false), 0)
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (useGame.getState().phase === 'title') return
      desired.dist = clamp(desired.dist * (1 + clamp(e.deltaY, -120, 120) * 0.0012), 16, 170)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.type === 'keydown') keys.add(e.key.toLowerCase())
      else keys.delete(e.key.toLowerCase())
    }
    const onBlur = () => keys.clear()
    const noMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', noMenu)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const phase = useGame.getState().phase
    if (phase === 'title') {
      desired.yaw += dt * 0.04
      desired.pitch = 0.42
      desired.dist = 92
      desired.target.set(0, 3, -6)
    } else {
      const sp = desired.dist * 0.9 * dt
      const y = desired.yaw
      let mx = 0
      let mz = 0
      if (keys.has('w') || keys.has('arrowup')) mz -= 1
      if (keys.has('s') || keys.has('arrowdown')) mz += 1
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1
      if (keys.has('d') || keys.has('arrowright')) mx += 1
      if (mx || mz) {
        desired.target.x += (Math.cos(y) * mx + Math.sin(y) * mz) * sp
        desired.target.z += (-Math.sin(y) * mx + Math.cos(y) * mz) * sp
      }
      if (keys.has('q')) desired.yaw += dt * 1.4
      if (keys.has('e')) desired.yaw -= dt * 1.4
      if (keys.has('=') || keys.has('+')) desired.dist = clamp(desired.dist * (1 - dt), 16, 170)
      if (keys.has('-')) desired.dist = clamp(desired.dist * (1 + dt), 16, 170)
    }
    // keep the focus over the archipelago
    const r = Math.hypot(desired.target.x - 1, desired.target.z + 4)
    if (r > 70) {
      desired.target.x = 1 + ((desired.target.x - 1) / r) * 70
      desired.target.z = -4 + ((desired.target.z + 4) / r) * 70
    }
    desired.target.y = THREE.MathUtils.lerp(desired.target.y, Math.max(1.5, getHeight(desired.target.x, desired.target.z) * 0.5 + 1.5), 1 - Math.exp(-dt * 2))

    // on narrow (portrait) screens pull back so the island still fits horizontally
    const aspect = size.width / Math.max(1, size.height)
    const fit = aspect < 1.25 ? Math.min(2.2, 1.25 / aspect) : 1
    const k = 1 - Math.exp(-dt * (phase === 'title' ? 1.2 : 7))
    current.target.lerp(desired.target, k)
    current.yaw += (desired.yaw - current.yaw) * k
    current.pitch += (desired.pitch - current.pitch) * k
    current.dist += (desired.dist * fit - current.dist) * k
    const cp = Math.cos(current.pitch)
    camera.position.set(
      current.target.x + Math.sin(current.yaw) * cp * current.dist,
      current.target.y + Math.sin(current.pitch) * current.dist,
      current.target.z + Math.cos(current.yaw) * cp * current.dist,
    )
    // never end up inside the ground or a building: lift the camera over it instead
    const minY = minCameraHeight(camera.position.x, camera.position.z)
    liftY += ((camera.position.y < minY ? minY - camera.position.y : 0) - liftY) * (1 - Math.exp(-dt * 10))
    camera.position.y += liftY
    camera.position.y = Math.max(camera.position.y, getHeight(camera.position.x, camera.position.z) + 2)
    camera.lookAt(current.target)
  })
  return null
}
