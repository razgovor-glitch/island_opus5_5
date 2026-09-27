// Ambient life: chimney smoke and circling seagulls.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { houses, placed } from '../game/world'

const PUFFS_PER = 14

const smokeVert = /* glsl */ `
attribute float aLife;
attribute float aSeed;
varying float vLife;
varying float vSeed;
uniform float uScale;
void main() {
  vLife = aLife;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.7, 3.2, aLife);
  gl_PointSize = size * uScale / -mv.z;
}
`
const smokeFrag = /* glsl */ `
varying float vLife;
varying float vSeed;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.15, d);
  a *= smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife)) * 0.45;
  vec3 col = mix(vec3(0.93, 0.93, 0.92), vec3(0.78, 0.78, 0.8), vLife);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`

export function Smoke() {
  const ref = useRef<THREE.Points>(null)
  const MAX_CH = 40
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CH * PUFFS_PER * 3), 3))
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(MAX_CH * PUFFS_PER), 1))
    const seeds = new Float32Array(MAX_CH * PUFFS_PER)
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500)
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: smokeVert,
        fragmentShader: smokeFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { uScale: { value: 400 } },
      }),
    [],
  )
  const time = useRef(0)
  useFrame((state, dt) => {
    time.current += Math.min(dt, 0.1)
    mat.uniforms.uScale.value = state.size.height * 0.9
    const chimneys: [number, number, number][] = []
    for (const h of houses) chimneys.push(...h.chimneys)
    for (const b of placed) if (b.done) chimneys.push(...b.chimneys)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const life = geo.attributes.aLife as THREE.BufferAttribute
    const seed = geo.attributes.aSeed as THREE.BufferAttribute
    const n = Math.min(chimneys.length, MAX_CH)
    for (let c = 0; c < n; c++) {
      const [cx, cy, cz] = chimneys[c]
      for (let k = 0; k < PUFFS_PER; k++) {
        const i = c * PUFFS_PER + k
        const s = seed.getX(i)
        const l = (time.current * 0.12 + k / PUFFS_PER + c * 0.37) % 1
        life.setX(i, l)
        const rise = l * 7
        pos.setXYZ(i, cx + Math.sin(l * 4 + s * 6) * 0.3 * l + l * l * 2.5, cy + rise, cz + Math.cos(l * 3 + s * 5) * 0.3 * l + l * 1.2)
      }
    }
    geo.setDrawRange(0, n * PUFFS_PER)
    pos.needsUpdate = true
    life.needsUpdate = true
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />
}

function gullGeometry() {
  const g = new THREE.BufferGeometry()
  // body + two wings (wing tips move in the vertex shader via uFlap)
  const v = [
    // body
    0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3,
    // left wing
    0, 0, 0.12, -0.95, 0.0, -0.05, 0, 0, -0.15,
    // right wing
    0, 0, 0.12, 0, 0, -0.15, 0.95, 0.0, -0.05,
  ]
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  // per-vertex wing weight (0 at the body, 1 at the tip)
  const w = [0, 0, 0, 0, 1, 0, 0, 0, 1]
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(w, 1))
  g.computeVertexNormals()
  return g
}

export function Gulls() {
  const COUNT = 9
  const geo = useMemo(gullGeometry, [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#f4f4f2', side: THREE.DoubleSide, roughness: 0.8 })
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute float aPhase;\nuniform float uT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aWing * sin(uT * 7.0 + aPhase) * 0.45;')
      s.uniforms.uT = gullTime
    }
    return m
  }, [])
  const ref = useRef<THREE.InstancedMesh>(null)
  const birds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        cx: -20 + Math.random() * 45,
        cz: -25 + Math.random() * 45,
        r: 10 + Math.random() * 22,
        h: 16 + Math.random() * 16,
        speed: (0.18 + Math.random() * 0.15) * (i % 2 ? 1 : -1),
        phase: Math.random() * 10,
      })),
    [],
  )
  const phases = useMemo(() => {
    const a = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) a[i] = Math.random() * 6
    return a
  }, [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const s = useMemo(() => new THREE.Vector3(1.3, 1.3, 1.3), [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    gullTime.value = t
    const mesh = ref.current
    if (!mesh) return
    birds.forEach((b, i) => {
      const a = b.phase + t * b.speed
      p.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + i) * 1.5, b.cz + Math.sin(a) * b.r)
      const dir = b.speed > 0 ? 1 : -1
      e.set(0, -a + (dir > 0 ? 0 : Math.PI), dir * 0.35)
      q.setFromEuler(e)
      m4.compose(p, q, s)
      mesh.setMatrixAt(i, m4)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  const withPhase = useMemo(() => {
    const g = geo.clone()
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    return g
  }, [geo, phases])
  return <instancedMesh ref={ref} args={[withPhase, mat, COUNT]} frustumCulled={false} castShadow />
}

const gullTime = { value: 0 }
