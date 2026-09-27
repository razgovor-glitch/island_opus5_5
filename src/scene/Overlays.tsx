import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { getHeight } from '../game/terrain'
import { ResIcon } from '../ui/icons'

/** Pulsing ring under whatever the pointer is hovering. */
export function HoverRing() {
  const hover = useGame((s) => s.hover)
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.8, depthWrite: false }), [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    m.visible = !!hover
    if (!hover) return
    const y = Math.max(getHeight(hover.x, hover.z), 0) + 0.12
    m.position.set(hover.x, y, hover.z)
    const s = hover.radius * (1 + Math.sin(clock.elapsedTime * 5) * 0.05)
    m.scale.set(s, s, s)
    mat.color.set(hover.enabled ? '#fff3c4' : '#ff9d8a')
    mat.opacity = 0.55 + Math.sin(clock.elapsedTime * 5) * 0.2
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} material={mat} renderOrder={4} visible={false}>
      <ringGeometry args={[0.86, 1, 48]} />
    </mesh>
  )
}

export function FloatingLabels() {
  const labels = useGame((s) => s.labels)
  return (
    <>
      {labels.map((l) => (
        <Html key={l.id} position={[l.x, l.y, l.z]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`float-label float-${l.kind}`}>
            {l.kind !== 'info' && <ResIcon res={l.kind} size={18} />}
            <span>{l.text}</span>
          </div>
        </Html>
      ))}
    </>
  )
}
