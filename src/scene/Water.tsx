import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { T_HALF, T_SIZE, T_VERTS, heights } from '../game/terrain'
import { getTextures } from '../three/textures'
import { PALETTE } from './palette'

/** Same swell as the shader, for things that float. */
export function waveHeight(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.12 + z * 0.05 + t * 0.9) * 0.1 +
    Math.sin(x * -0.07 + z * 0.11 + t * 1.1) * 0.08 +
    Math.sin(x * 0.03 + z * -0.15 + t * 1.3) * 0.05
  )
}

export const waterUniforms = {
  uTime: { value: 0 },
}

const WAVES_GLSL = /* glsl */ `
float swell(vec2 p, float t) {
  return sin(p.x * 0.12 + p.y * 0.05 + t * 0.9) * 0.1
       + sin(p.x * -0.07 + p.y * 0.11 + t * 1.1) * 0.08
       + sin(p.x * 0.03 + p.y * -0.15 + t * 1.3) * 0.05;
}
vec2 swellGrad(vec2 p, float t) {
  float a = cos(p.x * 0.12 + p.y * 0.05 + t * 0.9) * 0.1;
  float b = cos(p.x * -0.07 + p.y * 0.11 + t * 1.1) * 0.08;
  float c = cos(p.x * 0.03 + p.y * -0.15 + t * 1.3) * 0.05;
  return vec2(a * 0.12 + b * -0.07 + c * 0.03, a * 0.05 + b * 0.11 + c * -0.15);
}
`

function heightTexture(): THREE.DataTexture {
  const n = T_VERTS
  const data = new Uint16Array(n * n)
  for (let i = 0; i < n * n; i++) data[i] = THREE.DataUtils.toHalfFloat(heights[i])
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

function waterGeometry(): THREE.BufferGeometry {
  const seg = 300
  const g = new THREE.PlaneGeometry(2, 2, seg, seg)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const R = 1600
  const warp = (u: number) => Math.sign(u) * R * (0.12 * Math.abs(u) + 0.88 * Math.pow(Math.abs(u), 3))
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, warp(pos.getX(i)))
    pos.setZ(i, warp(pos.getZ(i)))
  }
  g.computeBoundingSphere()
  return g
}

export function makeWaterMaterial() {
  const tex = getTextures()
  const hTex = heightTexture()
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.07, metalness: 0.0, envMapIntensity: 1.0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime
    shader.uniforms.uHeight = { value: hTex }
    shader.uniforms.uHBounds = { value: new THREE.Vector4(-T_HALF, -T_HALF, T_SIZE, T_VERTS) }
    shader.uniforms.uNormalTex = { value: tex.water }
    shader.uniforms.uDetail = { value: tex.detail }
    shader.uniforms.uShallow = { value: new THREE.Color(PALETTE.waterShallow) }
    shader.uniforms.uMid = { value: new THREE.Color(PALETTE.waterMid) }
    shader.uniforms.uDeep = { value: new THREE.Color(PALETTE.waterDeep) }
    shader.uniforms.uFoam = { value: new THREE.Color(PALETTE.foam) }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying float vWave;
        ${WAVES_GLSL}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 wp0 = (modelMatrix * vec4(position, 1.0)).xz;
        vec2 sg = swellGrad(wp0, uTime);
        vec3 objectNormal = normalize(vec3(-sg.x, 1.0, -sg.y));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        vWave = swell(wp0, uTime);
        transformed.y += vWave;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform sampler2D uHeight;
        uniform vec4 uHBounds;
        uniform sampler2D uNormalTex;
        uniform sampler2D uDetail;
        uniform vec3 uShallow;
        uniform vec3 uMid;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        varying vec3 vWPos;
        varying float vWave;
        ${WAVES_GLSL}
        float groundH(vec2 p) {
          vec2 uv = (p - uHBounds.xy) / uHBounds.z;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -12.0;
          uv = uv * (uHBounds.w - 1.0) / uHBounds.w + 0.5 / uHBounds.w;
          return texture2D(uHeight, uv).r;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wDepth = vWave - groundH(vWPos.xz);
        float nA = texture2D(uDetail, vWPos.xz * 0.06 + vec2(uTime * 0.01, 0.0)).g;
        float nB = texture2D(uDetail, vWPos.xz * 0.21 - vec2(0.0, uTime * 0.02)).r;
        vec3 wcol = mix(uShallow, uMid, smoothstep(0.1, 2.6, wDepth + (nA - 0.5) * 0.6));
        wcol = mix(wcol, uDeep, smoothstep(2.4, 10.0, wDepth));
        // shoreline foam: a solid rim plus bands that wash towards the beach
        float rim = 1.0 - smoothstep(0.0, 0.18 + nB * 0.25, wDepth);
        float bands = sin(wDepth * 5.5 - uTime * 1.7 + nA * 6.0) * 0.5 + 0.5;
        bands = smoothstep(0.72, 0.97, bands) * (1.0 - smoothstep(0.15, 1.3, wDepth)) * smoothstep(0.35, 0.6, nB + 0.2);
        float wFoam = clamp(rim + bands * 0.75, 0.0, 1.0);
        // sparse whitecaps out at sea
        float caps = smoothstep(0.83, 0.95, texture2D(uDetail, vWPos.xz * 0.018 + vec2(uTime * 0.004, uTime * 0.002)).g + nB * 0.25) * smoothstep(3.0, 8.0, wDepth) * 0.35;
        wFoam = max(wFoam, caps);
        diffuseColor.rgb = mix(wcol, uFoam, wFoam);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, wFoam);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float dist = length(vWPos - cameraPosition);
          vec2 p = vWPos.xz;
          vec3 n1 = texture2D(uNormalTex, p * 0.045 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormalTex, p * 0.11 + vec2(-uTime * 0.017, uTime * 0.013)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNormalTex, p * 0.31 + vec2(uTime * 0.03, -uTime * 0.021)).xyz * 2.0 - 1.0;
          vec2 rip = n1.xy * 0.55 + n2.xy * 0.45 + n3.xy * 0.25 * (1.0 - smoothstep(20.0, 80.0, dist));
          rip *= mix(1.0, 0.25, smoothstep(60.0, 400.0, dist));
          rip *= 1.0 - wFoam * 0.7;
          vec2 sg = swellGrad(p, uTime);
          vec3 wn = normalize(vec3(-sg.x + rip.x * 0.5, 1.0, -sg.y + rip.y * 0.5));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'water-v1'
  return m
}

export function Water() {
  const geo = useMemo(waterGeometry, [])
  const mat = useMemo(makeWaterMaterial, [])
  useFrame((_, dt) => {
    waterUniforms.uTime.value += Math.min(dt, 0.1)
  })
  return <mesh geometry={geo} material={mat} name="water" frustumCulled={false} />
}
