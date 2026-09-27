import { useMemo } from 'react'
import * as THREE from 'three'
import { T_HALF, T_RES, T_STEP, T_VERTS, beachFactor, heights, pathGrid, sx } from '../game/terrain'
import { lerp, smoothstep } from '../game/noise'
import { getTextures } from '../three/textures'
import { staticObstacles, trees } from '../game/world'
import { obstacleContains } from '../game/nav'
import { timed } from '../game/perf'

const C = (h: string) => new THREE.Color(h)
const COL = {
  grassA: C('#8ea150'),
  grassB: C('#6c863c'),
  grassDry: C('#a3a563'),
  grassDark: C('#566f36'),
  sand: C('#d4b985'),
  sandWet: C('#b99f76'),
  seabed: C('#8f8a6c'),
  deep: C('#4b5e55'),
  dirt: C('#c8a676'),
  dirtDark: C('#a8865c'),
  rock: C('#b3aca3'),
  rockDark: C('#8a837b'),
  rockWarm: C('#c0b3a3'),
}

function buildGeometry(): THREE.BufferGeometry {
  const n = T_VERTS
  const pos = new Float32Array(n * n * 3)
  const nor = new Float32Array(n * n * 3)
  const col = new Float32Array(n * n * 3)
  const ao = new Float32Array(n * n).fill(1)

  // ambient occlusion baked around trees and buildings
  const stamp = (x: number, z: number, r: number, strength: number) => {
    const i0 = Math.max(0, Math.floor((x - r + T_HALF) / T_STEP))
    const i1 = Math.min(n - 1, Math.ceil((x + r + T_HALF) / T_STEP))
    const j0 = Math.max(0, Math.floor((z - r + T_HALF) / T_STEP))
    const j1 = Math.min(n - 1, Math.ceil((z + r + T_HALF) / T_STEP))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-T_HALF + i * T_STEP - x, -T_HALF + j * T_STEP - z) / r
        if (d < 1) ao[j * n + i] *= 1 - strength * (1 - d * d)
      }
    }
  }
  for (const t of trees) stamp(t.x, t.z, t.kind === 'oak' ? t.scale * 0.42 : t.scale * 0.24, 0.32)
  for (const o of staticObstacles) {
    const r = o.kind === 'circle' ? (o.r ?? 1) + 1.2 : Math.hypot(o.hx ?? 1, o.hz ?? 1) + 1.5
    const i0 = Math.max(0, Math.floor((o.x - r + T_HALF) / T_STEP))
    const i1 = Math.min(n - 1, Math.ceil((o.x + r + T_HALF) / T_STEP))
    const j0 = Math.max(0, Math.floor((o.z - r + T_HALF) / T_STEP))
    const j1 = Math.min(n - 1, Math.ceil((o.z + r + T_HALF) / T_STEP))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -T_HALF + i * T_STEP
        const z = -T_HALF + j * T_STEP
        for (const pad of [0.3, 0.8, 1.4]) {
          if (obstacleContains(o, x, z, pad)) {
            ao[j * n + i] *= 0.9
          }
        }
      }
    }
  }

  const c = new THREE.Color()
  const tmp = new THREE.Color()
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const x = -T_HALF + i * T_STEP
      const z = -T_HALF + j * T_STEP
      const h = heights[k]
      pos[k * 3] = x
      pos[k * 3 + 1] = h
      pos[k * 3 + 2] = z
      const hl = heights[j * n + Math.max(0, i - 1)]
      const hr = heights[j * n + Math.min(n - 1, i + 1)]
      const hd = heights[Math.max(0, j - 1) * n + i]
      const hu = heights[Math.min(n - 1, j + 1) * n + i]
      let nx = hl - hr
      let ny = 2 * T_STEP
      let nz = hd - hu
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      nor[k * 3] = nx
      nor[k * 3 + 1] = ny
      nor[k * 3 + 2] = nz

      const slope = 1 - ny
      const n1 = sx.fbm(x * 0.07, z * 0.07, 3)
      const n2 = sx.noise(x * 0.45 + 13, z * 0.45)
      const n3 = sx.noise(x * 1.7, z * 1.7)
      // grass with patchy variation
      c.copy(COL.grassB).lerp(COL.grassA, smoothstep(-0.5, 0.6, n1 + n2 * 0.3))
      c.lerp(COL.grassDark, smoothstep(0.35, 0.8, -n1) * 0.4)
      c.lerp(COL.grassDry, smoothstep(0.9, 1.6, h) * (1 - smoothstep(1.6, 2.6, h)) * 0.35)
      // dirt paths
      const pm = pathGrid[k]
      if (pm > 0) {
        tmp.copy(COL.dirt).lerp(COL.dirtDark, 0.5 + 0.5 * n3)
        c.lerp(tmp, pm * 0.95)
      }
      // beach sand
      const beach = beachFactor(x, z)
      const sandTop = 0.72 + 0.42 * beach
      const sandT = 1 - smoothstep(sandTop - 0.15, sandTop + 0.2, h + n2 * 0.16 + n3 * 0.05)
      if (sandT > 0) c.lerp(COL.sand, sandT)
      // rock on steep ground
      const rockT = smoothstep(0.24, 0.42, slope + n2 * 0.06)
      if (rockT > 0) {
        // vertical water streaks and fractures on the granite
        const streak = sx.ridged((x + z) * 0.35 + 3, h * 0.035, 3)
        const blotch = sx.noise(x * 0.12 + 7, h * 0.12 - z * 0.05)
        tmp.copy(COL.rock).lerp(COL.rockDark, smoothstep(0.55, 0.95, streak) * 0.45).lerp(COL.rockWarm, smoothstep(-0.2, 0.7, blotch) * 0.5)
        // grass clinging to ledges
        tmp.lerp(COL.grassB, smoothstep(0.62, 0.85, 1 - slope + n3 * 0.08) * 0.5)
        c.lerp(tmp, rockT)
      }
      // wet sand & seabed
      if (h < 0.35) {
        c.lerp(COL.sandWet, smoothstep(0.35, 0.0, h))
        if (h < 0) c.lerp(COL.seabed, smoothstep(0, -2, h)).lerp(COL.deep, smoothstep(-2, -7, h))
      }
      const a = lerp(1, ao[k], smoothstep(0.2, 0.9, h))
      col[k * 3] = c.r * a
      col[k * 3 + 1] = c.g * a
      col[k * 3 + 2] = c.b * a
    }
  }
  const idx = new Uint32Array(T_RES * T_RES * 6)
  let q = 0
  for (let j = 0; j < T_RES; j++) {
    for (let i = 0; i < T_RES; i++) {
      const a = j * n + i
      const b = a + 1
      const c2 = a + n
      const d = c2 + 1
      // alternate the diagonal for a less regular look
      if ((i + j) % 2 === 0) {
        idx[q++] = a
        idx[q++] = c2
        idx[q++] = b
        idx[q++] = b
        idx[q++] = c2
        idx[q++] = d
      } else {
        idx[q++] = a
        idx[q++] = c2
        idx[q++] = d
        idx[q++] = a
        idx[q++] = d
        idx[q++] = b
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

export function makeTerrainMaterial() {
  const tex = getTextures()
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex.detail }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 wn = normalize(vWNormal);
          float steep = smoothstep(0.18, 0.45, 1.0 - wn.y);
          float dFine = texture2D(uDetail, vWPos.xz * 0.31).r;
          float dFine2 = texture2D(uDetail, vWPos.xz * 1.3).r;
          float dMacro = texture2D(uDetail, vWPos.xz * 0.017).g;
          float dRock = texture2D(uDetail, vec2(vWPos.y * 0.035, (vWPos.x + vWPos.z) * 0.06)).b;
          float dRock2 = texture2D(uDetail, vec2((vWPos.x - vWPos.z) * 0.25, vWPos.y * 0.25)).r;
          float flatD = mix(0.84, 1.14, dFine) * mix(0.93, 1.07, dFine2) * mix(0.9, 1.1, dMacro);
          float rockD = mix(0.72, 1.22, dRock) * mix(0.86, 1.12, dRock2);
          diffuseColor.rgb *= mix(flatD, rockD, steep);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'terrain-v1'
  return m
}

export function Terrain() {
  const geo = useMemo(() => timed('terrain mesh', buildGeometry), [])
  const mat = useMemo(makeTerrainMaterial, [])
  return <mesh geometry={geo} material={mat} receiveShadow castShadow name="terrain" />
}
