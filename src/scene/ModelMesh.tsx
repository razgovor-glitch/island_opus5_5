import { memo } from 'react'
import * as THREE from 'three'
import { getMaterials, MatKey } from '../three/materials'

const NO_SHADOW = new Set(['glass', 'lamp', 'flowers', 'goods'])

/** Renders a merged model (one mesh per material). */
export const ModelMesh = memo(function ModelMesh({
  geos,
  override,
  castShadow = true,
}: {
  geos: Map<string, THREE.BufferGeometry>
  override?: THREE.Material
  castShadow?: boolean
}) {
  const mats = getMaterials()
  return (
    <>
      {[...geos].map(([key, geo]) => (
        <mesh
          key={key}
          geometry={geo}
          material={override ?? mats[key as MatKey]}
          castShadow={castShadow && !NO_SHADOW.has(key)}
          receiveShadow
        />
      ))}
    </>
  )
})
