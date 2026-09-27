import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { placed, PlacedBuilding } from '../game/world'
import { buildingModel } from '../models/buildings'
import { getMaterials, MatKey } from '../three/materials'
import { Parts } from '../three/geom'
import { ModelMesh } from './ModelMesh'
import { BUILDINGS } from '../game/config'

function scaffold(bounds: THREE.Box3, height: number) {
  const p = new Parts()
  const x0 = bounds.min.x - 0.35
  const x1 = bounds.max.x + 0.35
  const z0 = bounds.min.z - 0.35
  const z1 = bounds.max.z + 0.35
  const h = Math.min(height, 9) + 0.6
  const poles: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [(x0 + x1) / 2, z0],
    [(x0 + x1) / 2, z1],
  ]
  for (const [x, z] of poles) p.box('beam', [0.12, h, 0.12], [x, h / 2, z])
  for (let y = 1.4; y < h; y += 1.6) {
    p.box('trim', [x1 - x0 + 0.2, 0.08, 0.3], [(x0 + x1) / 2, y, z0])
    p.box('trim', [x1 - x0 + 0.2, 0.08, 0.3], [(x0 + x1) / 2, y, z1])
    p.box('beam', [0.08, 0.08, z1 - z0], [x0, y + 0.4, (z0 + z1) / 2])
    p.box('beam', [0.08, 0.08, z1 - z0], [x1, y + 0.4, (z0 + z1) / 2])
  }
  // diagonal braces
  for (const z of [z0, z1]) {
    const len = Math.hypot(x1 - x0, h * 0.6)
    p.box('beam', [len, 0.07, 0.07], [(x0 + x1) / 2, h * 0.35, z + (z === z0 ? -0.05 : 0.05)], [0, 0, Math.atan2(h * 0.6, x1 - x0)])
  }
  return p.merge()
}

function Construction({ b }: { b: PlacedBuilding }) {
  const model = buildingModel(b.type, b.variant)
  const height = model.bounds.max.y
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), b.y), [b])
  const mats = useMemo(() => {
    const base = getMaterials()
    const m = new Map<string, THREE.Material>()
    for (const key of model.geos.keys()) {
      const c = base[key as MatKey].clone()
      c.clippingPlanes = [plane]
      c.clipShadows = true
      m.set(key, c)
    }
    return m
  }, [model, plane])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  const sc = useMemo(() => scaffold(model.bounds, height), [model, height])
  const barRef = useRef<HTMLDivElement>(null)
  useFrame(() => {
    plane.constant = b.y - 1.5 + (height + 1.6) * b.progress
    if (barRef.current) barRef.current.style.width = `${Math.round(b.progress * 100)}%`
  })
  return (
    <>
      {[...model.geos].map(([key, geo]) => (
        <mesh key={key} geometry={geo} material={mats.get(key)} castShadow receiveShadow />
      ))}
      <ModelMesh geos={sc} />
      <Html position={[0, Math.min(height, 9) + 2, 0]} center distanceFactor={60} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="build-progress">
          <div className="build-progress-label">{BUILDINGS[b.type].name}</div>
          <div className="build-progress-track">
            <div ref={barRef} className="build-progress-fill" />
          </div>
        </div>
      </Html>
    </>
  )
}

function Building({ b }: { b: PlacedBuilding }) {
  const model = buildingModel(b.type, b.variant)
  return (
    <group position={[b.x, b.y, b.z]} rotation-y={b.rot}>
      {b.done ? <ModelMesh geos={model.geos} /> : <Construction b={b} />}
      {b.type === 'lighthouse' && b.done && <LighthouseBeam height={model.bounds.max.y} />}
    </group>
  )
}

function LighthouseBeam({ height }: { height: number }) {
  const g = useRef<THREE.Group>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#ffe6a6') } },
        vertexShader: `
          varying float vAlong;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vAlong = 0.5 - position.y / 22.0; // 0 at the lamp, 1 at the far end
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vAlong;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
            float a = (1.0 - smoothstep(0.0, 1.0, vAlong)) * edge * 0.22;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      }),
    [],
  )
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.6
  })
  return (
    <group ref={g} position={[0, height - 2.4, 0]}>
      {[0, Math.PI].map((a) => (
        <mesh key={a} rotation={[0, a, Math.PI / 2]} position={[Math.cos(a) * 11, 0, -Math.sin(a) * 11]} material={mat}>
          <coneGeometry args={[2.2, 22, 16, 1, true]} />
        </mesh>
      ))}
      <pointLight color="#ffd98a" intensity={30} distance={25} />
    </group>
  )
}

export function PlayerBuildings() {
  const version = useGame((s) => s.buildingsVersion)
  const list = useMemo(() => [...placed], [version])
  return (
    <>
      {list.map((b) => (
        <Building key={`${b.id}-${b.done}`} b={b} />
      ))}
    </>
  )
}
