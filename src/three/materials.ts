// Shared materials. Models are merged per material key, so each building is only a handful of draw calls.

import * as THREE from 'three'
import { getTextures } from './textures'

export type MatKey =
  | 'wall'
  | 'roof'
  | 'roofCream'
  | 'stone'
  | 'roughStone'
  | 'beam'
  | 'trim'
  | 'door'
  | 'glass'
  | 'dark'
  | 'iron'
  | 'flowers'
  | 'thatch'
  | 'cloth'
  | 'sail'
  | 'hull'
  | 'deck'
  | 'rope'
  | 'lamp'
  | 'paintRed'
  | 'paintWhite'
  | 'goods'

let mats: Record<MatKey, THREE.Material> | null = null

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...p })
}

export function getMaterials(): Record<MatKey, THREE.Material> {
  if (mats) return mats
  const t = getTextures()
  const ns = new THREE.Vector2(0.9, 0.9)
  mats = {
    wall: std({ map: t.wallPlanks.map, normalMap: t.wallPlanks.normalMap, normalScale: ns, color: '#f4e8dc' }),
    roof: std({ map: t.shingles.map, normalMap: t.shingles.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), color: '#c29a70', roughness: 0.92 }),
    roofCream: std({ map: t.shingles.map, normalMap: t.shingles.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), color: '#f3e1a6', roughness: 0.9 }),
    stone: std({ map: t.stone.map, normalMap: t.stone.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), color: '#f2efe9', roughness: 0.93 }),
    roughStone: std({ map: t.roughStone.map, normalMap: t.roughStone.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), color: '#e6e1d9', roughness: 0.95 }),
    beam: std({ map: t.darkPlanks.map, normalMap: t.darkPlanks.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), color: '#c9b19b' }),
    trim: std({ map: t.deckPlanks.map, normalMap: t.deckPlanks.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), color: '#e2cdb4' }),
    door: std({ map: t.darkPlanks.map, normalMap: t.darkPlanks.normalMap, normalScale: ns, color: '#b99a82' }),
    glass: std({ color: '#1f2b33', roughness: 0.22, metalness: 0.2, envMapIntensity: 0.9 }),
    dark: std({ color: '#241c17', roughness: 1 }),
    iron: std({ color: '#3d3a38', roughness: 0.45, metalness: 0.7 }),
    flowers: std({ vertexColors: true, roughness: 0.75 }),
    thatch: std({ map: t.thatch.map, normalMap: t.thatch.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), color: '#fff2d6', roughness: 0.95, side: THREE.DoubleSide }),
    cloth: std({ color: '#e9dcc0', roughness: 0.95, side: THREE.DoubleSide }),
    sail: std({ color: '#efe4c8', roughness: 0.95, side: THREE.DoubleSide }),
    hull: std({ map: t.darkPlanks.map, normalMap: t.darkPlanks.normalMap, normalScale: ns, color: '#e7cdb3', vertexColors: true, side: THREE.DoubleSide }),
    deck: std({ map: t.deckPlanks.map, normalMap: t.deckPlanks.normalMap, normalScale: ns, color: '#f0dcc2' }),
    rope: std({ color: '#5a4430', roughness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffe3a3', emissive: '#ffcf6e', emissiveIntensity: 2.2, roughness: 0.5 }),
    paintRed: std({ color: '#b8483a', roughness: 0.7 }),
    paintWhite: std({ color: '#f1ece2', roughness: 0.75 }),
    goods: std({ vertexColors: true, roughness: 0.8 }),
  }
  return mats
}

// Materials used by instanced vegetation / characters -------------------------------------------

let veg: {
  foliage: THREE.MeshStandardMaterial
  leaves: THREE.MeshStandardMaterial
  trunk: THREE.MeshStandardMaterial
  rock: THREE.MeshStandardMaterial
  grass: THREE.MeshStandardMaterial
  flower: THREE.MeshStandardMaterial
} | null = null

export const windUniforms = { uTime: { value: 0 } }

/** Adds a gentle wind sway to instanced foliage (vertices higher up move more). */
function addWind(m: THREE.MeshStandardMaterial, strength: number, heightScale: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(position.y, 0.0) * ${heightScale.toFixed(3)};
          float ph = ip.x * 0.37 + ip.z * 0.29;
          float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          transformed.x += sway * hgt * hgt * ${strength.toFixed(3)};
          transformed.z += cos(uTime * 1.1 + ph) * hgt * hgt * ${(strength * 0.6).toFixed(3)};
        }`,
      )
  }
  m.customProgramCacheKey = () => `wind-${strength}-${heightScale}`
}

export function getVegetationMaterials() {
  if (veg) return veg
  const t = getTextures()
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, normalMap: t.leaf, normalScale: new THREE.Vector2(0.6, 0.6) })
  addWind(foliage, 0.035, 0.12)
  const leaves = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, normalMap: t.leaf, normalScale: new THREE.Vector2(1.3, 1.3) })
  addWind(leaves, 0.03, 0.14)
  const grass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })
  addWind(grass, 0.9, 1.0)
  veg = {
    foliage,
    leaves,
    trunk: new THREE.MeshStandardMaterial({ color: '#6a4d38', roughness: 0.95, map: t.darkPlanks.map }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: t.granite.map, normalMap: t.granite.normalMap, normalScale: new THREE.Vector2(1, 1) }),
    grass,
    flower: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
  }
  return veg
}
