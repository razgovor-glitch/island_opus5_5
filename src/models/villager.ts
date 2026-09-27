// Chunky little villagers, split into parts so they can be animated with instancing.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const V_DIMS = {
  hipY: 0.46,
  hipX: 0.095,
  shoulderY: 0.86,
  shoulderX: 0.235,
  headY: 1.1,
}

function colorize(g: THREE.BufferGeometry, c: [number, number, number]) {
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set(c, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function clean(g: THREE.BufferGeometry) {
  const o = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k)
  return o
}

export interface VillagerGeos {
  head: THREE.BufferGeometry // vertex coloured: white skin (instance-tinted) + dark eyes
  hat: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  arm: THREE.BufferGeometry // pivot at the shoulder
  leg: THREE.BufferGeometry // pivot at the hip
  tool: THREE.BufferGeometry // held in the right hand, pivot at the grip
  load: THREE.BufferGeometry // log / stone carried on the shoulder
}

let geos: VillagerGeos | null = null

export function getVillagerGeos(): VillagerGeos {
  if (geos) return geos
  const head = clean(new THREE.SphereGeometry(0.19, 16, 12))
  head.scale(1, 0.95, 1)
  head.translate(0, V_DIMS.headY, 0)
  colorize(head, [1, 1, 1])
  const nose = clean(new THREE.SphereGeometry(0.045, 8, 6))
  nose.translate(0, V_DIMS.headY - 0.02, 0.185)
  colorize(nose, [1, 0.93, 0.9])
  const eyes: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const e = clean(new THREE.SphereGeometry(0.024, 6, 5))
    e.translate(sx * 0.07, V_DIMS.headY + 0.03, 0.172)
    eyes.push(colorize(e, [0.08, 0.06, 0.05]))
  }
  const cheeks: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const c = clean(new THREE.SphereGeometry(0.035, 6, 5))
    c.scale(1, 0.7, 0.4)
    c.translate(sx * 0.11, V_DIMS.headY - 0.04, 0.155)
    cheeks.push(colorize(c, [1.0, 0.72, 0.68]))
  }
  const headAll = mergeGeometries([head, nose, ...eyes, ...cheeks], false)!

  const hat = clean(new THREE.SphereGeometry(0.205, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5))
  hat.scale(1, 0.72, 1)
  hat.translate(0, V_DIMS.headY + 0.03, -0.01)
  const brim = clean(new THREE.CylinderGeometry(0.215, 0.215, 0.03, 14))
  brim.translate(0, V_DIMS.headY + 0.03, -0.01)
  const hatAll = mergeGeometries([hat, brim], false)!

  const profile = [
    [0.0, 0.4],
    [0.19, 0.41],
    [0.235, 0.47],
    [0.225, 0.58],
    [0.2, 0.72],
    [0.19, 0.84],
    [0.14, 0.92],
    [0.06, 0.95],
    [0.0, 0.955],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const torso = clean(new THREE.LatheGeometry(profile, 14))
  const belt = clean(new THREE.CylinderGeometry(0.228, 0.232, 0.05, 14))
  belt.translate(0, 0.52, 0)
  colorize(torso, [1, 1, 1])
  colorize(belt, [0.35, 0.24, 0.16])
  const torsoAll = mergeGeometries([torso, belt], false)!

  const arm = clean(new THREE.CapsuleGeometry(0.056, 0.28, 3, 8))
  arm.translate(0, -0.17, 0)
  colorize(arm, [1, 1, 1])
  const hand = clean(new THREE.SphereGeometry(0.058, 8, 6))
  hand.translate(0, -0.35, 0)
  colorize(hand, [0.93, 0.72, 0.58])
  const armAll = mergeGeometries([arm, hand], false)!

  const leg = clean(new THREE.CapsuleGeometry(0.07, 0.28, 3, 8))
  leg.translate(0, -0.2, 0)
  colorize(leg, [1, 1, 1])
  const boot = clean(new THREE.SphereGeometry(0.08, 8, 6))
  boot.scale(1, 0.7, 1.35)
  boot.translate(0, -0.41, 0.03)
  colorize(boot, [0.3, 0.22, 0.16])
  const legAll = mergeGeometries([leg, boot], false)!

  const handle = clean(new THREE.CylinderGeometry(0.018, 0.02, 0.62, 6))
  handle.translate(0, 0.2, 0)
  colorize(handle, [0.55, 0.38, 0.22])
  const blade = clean(new THREE.BoxGeometry(0.035, 0.12, 0.2))
  blade.translate(0, 0.46, 0.08)
  colorize(blade, [0.55, 0.56, 0.58])
  const toolAll = mergeGeometries([handle, blade], false)!

  const log = clean(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8))
  log.rotateX(Math.PI / 2)
  colorize(log, [0.5, 0.35, 0.22])
  geos = { head: headAll, hat: hatAll, torso: torsoAll, arm: armAll, leg: legAll, tool: toolAll, load: log }
  return geos
}
