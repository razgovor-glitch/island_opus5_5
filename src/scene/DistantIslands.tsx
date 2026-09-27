import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Simplex2, mulberry32, smoothstep } from '../game/noise'
import { getTextures } from '../three/textures'
import { timed } from '../game/perf'

interface Range {
  cx: number
  cz: number
  w: number
  d: number
  H: number
  seed: number
  kind: 'dome' | 'cliff' | 'hills'
  rot?: number
  seg?: number
}

// Big islands / mountain ranges on the horizon.
export const RANGES: Range[] = [
  { cx: -190, cz: -175, w: 280, d: 200, H: 118, seed: 1, kind: 'dome', rot: 0.25, seg: 170 },
  { cx: 205, cz: -165, w: 230, d: 190, H: 104, seed: 2, kind: 'cliff', rot: -0.35, seg: 160 },
  { cx: -30, cz: -470, w: 420, d: 150, H: 82, seed: 3, kind: 'dome', rot: 0.05, seg: 140 },
  { cx: 150, cz: -400, w: 240, d: 130, H: 62, seed: 4, kind: 'hills', rot: -0.2, seg: 110 },
  { cx: -165, cz: -45, w: 95, d: 75, H: 24, seed: 5, kind: 'hills', rot: 0.4, seg: 90 },
  { cx: 172, cz: -30, w: 110, d: 80, H: 30, seed: 6, kind: 'cliff', rot: 0.2, seg: 90 },
  { cx: -330, cz: -40, w: 200, d: 140, H: 70, seed: 7, kind: 'hills', rot: 0.6, seg: 100 },
  { cx: 330, cz: -20, w: 200, d: 150, H: 75, seed: 8, kind: 'dome', rot: -0.5, seg: 100 },
]

function rangeHeight(r: Range, n: Simplex2, u: number, v: number): number {
  // u,v in [-1,1] local
  const e = Math.hypot(u, v)
  const edge = e + n.fbm(u * 1.3 + r.seed, v * 1.3, 3) * 0.28
  const mask = 1 - smoothstep(0.5, 0.98, edge)
  let h: number
  if (r.kind === 'dome') {
    const dome = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.hypot(u * 1.1 + 0.1, v * 1.25) / 0.8), 2.2)), 0.7)
    const ridges = n.ridged(u * 2.2 + r.seed * 3, v * 2.2, 4)
    h = r.H * (0.18 * mask + 0.7 * dome * (0.55 + 0.45 * ridges) + 0.14 * ridges * mask)
  } else if (r.kind === 'cliff') {
    // high plateau that drops away sharply on its western face
    const face = smoothstep(-0.55, -0.2, u + n.noise(v * 2 + r.seed, 1) * 0.12)
    const back = 1 - smoothstep(0.4, 0.95, u)
    const ridges = n.ridged(u * 2.5 + r.seed, v * 2.5, 4)
    h = r.H * mask * (0.2 + 0.8 * face * (0.6 + 0.4 * ridges) * (0.5 + 0.5 * back))
  } else {
    const ridges = n.ridged(u * 1.8 + r.seed, v * 1.8, 4)
    h = r.H * mask * (0.35 + 0.65 * ridges) * (1 - 0.4 * e)
  }
  return h * mask + (mask - 1) * 12 - 0.5
}

const C = (h: string) => new THREE.Color(h)
const COLS = {
  rock: C('#99938b'),
  rockDark: C('#76706a'),
  forest: C('#4a6b3a'),
  forestDark: C('#2f4b2b'),
  meadow: C('#8ea457'),
  sand: C('#d4c090'),
}

function buildRange(r: Range) {
  const n = new Simplex2(r.seed * 97)
  const seg = r.seg ?? 100
  const g = new THREE.PlaneGeometry(r.w, r.d, seg, Math.round((seg * r.d) / r.w))
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) / r.w) * 2
    const v = (pos.getZ(i) / r.d) * 2
    pos.setY(i, rangeHeight(r, n, u, v))
  }
  g.computeVertexNormals()
  const nor = g.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const trees: [number, number, number, number][] = []
  const rnd = mulberry32(r.seed * 31)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ny = nor.getY(i)
    const slope = 1 - ny
    const nn = n.noise(x * 0.05, z * 0.05)
    const fine = n.noise(x * 0.25, z * 0.25)
    const rockT = Math.max(smoothstep(0.34, 0.55, slope + nn * 0.1), smoothstep(r.H * 0.62, r.H * 0.85, y + nn * 12))
    c.copy(COLS.forest).lerp(COLS.forestDark, smoothstep(-0.3, 0.6, fine))
    c.lerp(COLS.meadow, smoothstep(0.35, 0.8, nn) * (1 - smoothstep(0.05, 0.2, slope)) * 0.7)
    c.lerp(COLS.rock, rockT)
    if (rockT > 0.5) c.lerp(COLS.rockDark, smoothstep(0.2, 0.8, fine) * 0.4)
    c.lerp(COLS.sand, 1 - smoothstep(0.6, 2.2, y))
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
    if (rockT < 0.3 && y > 2 && y < r.H * 0.7 && rnd() < 0.5) trees.push([x, y, z, 5 + rnd() * 5])
  }
  // keep a random subset so big ranges don't explode the instance count
  for (let i = trees.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[trees[i], trees[j]] = [trees[j], trees[i]]
  }
  trees.length = Math.min(trees.length, 3000)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return { geo: g, trees }
}

function Forest({ trees, rot, cx, cz }: { trees: [number, number, number, number][]; rot: number; cx: number; cz: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const a = new THREE.ConeGeometry(0.34, 0.75, 6)
    a.translate(0, 0.52, 0)
    return a
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4a2c', roughness: 1, flatShading: true }), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const c = new THREE.Color()
    trees.forEach(([x, y, z, h], i) => {
      p.set(x, y - 0.3, z)
      s.set(h * 0.8, h, h * 0.8)
      m.compose(p, q, s)
      ref.current!.setMatrixAt(i, m)
      const k = 0.75 + ((i * 7919) % 100) / 250
      ref.current!.setColorAt(i, c.setRGB(k, k * 1.02, k))
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [trees])
  return (
    <group position={[cx, 0, cz]} rotation-y={rot}>
      <instancedMesh ref={ref} args={[geo, mat, trees.length]} />
    </group>
  )
}

export function DistantIslands() {
  const built = useMemo(() => timed('distant ranges', () => RANGES.map(buildRange)), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    const detail = getTextures().detail
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: detail }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec3 vWP;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float dd = texture2D(uDetail, vWP.xz * 0.05).r * 0.6 + texture2D(uDetail, vec2(vWP.x + vWP.z, vWP.y * 3.0) * 0.02).b * 0.4;
          diffuseColor.rgb *= mix(0.8, 1.15, dd);`,
        )
    }
    m.customProgramCacheKey = () => 'distant-v1'
    return m
  }, [])
  return (
    <group>
      {RANGES.map((r, i) => (
        <group key={i}>
          <mesh geometry={built[i].geo} material={mat} position={[r.cx, 0, r.cz]} rotation-y={r.rot ?? 0} receiveShadow />
          <Forest trees={built[i].trees} rot={r.rot ?? 0} cx={r.cx} cz={r.cz} />
        </group>
      ))}
    </group>
  )
}
