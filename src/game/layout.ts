// Static, hand-authored layout of the island village (world units ~ metres).
// +x = east (screen right in the default view), +z = south (towards the default camera).

export type V2 = [number, number]

export interface HouseStyle {
  w: number // width across the ridge
  d: number // length along the ridge
  h: number // wall height
  roofH: number // roof rise above the walls
  chimney: number // -1 | 0 | 1 : which slope carries the chimney (0 = none)
  dormer: boolean
  wing: boolean
  seed: number
}

export interface HouseDef {
  id: string
  x: number
  z: number
  rot: number // yaw; local +z (door gable) faces (sin rot, cos rot)
  style: HouseStyle
}

export const HILL = { x: 1, z: -25, r: 17.5, h: 20 }

// Blobs whose smooth union forms the island's coastline: [x, z, radius]
export const ISLAND_BLOBS: [number, number, number][] = [
  [0, -3, 22],
  [1, -25, 19],
  [-20, -5, 13],
  [-25, 7, 8],
  [22, -2, 13],
  [27, 8, 8],
  [18, 12, 9],
  [-13, 14, 11],
  [3, 15, 12.5],
]

const style = (s: Partial<HouseStyle> & { seed: number }): HouseStyle => ({
  w: 4.6,
  d: 5.6,
  h: 2.7,
  roofH: 2.5,
  chimney: 1,
  dormer: false,
  wing: false,
  ...s,
})

export const HOUSES: HouseDef[] = [
  { id: 'h1', x: -7, z: -12.5, rot: 0.55, style: style({ seed: 11, dormer: true, chimney: -1 }) },
  { id: 'h2', x: 7.5, z: -11.5, rot: -0.6, style: style({ seed: 12, w: 4.4, d: 5.2, chimney: 1 }) },
  { id: 'h3', x: -9, z: -1.5, rot: 0.85, style: style({ seed: 13, w: 4.2, d: 5, h: 2.5, roofH: 2.3, chimney: 1 }) },
  { id: 'h4', x: 4.5, z: -1, rot: -0.45, style: style({ seed: 14, w: 4.8, d: 6, dormer: true, chimney: 1 }) },
  { id: 'h5', x: 14.5, z: -6, rot: 0.2, style: style({ seed: 15, w: 4.5, d: 5.4, chimney: -1 }) },
  { id: 'h6', x: 20, z: 4.5, rot: -1.45, style: style({ seed: 16, w: 5, d: 6.2, h: 2.9, roofH: 2.8, wing: true, dormer: true, chimney: 1 }) },
  { id: 'h7', x: -10.5, z: 10.5, rot: 1.75, style: style({ seed: 17, w: 5.2, d: 6.6, h: 2.9, roofH: 2.9, wing: true, chimney: -1 }) },
  { id: 'h8', x: 8.5, z: 11.5, rot: -1.9, style: style({ seed: 18, w: 5, d: 6.2, h: 2.8, roofH: 2.7, dormer: true, chimney: 1 }) },
]

export const CHURCH = { x: -19.5, z: -3.5, rot: 1.12 }

export interface PathDef {
  pts: V2[]
  width: number
}

export const PATHS: PathDef[] = [
  // main street from the beach up to the hill
  { width: 2.1, pts: [[1.5, 25.5], [1.2, 18], [0.5, 10], [0, 5], [-0.8, 0], [-1.5, -5], [-3.2, -8.5], [-4.5, -9.5]] },
  // east road
  { width: 1.8, pts: [[0.5, 10], [5, 8], [10, 6.5], [14.5, 4.8], [16.2, 1], [15.2, -2.2]] },
  // west road to the church
  { width: 1.8, pts: [[0, 5], [-4, 3.8], [-8, 4.8], [-12, 4.2], [-14.5, 3.8], [-16.2, 3.7]] },
  // north-east lane
  { width: 1.5, pts: [[-1.5, -5], [2.5, -6.8], [5, -7.5]] },
  // harbour road to the pier
  { width: 1.9, pts: [[1.2, 18], [6, 18.2], [10.5, 19.4], [13.5, 20.8]] },
  // south-west lane
  { width: 1.5, pts: [[0.5, 10], [-3.5, 9.8], [-6, 10.8]] },
]

// Pier from the beach heading out to sea
export const PIER = { x: 13.2, z: 20.2, rot: 0.42, length: 14, width: 2.6 }

export const MARKET = { x: 6.2, z: 21.8, rot: 0.15 }
export const WELL = { x: -5.5, z: 19.8 }

export const ROWBOAT_SPOTS = [
  { x: -3.2, z: 27.3, rot: -0.12 },
  { x: 0.3, z: 28.0, rot: 0.02 },
  { x: 3.8, z: 28.2, rot: 0.14 },
]

export const ANCHORED_SHIPS = [
  { x: -43, z: 4, rot: 1.35, scale: 1 },
  { x: -37, z: 29, rot: 0.95, scale: 0.95 },
  { x: 37, z: 19, rot: -0.35, scale: 1 },
]

// Stone deposits that villagers can quarry.
export const DEPOSITS: { x: number; z: number; size: number }[] = [
  { x: -13.5, z: -15.5, size: 1.2 },
  { x: 12.5, z: -16, size: 1.1 },
  { x: -26.5, z: 8.5, size: 1.0 },
  { x: 29.5, z: -12.5, size: 1.05 },
  { x: -2, z: -14.5, size: 0.9 },
]

// Small islands scattered around the main one: [x, z, radius, height, treeCount]
export const ISLETS: [number, number, number, number, number][] = [
  [-50, -17, 7, 6.5, 3],
  [55, -6, 8, 7, 4],
  [-66, -3, 3, 3, 0],
  [42, -38, 4, 4, 1],
  [-30, 44, 3.2, 2.5, 0],
  [-44, 70, 14, 5, 7],
  [54, 70, 13, 5, 6],
]

// Post-and-rail fences (world-space polylines)
export const FENCES: V2[][] = [
  [[-15.2, 14.6], [-12, 15.8], [-8.6, 15.4], [-7.4, 13.6]],
  [[11.8, 15.6], [13.4, 12.6], [13.8, 9.2]],
  [[8.8, 20.2], [9.6, 23.4]],
  [[10.6, -8.2], [11.6, -11.4], [11.2, -14.2]],
  [[23.4, 7.8], [24.2, 4.2], [23.8, 0.8]],
]

// Open meadows kept free of trees and boulders so there is room to build: [x, z, radius]
export const MEADOWS: [number, number, number][] = [
  [26, -5, 6.5],
  [28, 7.5, 5],
  [-19, 15.5, 5.5],
  [-27, -13, 5],
  [19, -13.5, 4],
  [-3, 13.5, 3.5],
]

// World-space centre of the playable area, used by the camera.
export const VILLAGE_CENTER: V2 = [1, -2]

// Returns the world position of a point given in a building's local frame.
export function localToWorld(bx: number, bz: number, rot: number, lx: number, lz: number): V2 {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [bx + lx * c + lz * s, bz - lx * s + lz * c]
}
