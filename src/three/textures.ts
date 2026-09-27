// Procedurally painted textures (colour + normal maps) generated on canvases at start-up.
// Every texture tiles seamlessly; UVs in the models are in metres * 0.5 (one tile = 2 m).

import * as THREE from 'three'
import { clamp, makeTileableNoise, mulberry32, smoothstep } from '../game/noise'
import { timed } from '../game/perf'

type RGB = [number, number, number]

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** Paint a float RGB buffer (0..1) into a canvas. */
function rgbCanvas(rgb: Float32Array, w: number, h: number): HTMLCanvasElement {
  const c = newCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = clamp(rgb[i * 3] * 255, 0, 255)
    img.data[i * 4 + 1] = clamp(rgb[i * 3 + 1] * 255, 0, 255)
    img.data[i * 4 + 2] = clamp(rgb[i * 3 + 2] * 255, 0, 255)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Tangent-space normal map (OpenGL convention, flipY textures) from a wrapping height buffer. */
function normalCanvas(hgt: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const c = newCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w
    const yd = ((y + 1) % h) * w
    for (let x = 0; x < w; x++) {
      const l = hgt[y * w + ((x - 1 + w) % w)]
      const r = hgt[y * w + ((x + 1) % w)]
      const u = hgt[yu + x]
      const d = hgt[yd + x]
      let nx = -(r - l) * strength
      let ny = (d - u) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const k = (y * w + x) * 4
      img.data[k] = (nx * 0.5 + 0.5) * 255
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export interface TexSet {
  map: THREE.Texture
  normalMap: THREE.Texture
}

function finish(rgb: Float32Array, hgt: Float32Array, S: number, strength: number): TexSet {
  return {
    map: toTexture(rgbCanvas(rgb, S, S), true),
    normalMap: toTexture(normalCanvas(hgt, S, S, strength), false),
  }
}

/** Split [0,S) into wrapping segments with random widths; returns sorted cut positions. */
function cuts(rnd: () => number, S: number, minW: number, maxW: number): number[] {
  const start = rnd() * S
  const out: number[] = []
  let x = 0
  while (x < S - minW) {
    out.push((start + x) % S)
    x += minW + rnd() * (maxW - minW)
  }
  return out.sort((a, b) => a - b)
}

/** Index of the segment containing x and the distance to its nearest cut (wrapping). */
function segmentOf(cutsArr: number[], x: number, S: number): [number, number, number] {
  let idx = cutsArr.length - 1
  for (let i = 0; i < cutsArr.length; i++) {
    if (cutsArr[i] > x) {
      idx = i - 1
      break
    }
  }
  if (idx < 0) idx = cutsArr.length - 1
  const a = cutsArr[idx]
  const b = cutsArr[(idx + 1) % cutsArr.length]
  const da = (x - a + S) % S
  const db = (b - x + S) % S
  return [idx, da, db]
}

// ---------------------------------------------------------------------------

export function makePlanks(opts: {
  seed: number
  rows: number
  palette: string[]
  S?: number
  gap?: number
  jointsPerRow?: number
  grain?: number
}): TexSet {
  const S = opts.S ?? 512
  const rnd = mulberry32(opts.seed)
  const tn = makeTileableNoise(opts.seed + 7)
  const rows = opts.rows
  const rh = S / rows
  const gap = opts.gap ?? 2.5
  const grainAmt = opts.grain ?? 1
  const pal = opts.palette.map(hex)
  const rowInfo = Array.from({ length: rows }, () => {
    const joints = cuts(rnd, S, S * 0.35, S * 1.1)
    const tones = joints.map(() => {
      const c = pal[Math.floor(rnd() * pal.length)]
      const b = 0.9 + rnd() * 0.2
      return [c[0] * b, c[1] * b, c[2] * b] as RGB
    })
    return { joints, tones }
  })
  const rgb = new Float32Array(S * S * 3)
  const hgt = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const r = Math.min(rows - 1, Math.floor(y / rh))
    const ly = y - r * rh
    const info = rowInfo[r]
    const dTop = ly
    const dBot = rh - 1 - ly
    for (let x = 0; x < S; x++) {
      const [seg, da, db] = segmentOf(info.joints, x, S)
      const tone = info.tones[seg]
      const u = x / S
      const v = y / S
      const g1 = tn(u, v, 3, rows * 6, 4, 0.55)
      const g2 = tn(u + 0.37, v + 0.11, 12, rows * 24, 3, 0.5)
      const ring = Math.sin((v * rows * 9 + g1 * 6 + u * 1.5) * Math.PI * 2) * 0.5 + 0.5
      let f = 0.8 + 0.28 * g1 + 0.1 * (g2 - 0.5) * grainAmt + 0.06 * ring * grainAmt
      const edge = Math.min(dTop, dBot - gap)
      f *= 0.78 + 0.22 * smoothstep(0, 4, edge)
      const dj = Math.min(da, db)
      let h = smoothstep(0, 3.5, dTop) * smoothstep(0, 3.5, dBot - gap) * smoothstep(0, 2.5, dj)
      if (dBot < gap || dj < 1.2) {
        f *= 0.35
        h = 0
      } else if (dj < 3) f *= 0.85
      // occasional knot
      const k = y * S + x
      rgb[k * 3] = tone[0] * f
      rgb[k * 3 + 1] = tone[1] * f
      rgb[k * 3 + 2] = tone[2] * f
      hgt[k] = h * 1.0 + g2 * 0.12 * grainAmt
    }
  }
  return finish(rgb, hgt, S, 2.2)
}

export function makeShingles(opts: { seed: number; rows: number; S?: number; tint?: string; variance?: number }): TexSet {
  const S = opts.S ?? 512
  const rnd = mulberry32(opts.seed)
  const tn = makeTileableNoise(opts.seed + 3)
  const rows = opts.rows
  const rh = S / rows
  const tint = hex(opts.tint ?? '#efe6da')
  const variance = opts.variance ?? 1
  const rowInfo = Array.from({ length: rows }, () => {
    const c = cuts(rnd, S, 26, 60)
    const tones = c.map(() => {
      const b = 0.72 + rnd() * 0.3 * variance
      const warm = (rnd() - 0.5) * 0.08 * variance
      return [b + warm, b, b - warm] as RGB
    })
    return { c, tones }
  })
  const rgb = new Float32Array(S * S * 3)
  const hgt = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const r = Math.min(rows - 1, Math.floor(y / rh))
    const ly = y - r * rh
    const t = ly / rh
    const info = rowInfo[r]
    for (let x = 0; x < S; x++) {
      const [seg, da, db] = segmentOf(info.c, x, S)
      const tone = info.tones[seg]
      const u = x / S
      const v = y / S
      const g = tn(u, v, 48, 4, 3, 0.5)
      let f = (0.62 + 0.38 * t) * (0.86 + 0.24 * g)
      f *= 0.55 + 0.45 * smoothstep(0, 8, ly) // shadow cast by the course above
      if (ly > rh - 3) f *= 1.06
      const dj = Math.min(da, db)
      let h = t * 0.9 + g * 0.08
      if (dj < 1.5) {
        f *= 0.4
        h -= 0.3
      } else if (dj < 3) f *= 0.82
      const k = y * S + x
      rgb[k * 3] = tint[0] * tone[0] * f
      rgb[k * 3 + 1] = tint[1] * tone[1] * f
      rgb[k * 3 + 2] = tint[2] * tone[2] * f
      hgt[k] = h
    }
  }
  return finish(rgb, hgt, S, 3.0)
}

export function makeStone(opts: { seed: number; S?: number; rowsMin?: number; rowsMax?: number; tint?: string; mortar?: string }): TexSet {
  const S = opts.S ?? 512
  const rnd = mulberry32(opts.seed)
  const tn = makeTileableNoise(opts.seed + 11)
  const tint = hex(opts.tint ?? '#d9d4cc')
  const mortar = hex(opts.mortar ?? '#8e8880')
  // rows of varying height summing exactly to S
  const heightsArr: number[] = []
  let acc = 0
  const rMin = opts.rowsMin ?? 44
  const rMax = opts.rowsMax ?? 72
  while (acc < S) {
    let hRow = rMin + rnd() * (rMax - rMin)
    if (S - acc - hRow < rMin) hRow = S - acc
    heightsArr.push(hRow)
    acc += hRow
  }
  const rowStart: number[] = []
  acc = 0
  for (const hRow of heightsArr) {
    rowStart.push(acc)
    acc += hRow
  }
  const k = S / 512
  const rowInfo = heightsArr.map(() => {
    const c = cuts(rnd, S, 60 * k, 150 * k)
    const tones = c.map(() => {
      const b = 0.72 + rnd() * 0.32
      const hue = (rnd() - 0.5) * 0.07
      return [b + hue, b + hue * 0.3, b - hue * 0.6] as RGB
    })
    return { c, tones }
  })
  const rgb = new Float32Array(S * S * 3)
  const hgt = new Float32Array(S * S)
  let r = 0
  for (let y = 0; y < S; y++) {
    while (r < heightsArr.length - 1 && y >= rowStart[r] + heightsArr[r]) r++
    const ly = y - rowStart[r]
    const rh = heightsArr[r]
    const info = rowInfo[r]
    for (let x = 0; x < S; x++) {
      const [seg, da, db] = segmentOf(info.c, x, S)
      const tone = info.tones[seg]
      const u = x / S
      const v = y / S
      const n1 = tn(u, v, 8, 8, 5, 0.55)
      const n2 = tn(u + 0.5, v + 0.25, 64, 64, 2, 0.5)
      const edge = (Math.min(ly, rh - ly, da, db) + (n1 - 0.5) * 5 * k) / Math.max(k, 0.6)
      const inner = smoothstep(1.5, 7, edge)
      const idx = y * S + x
      if (edge < 2.2) {
        const m = 0.85 + 0.2 * n2
        rgb[idx * 3] = mortar[0] * m
        rgb[idx * 3 + 1] = mortar[1] * m
        rgb[idx * 3 + 2] = mortar[2] * m
        hgt[idx] = 0
      } else {
        const f = (0.82 + 0.28 * n1 + 0.1 * (n2 - 0.5)) * (0.86 + 0.14 * inner)
        rgb[idx * 3] = tint[0] * tone[0] * f
        rgb[idx * 3 + 1] = tint[1] * tone[1] * f
        rgb[idx * 3 + 2] = tint[2] * tone[2] * f
        hgt[idx] = 0.35 + 0.65 * inner + n1 * 0.25
      }
    }
  }
  return finish(rgb, hgt, S, 2.6)
}

export function makeThatch(seed: number): TexSet {
  const S = 256
  const tn = makeTileableNoise(seed)
  const rgb = new Float32Array(S * S * 3)
  const hgt = new Float32Array(S * S)
  const base = hex('#d9c08a')
  const rows = 5
  for (let y = 0; y < S; y++) {
    const ly = (y % (S / rows)) / (S / rows)
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const s1 = tn(u, v, 96, 3, 3, 0.5)
      const s2 = tn(u + 0.3, v, 180, 6, 2, 0.5)
      let f = 0.7 + 0.35 * s1 + 0.15 * s2
      f *= 0.7 + 0.3 * ly
      const k = y * S + x
      rgb[k * 3] = base[0] * f
      rgb[k * 3 + 1] = base[1] * f * 0.97
      rgb[k * 3 + 2] = base[2] * f * 0.9
      hgt[k] = s1 * 0.6 + s2 * 0.3 + ly * 0.5
    }
  }
  return finish(rgb, hgt, S, 2.5)
}

/** Bumpy "leaf clump" normal map for tree canopies and bushes. */
export function makeLeafNormal(seed: number): THREE.Texture {
  const S = 256
  const rnd = mulberry32(seed)
  const hgt = new Float32Array(S * S)
  const blobs = 220
  for (let b = 0; b < blobs; b++) {
    const cx = rnd() * S
    const cy = rnd() * S
    const rad = 6 + rnd() * 12
    const x0 = Math.floor(cx - rad)
    const x1 = Math.ceil(cx + rad)
    const y0 = Math.floor(cy - rad)
    const y1 = Math.ceil(cy + rad)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        const dy = y - cy
        const d2 = (dx * dx + dy * dy) / (rad * rad)
        if (d2 >= 1) continue
        const hv = Math.sqrt(1 - d2) * rad * 0.1
        const k = (((y % S) + S) % S) * S + (((x % S) + S) % S)
        if (hv > hgt[k]) hgt[k] = hv
      }
    }
  }
  return toTexture(normalCanvas(hgt, S, S, 1.6), false)
}

/** Grey-scale tiling detail noise; R = fine, G = medium, B = streaky (rock strata). */
export function makeDetail(seed: number): THREE.Texture {
  const S = 256
  const tn = makeTileableNoise(seed)
  const c = newCanvas(S, S)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const k = (y * S + x) * 4
      img.data[k] = tn(u, v, 16, 16, 4, 0.55) * 255
      img.data[k + 1] = tn(u + 0.21, v + 0.63, 4, 4, 5, 0.55) * 255
      img.data[k + 2] = tn(u + 0.71, v + 0.13, 3, 24, 4, 0.6) * 255
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(c, false)
}

/** Seamless water ripple normal map built from a sum of periodic waves. */
export function makeWaterNormal(seed: number): THREE.Texture {
  const S = 256
  const rnd = mulberry32(seed)
  const waves: [number, number, number, number][] = []
  for (let i = 0; i < 42; i++) {
    let kx = 0
    let ky = 0
    while (kx === 0 && ky === 0) {
      kx = Math.round((rnd() * 2 - 1) * (2 + i * 0.35))
      ky = Math.round((rnd() * 2 - 1) * (2 + i * 0.35))
    }
    const k = Math.hypot(kx, ky)
    waves.push([kx, ky, 1 / Math.pow(k, 1.25), rnd() * Math.PI * 2])
  }
  const hgt = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      let h = 0
      for (const [kx, ky, a, ph] of waves) h += a * Math.sin((kx * u + ky * v) * Math.PI * 2 + ph)
      // sharpen crests a little
      hgt[y * S + x] = h
    }
  }
  let mn = Infinity
  let mx = -Infinity
  for (const h of hgt) {
    mn = Math.min(mn, h)
    mx = Math.max(mx, h)
  }
  for (let i = 0; i < hgt.length; i++) {
    const t = (hgt[i] - mn) / (mx - mn)
    hgt[i] = Math.pow(t, 1.4) * 14
  }
  return toTexture(normalCanvas(hgt, S, S, 1.0), false)
}

/** Speckled granite for boulders (seamless). */
export function makeGranite(seed: number): TexSet {
  const S = 256
  const rnd = mulberry32(seed)
  const tn = makeTileableNoise(seed)
  const rgb = new Float32Array(S * S * 3)
  const hgt = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const big = tn(u, v, 4, 4, 5, 0.55)
      const mid = tn(u + 0.3, v + 0.7, 16, 16, 3, 0.5)
      const speck = rnd()
      let f = 0.78 + 0.3 * big + 0.12 * (mid - 0.5)
      if (speck > 0.93) f *= 0.72
      else if (speck < 0.05) f *= 1.12
      const k = y * S + x
      rgb[k * 3] = f * 0.93
      rgb[k * 3 + 1] = f * 0.91
      rgb[k * 3 + 2] = f * 0.88
      hgt[k] = big * 1.4 + mid * 0.5 + (speck > 0.93 ? -0.08 : 0)
    }
  }
  return finish(rgb, hgt, S, 2.0)
}

// ---------------------------------------------------------------------------

export interface TextureBank {
  wallPlanks: TexSet
  darkPlanks: TexSet
  deckPlanks: TexSet
  shingles: TexSet
  stone: TexSet
  roughStone: TexSet
  thatch: TexSet
  granite: TexSet
  leaf: THREE.Texture
  detail: THREE.Texture
  water: THREE.Texture
}

let bank: TextureBank | null = null

export function getTextures(): TextureBank {
  if (bank) return bank
  bank = timed('textures', () => ({
    wallPlanks: makePlanks({
      seed: 3,
      rows: 8,
      palette: ['#8c5b37', '#94633e', '#7f5233', '#9c6b45', '#86573a', '#a0714a'],
    }),
    darkPlanks: makePlanks({ seed: 9, rows: 6, S: 256, gap: 1.5, palette: ['#6e4428', '#77492b', '#633d24', '#7d5131'] }),
    deckPlanks: makePlanks({ seed: 21, rows: 7, S: 256, gap: 1.8, palette: ['#a57a52', '#9a714b', '#b0875e', '#8f6947'] }),
    shingles: makeShingles({ seed: 5, rows: 10 }),
    stone: makeStone({ seed: 7 }),
    roughStone: makeStone({ seed: 17, S: 256, rowsMin: 18, rowsMax: 30, tint: '#cfc9c0', mortar: '#7c776f' }),
    thatch: makeThatch(13),
    granite: makeGranite(43),
    leaf: makeLeafNormal(29),
    detail: makeDetail(31),
    water: makeWaterNormal(37),
  }))
  return bank
}
