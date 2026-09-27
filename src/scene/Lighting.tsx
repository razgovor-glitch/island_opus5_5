import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { FOG_DENSITY, PALETTE, SUN_DIR } from './palette'
import { makeSkyMaterial } from './Sky'
import { useGame } from '../game/store'

export function Lighting() {
  const light = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const quality = useGame((s) => s.quality)
  const envMat = useMemo(() => makeSkyMaterial(true), [])

  useEffect(() => {
    scene.fog = new THREE.FogExp2(PALETTE.fog, FOG_DENSITY)
    scene.background = new THREE.Color(PALETTE.horizon)
  }, [scene])

  useEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(0, 0, -4)
    l.target.updateMatrixWorld()
    const size = quality === 'low' ? 2048 : 4096
    if (l.shadow.mapSize.x !== size) {
      l.shadow.mapSize.set(size, size)
      l.shadow.map?.dispose()
      l.shadow.map = null as unknown as THREE.WebGLRenderTarget
    }
  }, [quality])

  const pos = SUN_DIR.clone().multiplyScalar(140).add(new THREE.Vector3(0, 0, -4))

  return (
    <>
      <directionalLight
        ref={light}
        position={pos}
        intensity={3.1}
        color={PALETTE.sun}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.035}
        shadow-radius={2.5}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={20}
        shadow-camera-far={300}
      />
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 0.45]} />
      <Environment frames={1} resolution={128} environmentIntensity={0.45}>
        <mesh material={envMat}>
          <sphereGeometry args={[50, 32, 16]} />
        </mesh>
      </Environment>
    </>
  )
}
