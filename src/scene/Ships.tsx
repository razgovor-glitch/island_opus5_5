import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ANCHORED_SHIPS } from '../game/layout'
import { buildShip, ShipModel } from '../models/ship'
import { ModelMesh } from './ModelMesh'
import { getMaterials } from '../three/materials'
import { waveHeight, waterUniforms } from './Water'
import { merchantShip } from '../game/sim'
import { useGame } from '../game/store'
import { hover, ignoreClick } from './interaction'
import { sfx } from '../game/audio'

const ropeMat = new THREE.LineBasicMaterial({ color: '#3b2a1c', transparent: true, opacity: 0.85 })

function Flag({ pos, color = '#b8483a', w = 1.6, h = 0.8 }: { pos: [number, number, number]; color?: string; w?: number; h?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, 12, 2)
    g.translate(w / 2, -h / 2, 0)
    return g
  }, [w, h])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }), [color])
  const phase = useRef(Math.random() * 10)
  useFrame((_, dt) => {
    phase.current += dt
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3]
      const k = x / w
      p.setZ(i, Math.sin(x * 3.2 - phase.current * 7) * 0.16 * k + Math.sin(x * 5 - phase.current * 11) * 0.05 * k)
      p.setY(i, base[i * 3 + 1] - k * k * 0.12)
    }
    p.needsUpdate = true
    geo.computeVertexNormals()
  })
  return (
    <group position={pos}>
      <mesh geometry={geo} material={mat} castShadow rotation-y={Math.PI * 0.85} />
      <mesh material={getMaterials().beam} position={[0, -0.5, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />
      </mesh>
    </group>
  )
}

function ShipBody({ model, flagColor }: { model: ShipModel; flagColor?: string }) {
  const mats = getMaterials()
  return (
    <>
      <ModelMesh geos={model.geos} />
      <lineSegments geometry={model.rigging} material={ropeMat} />
      {model.sails && <mesh geometry={model.sails} material={mats.sail} castShadow receiveShadow />}
      <Flag pos={[model.flagPos[0], model.flagPos[1] + 0.9, 0]} color={flagColor} />
    </>
  )
}

function bob(g: THREE.Group, x: number, z: number, seed: number, t: number) {
  g.position.y = waveHeight(x, z, t) - 0.05
  g.rotation.x = Math.sin(t * 0.8 + seed) * 0.025
  g.rotation.z = Math.sin(t * 0.63 + seed * 2) * 0.018
}

function AnchoredShip({ x, z, rot, scale, seed }: { x: number; z: number; rot: number; scale: number; seed: number }) {
  const model = useMemo(() => buildShip({ seed }), [seed])
  const inner = useRef<THREE.Group>(null)
  useFrame(() => {
    if (inner.current) bob(inner.current, x, z, seed, waterUniforms.uTime.value)
  })
  return (
    <group position={[x, 0, z]} rotation-y={rot} scale={scale}>
      <group ref={inner}>
        <ShipBody model={model} flagColor={seed % 2 ? '#b8483a' : '#c2553f'} />
      </group>
    </group>
  )
}

function MerchantShip() {
  const model = useMemo(() => buildShip({ seed: 9, sails: true }), [])
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = outer.current
    if (!g) return
    g.visible = merchantShip.visible
    g.position.set(merchantShip.x, 0, merchantShip.z)
    g.rotation.y = merchantShip.rot
    if (inner.current) bob(inner.current, merchantShip.x, merchantShip.z, 3, waterUniforms.uTime.value)
  })
  return (
    <group
      ref={outer}
      visible={false}
      scale={0.78}
      onPointerMove={(e) => {
        e.stopPropagation()
        const m = useGame.getState().merchant
        hover({
          kind: 'merchant',
          title: 'Merchant ship',
          action: m.status === 'docked' ? 'Click to trade' : m.status === 'arriving' ? 'Arriving soon…' : 'Setting sail',
          x: merchantShip.x,
          y: 0,
          z: merchantShip.z,
          radius: 6,
          enabled: m.status === 'docked',
        })
      }}
      onPointerOut={() => hover(null)}
      onClick={(e) => {
        if (ignoreClick(e)) return
        e.stopPropagation()
        if (useGame.getState().merchant.status === 'docked') {
          sfx.click()
          useGame.getState().setTradeOpen(true)
        }
      }}
    >
      <group ref={inner}>
        <ShipBody model={model} flagColor="#2f5f9a" />
      </group>
    </group>
  )
}

/** A small sailing boat that cruises around the archipelago for ambience. */
function Cruiser() {
  const model = useMemo(() => buildShip({ seed: 21, sails: true }), [])
  const g = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  useFrame(() => {
    const t = waterUniforms.uTime.value * 0.011 + 1.2
    const x = Math.cos(t) * 108
    const z = Math.sin(t) * 100 + 10
    const dx = -Math.sin(t) * 108
    const dz = Math.cos(t) * 100
    if (g.current) {
      g.current.position.set(x, 0, z)
      g.current.rotation.y = Math.atan2(-dz, dx)
    }
    if (inner.current) bob(inner.current, x, z, 7, waterUniforms.uTime.value)
  })
  return (
    <group ref={g} scale={0.8}>
      <group ref={inner}>
        <ShipBody model={model} flagColor="#d9a441" />
      </group>
    </group>
  )
}

export function Ships() {
  return (
    <>
      {ANCHORED_SHIPS.map((s, i) => (
        <AnchoredShip key={i} {...s} seed={i + 1} />
      ))}
      <MerchantShip />
      <Cruiser />
    </>
  )
}
