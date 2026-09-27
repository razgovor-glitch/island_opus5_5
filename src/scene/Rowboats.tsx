import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { boats, BoatState } from '../game/world'
import { buildOar, buildRowboat } from '../models/ship'
import { getVillagerGeos, V_DIMS } from '../models/villager'
import { getMaterials } from '../three/materials'
import { ModelMesh } from './ModelMesh'
import { waveHeight, waterUniforms } from './Water'
import { getHeight } from '../game/terrain'
import { launchBoat } from '../game/sim'
import { hover, ignoreClick } from './interaction'
import { TUNING } from '../game/config'

const skinMat = new THREE.MeshStandardMaterial({ color: '#eab893', roughness: 0.7, vertexColors: true })
const hatMat = new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.8 })

function Rower({ shirt }: { shirt: string }) {
  const g = getVillagerGeos()
  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85, vertexColors: true }), [shirt])
  return (
    <group>
      <mesh geometry={g.torso} material={shirtMat} castShadow />
      <mesh geometry={g.head} material={skinMat} castShadow />
      <mesh geometry={g.hat} material={hatMat} castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} name={s < 0 ? 'armL' : 'armR'} geometry={g.arm} material={shirtMat} position={[s * V_DIMS.shoulderX, V_DIMS.shoulderY, 0]} castShadow />
      ))}
    </group>
  )
}

function Rowboat({ b }: { b: BoatState }) {
  const model = useMemo(buildRowboat, [])
  const oarGeo = useMemo(() => {
    const g = buildOar().clone()
    g.translate(0.55, 0, 0)
    return g
  }, [])
  const mats = getMaterials()
  const root = useRef<THREE.Group>(null)
  const rower = useRef<THREE.Group>(null)
  const oars = useRef<(THREE.Group | null)[]>([])
  const phase = useRef(Math.random() * 6)
  const beachY = useMemo(() => getHeight(b.homeX, b.homeZ), [b])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    const t = waterUniforms.uTime.value
    const atSea = b.state !== 'beached'
    const rowing = b.state === 'out' || b.state === 'returning'
    g.position.x = b.x
    g.position.z = b.z
    g.rotation.y = b.rot - Math.PI / 2
    if (atSea) {
      const wy = waveHeight(b.x, b.z, t)
      // blend from the beach height into the water while launching
      const ground = getHeight(b.x, b.z) + 0.34
      g.position.y = Math.max(wy + 0.08, ground)
      g.rotation.z = Math.sin(t * 1.3 + b.id) * 0.04
      g.rotation.x = Math.sin(t * 1.1 + b.id * 2) * 0.05
    } else {
      g.position.y = Math.max(beachY + 0.3, waveHeight(b.x, b.z, t) + 0.08)
      g.rotation.z = 0.07
      g.rotation.x = 0.04 * (b.id - 1)
    }
    if (rowing) phase.current += dt * 3.2
    if (rower.current) {
      rower.current.visible = atSea
      const lean = rowing ? Math.sin(phase.current) * 0.25 : 0
      rower.current.rotation.z = lean
      const armL = rower.current.getObjectByName('armL')
      const armR = rower.current.getObjectByName('armR')
      const reach = rowing ? -1.3 + Math.cos(phase.current) * 0.35 : -0.4
      if (armL) armL.rotation.x = reach
      if (armR) armR.rotation.x = reach
    }
    oars.current.forEach((o, i) => {
      if (!o) return
      const side = i === 0 ? 1 : -1
      const inner = o.children[0] as THREE.Group
      if (rowing) {
        o.rotation.y = -side * Math.PI / 2 + side * Math.sin(phase.current) * 0.5
        inner.rotation.z = -0.28 + Math.cos(phase.current) * 0.14
      } else if (atSea) {
        o.rotation.y = -side * Math.PI / 2 + side * 0.9
        inner.rotation.z = -0.1
      } else {
        // stowed along the boat
        o.rotation.y = -side * Math.PI / 2 + side * 1.45
        inner.rotation.z = 0.02
      }
    })
  })

  return (
    <group
      ref={root}
      onPointerMove={(e) => {
        e.stopPropagation()
        const beached = b.state === 'beached'
        hover({
          kind: 'boat',
          title: 'Rowboat',
          action: beached ? `Send out fishing (+${TUNING.fishingTrip[0]}–${TUNING.fishingTrip[1]} fish)` : b.state === 'fishing' ? 'Fishing…' : 'Out at sea',
          x: b.x,
          y: 0.5,
          z: b.z,
          radius: 2.2,
          enabled: beached,
        })
      }}
      onPointerOut={() => hover(null)}
      onClick={(e) => {
        if (ignoreClick(e)) return
        e.stopPropagation()
        launchBoat(b.id)
        hover(null)
      }}
    >
      <ModelMesh geos={model.geos} />
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(el) => {
            oars.current[i] = el
          }}
          position={[0.15, 0.3, i === 0 ? 0.6 : -0.6]}
        >
          <group>
            <mesh geometry={oarGeo} material={mats.trim} castShadow />
          </group>
        </group>
      ))}
      <group ref={rower} position={[-0.3, -0.33, 0]} rotation-y={-Math.PI / 2} scale={0.95}>
        <Rower shirt={['#b5483a', '#d98a4e', '#e9e1cf'][b.id % 3]} />
      </group>
    </group>
  )
}

export function Rowboats() {
  return (
    <>
      {boats.map((b) => (
        <Rowboat key={b.id} b={b} />
      ))}
    </>
  )
}
