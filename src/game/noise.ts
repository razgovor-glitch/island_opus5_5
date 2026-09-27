// Deterministic noise + random helpers used by world generation and procedural textures.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1])

/** Classic 2D simplex noise, output roughly in [-1, 1]. */
export class Simplex2 {
  private perm = new Uint8Array(512)

  constructor(seed = 1) {
    const rnd = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  noise(x: number, y: number): number {
    const perm = this.perm
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    let i1 = 0
    let j1 = 1
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    }
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    let n = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = (perm[ii + perm[jj]] & 7) * 2
      t0 *= t0
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2
      t1 *= t1
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2
      t2 *= t2
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2)
    }
    return 70 * n
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq + o * 17.13, y * freq - o * 9.71)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }

  /** Ridged multifractal in [0, 1]: sharp crests, useful for rock. */
  ridged(x: number, y: number, octaves = 4): number {
    let amp = 0.5
    let freq = 1
    let sum = 0
    let norm = 0
    let prev = 1
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise(x * freq + o * 31.7, y * freq + o * 5.3))
      n *= n
      sum += n * amp * prev
      norm += amp
      prev = n
      amp *= 0.5
      freq *= 2.03
    }
    return sum / norm
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Polynomial smooth minimum (for blending signed distance fields). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/**
 * Tileable value-noise fbm over the unit square [0,1)^2. `pu`/`pv` are the integer lattice
 * periods of the first octave along u and v (different values give streaky, grain-like noise).
 * Output in [0, 1].
 */
export function makeTileableNoise(seed: number) {
  const rnd = mulberry32(seed)
  const table = new Float32Array(4096)
  for (let i = 0; i < table.length; i++) table[i] = rnd()
  const hash = (x: number, y: number) => table[(Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & 4095]
  const value = (x: number, y: number, px: number, py: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const x0 = ((xi % px) + px) % px
    const y0 = ((yi % py) + py) % py
    const x1 = (x0 + 1) % px
    const y1 = (y0 + 1) % py
    const a = hash(x0, y0)
    const b = hash(x1, y0)
    const c = hash(x0, y1)
    const d = hash(x1, y1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  return (u: number, v: number, pu = 4, pv = 4, octaves = 5, gain = 0.5) => {
    let amp = 1
    let sum = 0
    let norm = 0
    let a = pu
    let b = pv
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(u * a + o * 13, v * b + o * 7, a, b)
      norm += amp
      amp *= gain
      a *= 2
      b *= 2
    }
    return sum / norm
  }
}
