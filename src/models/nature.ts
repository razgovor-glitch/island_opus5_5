// Trees, bushes, rocks and grass tufts (geometry only — rendered with instancing).

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Simplex2, mulberry32, smoothstep } from '../game/noise'

const sn = new Simplex2(77)
const n3 = (x: number, y: number, z: number) => (sn.noise(x, y) + sn.noise(y + 3.1, z - 1.7) + sn.noise(z + 7.3, x + 2.9)) / 3

function setColor(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => [number, number, number]) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    const c = fn(p, n)
    col[i * 3] = c[0]
    col[i * 3 + 1] = c[1]
    col[i * 3 + 2] = c[2]
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) out.deleteAttribute(name)
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2))
  return out
}

const lin = (hex: string) => new THREE.Color(hex)

/** Layered fir. Height 1 (scaled per instance), trunk included via vertex colours. */
export function pineGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const geos: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.022, 0.04, 0.3, 7)
  trunk.translate(0, 0.15, 0)
  const tc = lin('#5b3f2c')
  setColor(trunk, () => [tc.r, tc.g, tc.b])
  geos.push(strip(trunk))
  const layers = 7
  const dark = lin('#1c3a26')
  const mid = lin('#2f5a38')
  const tip = lin('#4f8050')
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1)
    const yb = 0.14 + t * 0.66
    const hgt = 0.26 - t * 0.08
    const r = (0.3 - t * 0.24) * (0.92 + rnd() * 0.16)
    const seg = 14
    const cone = new THREE.ConeGeometry(r, hgt, seg, 2, false)
    cone.translate(0, yb + hgt / 2, 0)
    const pos = cone.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const rr = Math.hypot(v.x, v.z)
      if (rr > 1e-4) {
        const a = Math.atan2(v.z, v.x)
        const jag = 1 + 0.2 * Math.sin(a * 7 + l * 1.3) + (rnd() - 0.5) * 0.18
        const f = rr / r
        v.x *= 1 + (jag - 1) * f
        v.z *= 1 + (jag - 1) * f
        v.y -= f * f * 0.05 * (1 + rnd())
      }
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    cone.computeVertexNormals()
    {
      const nor = cone.attributes.normal
      const p = new THREE.Vector3()
      const nn = new THREE.Vector3()
      for (let i = 0; i < nor.count; i++) {
        p.fromBufferAttribute(pos, i)
        nn.fromBufferAttribute(nor, i)
        const rr = Math.hypot(p.x, p.z) || 1
        const soft = new THREE.Vector3(p.x / rr, 0.75, p.z / rr).normalize()
        nn.multiplyScalar(0.45).add(soft.multiplyScalar(0.55)).normalize()
        nor.setXYZ(i, nn.x, nn.y, nn.z)
      }
    }
    setColor(cone, (p, n) => {
      const rr = Math.hypot(p.x, p.z) / Math.max(r, 1e-3)
      const up = n.y * 0.5 + 0.5
      const c = new THREE.Color().copy(dark).lerp(mid, smoothstep(0.1, 0.7, rr)).lerp(tip, smoothstep(0.65, 1.05, rr) * 0.7 * up + t * 0.15)
      const k = 0.8 + 0.25 * t
      return [c.r * k, c.g * k, c.b * k]
    })
    geos.push(strip(cone))
  }
  const g = mergeGeometries(geos, false)!
  g.computeBoundingSphere()
  return g
}

/** Round broadleaf tree made of lumpy leaf clumps. Height ~1. */
export function oakGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const geos: THREE.BufferGeometry[] = []
  const bark = lin('#5e4636')
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.45, 8)
  trunk.translate(0, 0.225, 0)
  setColor(trunk, () => [bark.r, bark.g, bark.b])
  geos.push(strip(trunk))
  for (const [a, tilt] of [
    [0.3, 0.6],
    [2.4, 0.7],
    [4.3, 0.55],
  ]) {
    const br = new THREE.CylinderGeometry(0.014, 0.028, 0.26, 6)
    br.translate(0, 0.13, 0)
    br.rotateZ(tilt)
    br.rotateY(a)
    br.translate(0, 0.36, 0)
    setColor(br, () => [bark.r, bark.g, bark.b])
    geos.push(strip(br))
  }
  const light = lin('#a2ae5f')
  const mid = lin('#72883f')
  const dark = lin('#3a5127')
  const clumps = 14
  const crownC = new THREE.Vector3(0, 0.66, 0)
  for (let i = 0; i < clumps; i++) {
    const a = rnd() * Math.PI * 2
    const rad = i === 0 ? 0 : 0.1 + rnd() * 0.2
    const cy = 0.64 + (rnd() - 0.35) * 0.3 - rad * 0.35
    const cx = Math.cos(a) * rad
    const cz = Math.sin(a) * rad
    const s = (i === 0 ? 0.24 : 0.12 + rnd() * 0.1) * 1.05
    const sphere = new THREE.IcosahedronGeometry(s, 2)
    const pos = sphere.attributes.position
    const nor = sphere.attributes.normal
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    const off = rnd() * 100
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k)
      const nrm = v.clone().normalize()
      const bump = 1 + 0.2 * n3(nrm.x * 2.2 + off, nrm.y * 2.2, nrm.z * 2.2) + 0.08 * n3(nrm.x * 5 + off, nrm.y * 5, nrm.z * 5)
      v.multiplyScalar(bump)
      v.y *= 0.85
      v.x += cx
      v.y += cy
      v.z += cz
      pos.setXYZ(k, v.x, v.y, v.z)
      // soft "fluffy" normals: mostly the direction from the crown centre, a bit of the clump's own roundness
      n.copy(v).sub(crownC).normalize().multiplyScalar(0.65).add(nrm.multiplyScalar(0.35)).normalize()
      nor.setXYZ(k, n.x, n.y, n.z)
    }
    const sg = strip(sphere)
    setColor(sg, () => [1, 1, 1])
    geos.push(sg)
  }
  const barkVerts = geos.slice(0, 4).reduce((a, g) => a + g.attributes.position.count, 0)
  const g = mergeGeometries(geos, false)!
  // colour the crown after merging so shading follows its overall shape
  const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute)
  let vi = 0
  setColor(g, (p, n) => {
    if (vi++ < barkVerts) return [bark.r, bark.g, bark.b]
    const hy = smoothstep(box.min.y, box.max.y, p.y)
    const outward = Math.hypot(p.x, p.z) / 0.45
    const up = n.y * 0.5 + 0.5
    const ao = 0.45 + 0.55 * smoothstep(0, 1, hy * 0.7 + outward * 0.4)
    const c = new THREE.Color().copy(dark).lerp(mid, smoothstep(0.15, 0.6, hy * 0.6 + up * 0.5)).lerp(light, smoothstep(0.55, 0.95, up * 0.6 + hy * 0.5) * 0.85)
    const k = ao * (0.95 + 0.1 * Math.sin(p.x * 30 + p.z * 23))
    return [c.r * k, c.g * k, c.b * k]
  })
  g.computeBoundingSphere()
  return g
}

/** Low bush: a squashed version of the oak crown without trunk. */
export function bushGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2
    const rad = i === 0 ? 0 : 0.2 + rnd() * 0.15
    const s = i === 0 ? 0.36 : 0.22 + rnd() * 0.12
    const sphere = new THREE.IcosahedronGeometry(s, 2)
    const pos = sphere.attributes.position
    const nor = sphere.attributes.normal
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    const off = rnd() * 50
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k)
      const nrm = v.clone().normalize()
      v.multiplyScalar(1 + 0.2 * n3(nrm.x * 2.5 + off, nrm.y * 2.5, nrm.z * 2.5))
      v.set(v.x + Math.cos(a) * rad, v.y * 0.8 + s * 0.6, v.z + Math.sin(a) * rad)
      pos.setXYZ(k, v.x, v.y, v.z)
      n.set(v.x, v.y - 0.15, v.z).normalize().multiplyScalar(0.6).add(nrm.multiplyScalar(0.4)).normalize()
      nor.setXYZ(k, n.x, n.y, n.z)
    }
    geos.push(strip(sphere))
  }
  const g = mergeGeometries(geos, false)!
  const light = lin('#98ad58')
  const dark = lin('#3d5a2a')
  setColor(g, (p, n) => {
    const up = n.y * 0.5 + 0.5
    const c = new THREE.Color().copy(dark).lerp(light, smoothstep(0.1, 0.9, up * 0.7 + p.y * 0.8))
    return [c.r, c.g, c.b]
  })
  g.computeBoundingSphere()
  return g
}

/** Weathered granite boulder of radius ~1. */
export function rockGeometry(seed: number, flat = 0.7): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const g = new THREE.IcosahedronGeometry(1, 3)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const off = rnd() * 100
  const sq = [0.8 + rnd() * 0.5, flat, 0.8 + rnd() * 0.4]
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const d = 1 + 0.26 * n3(n.x * 1.4 + off, n.y * 1.4, n.z * 1.4) + 0.07 * n3(n.x * 4 + off, n.y * 4, n.z * 4)
    v.multiplyScalar(d)
    v.x *= sq[0]
    v.y *= sq[1]
    v.z *= sq[2]
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  // weld the polyhedron's duplicated vertices so the boulder gets smooth, rounded shading
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const welded = mergeVertices(g, 1e-4)
  welded.computeVertexNormals()
  const ni = welded.toNonIndexed()
  // triplanar-ish uvs
  const p2 = ni.attributes.position
  const uv = new Float32Array(p2.count * 2)
  for (let i = 0; i < p2.count; i++) {
    uv[i * 2] = (p2.getX(i) + p2.getZ(i)) * 0.35
    uv[i * 2 + 1] = p2.getY(i) * 0.35 + p2.getZ(i) * 0.1
  }
  ni.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const base = lin('#bcb6ad')
  const moss = lin('#8d9a60')
  setColor(ni, (p, n) => {
    const top = smoothstep(0.55, 0.95, n.y)
    const shade = 0.8 + 0.25 * sn.noise(p.x * 2 + off, p.z * 2 + p.y)
    const c = new THREE.Color().copy(base).lerp(moss, top * 0.55)
    return [c.r * shade, c.g * shade, c.b * shade]
  })
  ni.computeBoundingSphere()
  return ni
}

/** A tuft of grass blades (height ~1, scaled per instance). */
export function grassTuftGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const pos: number[] = []
  const col: number[] = []
  const base = lin('#4f6b2c')
  const tipC = lin('#b9c46a')
  const blades = 7
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2
    const r = rnd() * 0.25
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const h = 0.6 + rnd() * 0.4
    const w = 0.07
    const lean = (rnd() - 0.5) * 0.5
    const dir = rnd() * Math.PI
    const dx = Math.cos(dir) * w
    const dz = Math.sin(dir) * w
    const tx = x + Math.cos(a) * lean * 0.5
    const tz = z + Math.sin(a) * lean * 0.5
    pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, tx, h, tz)
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tipC.r, tipC.g, tipC.b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  // normals pointing up give soft, even lighting on thin blades
  const nor = new Float32Array(pos.length)
  for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.computeBoundingSphere()
  return g
}

/** Small flower head (instanced with per-instance colour). */
export function flowerGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4)
  stem.translate(0, 0.15, 0)
  const head = new THREE.IcosahedronGeometry(0.07, 0)
  head.translate(0, 0.32, 0)
  const g = mergeGeometries([strip(stem), strip(head)], false)!
  // stems green, heads white (tinted per instance)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const head = pos.getY(i) > 0.27
    col[i * 3] = head ? 1 : 0.28
    col[i * 3 + 1] = head ? 1 : 0.45
    col[i * 3 + 2] = head ? 1 : 0.2
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export function stumpGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.2, 0.26, 0.35, 9)
  g.translate(0, 0.17, 0)
  const top = new THREE.CircleGeometry(0.2, 9)
  top.rotateX(-Math.PI / 2)
  top.translate(0, 0.351, 0)
  const bark = lin('#5e4636')
  const ring = lin('#c9a77c')
  const a = strip(g)
  const b = strip(top)
  setColor(a, () => [bark.r, bark.g, bark.b])
  setColor(b, () => [ring.r, ring.g, ring.b])
  return mergeGeometries([a, b], false)!
}
