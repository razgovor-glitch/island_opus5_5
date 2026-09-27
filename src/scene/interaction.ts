import type { ThreeEvent } from '@react-three/fiber'
import { cameraControl } from './CameraRig'
import { HoverInfo, useGame } from '../game/store'

/** True when a click should be ignored (the pointer was dragging the camera, or we're placing a building). */
export function ignoreClick(e: ThreeEvent<MouseEvent>): boolean {
  if (e.delta > 6 || cameraControl.dragging) return true
  const s = useGame.getState()
  return s.buildMode !== null || s.phase !== 'playing'
}

export function hover(h: HoverInfo | null) {
  const s = useGame.getState()
  if (s.buildMode || s.phase !== 'playing') {
    if (s.hover) s.setHover(null)
    return
  }
  s.setHover(h)
  document.body.style.cursor = h ? (h.enabled ? 'pointer' : 'not-allowed') : ''
}
