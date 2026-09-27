// Small geometry toolkit for building the procedural models.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

export function mat(p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1], order: THREE.EulerOrder = 'XYZ'): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p[0], p[1], p[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)),
    new THREE.Vector3(s[0], s[1], s[2]),
  )
}

export function mul(...ms: THREE.Matrix4[]): THREE.Matrix4 {
  const out = new THREE.Matrix4()
  for (const m of ms) out.multiply(m)
  return out
}

/**
 * Planar ("box") UV projection in the geometry's local space, in metres * scale.
 * Faces pointing mostly along ±y use (x, z); along ±x use (z, y); along ±z use (x, y).
 * `swap` exchanges u and v (e.g. vertical planks on a door).
 */
export function planarUV(g: THREE.BufferGeometry, scale = 0.5, swap = false, offset: Vec2 = [0, 0]): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  if (!geo.attributes.normal) geo.computeVertexNormals()
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  // decide per triangle using the face normal so all three vertices share a projection
  for (let i = 0; i < pos.count; i += 3) {
    let nx = 0
    let ny = 0
    let nz = 0
    for (let k = 0; k < 3; k++) {
      nx += nor.getX(i + k)
      ny += nor.getY(i + k)
      nz += nor.getZ(i + k)
    }
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    const az = Math.abs(nz)
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k)
      const y = pos.getY(i + k)
      const z = pos.getZ(i + k)
      let u: number
      let v: number
      if (ay >= ax && ay >= az) {
        u = x
        v = z
      } else if (ax >= az) {
        u = nx > 0 ? -z : z
        v = y
      } else {
        u = nz > 0 ? x : -x
        v = y
      }
      if (swap) {
        const t = u
        u = v
        v = t
      }
      uv[(i + k) * 2] = u * scale + offset[0]
      uv[(i + k) * 2 + 1] = v * scale + offset[1]
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/** Triangle soup builder with flat normals and explicit UVs. */
export class MeshData {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  color: Vec3 | null = null

  tri(a: Vec3, b: Vec3, c: Vec3, ua: Vec2, ub: Vec2, uc: Vec2, outward?: Vec3) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let nx = e1[1] * e2[2] - e1[2] * e2[1]
    let ny = e1[2] * e2[0] - e1[0] * e2[2]
    let nz = e1[0] * e2[1] - e1[1] * e2[0]
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    if (outward && nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) {
      ;[b, c] = [c, b]
      ;[ub, uc] = [uc, ub]
      nx = -nx
      ny = -ny
      nz = -nz
    }
    this.pos.push(...a, ...b, ...c)
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    this.uv.push(...ua, ...ub, ...uc)
    if (this.color) this.col.push(...this.color, ...this.color, ...this.color)
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, ua: Vec2, ub: Vec2, uc: Vec2, ud: Vec2, outward?: Vec3) {
    this.tri(a, b, c, ua, ub, uc, outward)
    this.tri(a, c, d, ua, uc, ud, outward)
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    return g
  }
}

/** Collects geometry per material key, then merges each group into one BufferGeometry. */
export class Parts {
  groups = new Map<string, THREE.BufferGeometry[]>()
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()]

  get top() {
    return this.stack[this.stack.length - 1]
  }

  /** Run `fn` with an extra transform applied to everything added inside it. */
  with(m: THREE.Matrix4, fn: () => void) {
    this.stack.push(this.top.clone().multiply(m))
    fn()
    this.stack.pop()
  }

  add(key: string, geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    const full = m ? this.top.clone().multiply(m) : this.top
    g.applyMatrix4(full)
    if (!g.attributes.uv) {
      g = planarUV(g, 0.5)
    }
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name)
    }
    g.morphAttributes = {}
    let list = this.groups.get(key)
    if (!list) {
      list = []
      this.groups.set(key, list)
    }
    list.push(g)
    return this
  }

  /** Box with planar UVs (metres * 0.5) centred at `p`. */
  box(key: string, size: Vec3, p: Vec3, r: Vec3 = [0, 0, 0], uvScale = 0.5, swap = false, uvOffset: Vec2 = [0, 0]) {
    const g = planarUV(new THREE.BoxGeometry(size[0], size[1], size[2]), uvScale, swap, uvOffset)
    return this.add(key, g, mat(p, r))
  }

  cyl(key: string, rTop: number, rBot: number, h: number, p: Vec3, r: Vec3 = [0, 0, 0], seg = 10, uvScale = 0.5) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg)
    const uv = g.attributes.uv
    const circ = Math.PI * 2 * Math.max(rTop, rBot)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * uvScale, uv.getY(i) * h * uvScale)
    return this.add(key, g, mat(p, r))
  }

  merge(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>()
    for (const [key, list] of this.groups) {
      const needColor = list.some((g) => g.attributes.color)
      if (needColor) {
        for (const g of list) {
          if (!g.attributes.color) {
            const c = new Float32Array(g.attributes.position.count * 3).fill(1)
            g.setAttribute('color', new THREE.BufferAttribute(c, 3))
          }
        }
      }
      const merged = mergeGeometries(list, false)
      if (merged) {
        merged.computeBoundingSphere()
        merged.computeBoundingBox()
        out.set(key, merged)
      }
      for (const g of list) g.dispose()
    }
    this.groups.clear()
    return out
  }
}

/** Add a flat vertex colour to a geometry. */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

/** Displace every vertex of a (non-indexed-safe) geometry by a function of its position. */
export function displace(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    fn(v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  return g
}

/** Reverse the winding and normals of a geometry (to see a surface from the other side). */
export function flipGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name] as THREE.BufferAttribute
    for (let i = 0; i < a.count; i += 3) {
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.getComponent(i + 1, c)
        a.setComponent(i + 1, c, a.getComponent(i + 2, c))
        a.setComponent(i + 2, c, t)
      }
    }
  }
  const n = geo.attributes.normal as THREE.BufferAttribute | undefined
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  return geo
}
