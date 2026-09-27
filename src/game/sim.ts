// Game simulation: villagers, jobs, fishing boats, the merchant ship, construction and economy.

import { BUILDINGS, QUESTS, TUNING, ResKey } from './config'
import { Offer, game, useGame } from './store'
import {
  BoatState,
  PlacedBuilding,
  boats,
  deposits,
  houses,
  market,
  pier,
  placed,
  randomPOI,
  trees,
} from './world'
import { addNavObstacle, findPath, nearestWalkable, Obstacle } from './nav'
import { getHeight } from './terrain'
import { localToWorld, PIER } from './layout'
import { sfx } from './audio'
import { buildingModel, BuildingType } from '../models/buildings'
import { mulberry32 } from './noise'

type Task =
  | { kind: 'wander' }
  | { kind: 'chop'; tree: number }
  | { kind: 'mine'; dep: number }
  | { kind: 'build'; bld: number }
  | { kind: 'deliver' }

export interface Villager {
  id: number
  x: number
  z: number
  y: number
  heading: number
  path: [number, number][]
  pi: number
  state: 'idle' | 'walk' | 'work'
  task: Task | null
  timer: number
  walkPhase: number
  workPhase: number
  speed: number
  shirt: number
  pants: number
  hat: number
  hasHat: boolean
  skin: number
  carrying: 'log' | 'stone' | null
  faceX: number
  faceZ: number
  moving: number // 0..1 blend for walk animation
}

interface Job {
  kind: 'chop' | 'mine'
  target: number
}

const rnd = mulberry32(777)
const SHIRTS = [0xb5483a, 0xc9663f, 0xe9e1cf, 0xd2b48c, 0x9c3b30, 0xd98a4e, 0x8a9a5b, 0xf0ead8, 0xa14a3a]
const PANTS = [0x4a3a2e, 0x5b4a3a, 0x3e3f46, 0x6b5642, 0x2f2a28]
const HATS = [0xf1ece0, 0xe8e2d4, 0xd8cfbd, 0x6b4a32, 0x8a6a48, 0xf4f0e8]
const SKINS = [0xf0c09c, 0xe7b08a, 0xd49a74, 0xf3cbaa, 0xc98f6b]

export const villagers: Villager[] = []
const jobs: Job[] = []

function makeVillager(x: number, z: number): Villager {
  const v: Villager = {
    id: villagers.length,
    x,
    z,
    y: getHeight(x, z),
    heading: rnd() * Math.PI * 2,
    path: [],
    pi: 0,
    state: 'idle',
    task: null,
    timer: rnd() * 3,
    walkPhase: rnd() * 10,
    workPhase: 0,
    speed: TUNING.walkSpeed * (0.85 + rnd() * 0.3),
    shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)],
    pants: PANTS[Math.floor(rnd() * PANTS.length)],
    hat: HATS[Math.floor(rnd() * HATS.length)],
    hasHat: rnd() < 0.75,
    skin: SKINS[Math.floor(rnd() * SKINS.length)],
    carrying: null,
    faceX: 0,
    faceZ: 0,
    moving: 0,
  }
  villagers.push(v)
  return v
}

export function initVillagers() {
  if (villagers.length) return
  for (let i = 0; i < TUNING.startPopulation; i++) {
    const [px, pz] = randomPOI(rnd)
    const p = nearestWalkable(px, pz, 5)
    if (p) makeVillager(p[0], p[1])
  }
}

// ---------------------------------------------------------------------------
// Commands (called from the UI / scene)

function busy(v: Villager) {
  return v.task !== null && v.task.kind !== 'wander' && v.task.kind !== 'deliver'
}

function sendTo(v: Villager, x: number, z: number, task: Task): boolean {
  const path = findPath(v.x, v.z, x, z)
  if (!path) return false
  v.path = path
  v.pi = 0
  v.task = task
  v.state = 'walk'
  v.carrying = task.kind === 'deliver' ? v.carrying : null
  return true
}

function approachPoint(tx: number, tz: number, fromX: number, fromZ: number, dist: number): [number, number] {
  const dx = fromX - tx
  const dz = fromZ - tz
  const l = Math.hypot(dx, dz) || 1
  const p = nearestWalkable(tx + (dx / l) * dist, tz + (dz / l) * dist, 3)
  return p ?? [tx + (dx / l) * dist, tz + (dz / l) * dist]
}

function tryAssign(job: Job): boolean {
  let tx: number
  let tz: number
  if (job.kind === 'chop') {
    const t = trees[job.target]
    tx = t.x
    tz = t.z
  } else {
    const d = deposits[job.target]
    tx = d.x
    tz = d.z
  }
  const free = villagers.filter((v) => !busy(v)).sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz))
  for (const v of free.slice(0, 4)) {
    const dist = job.kind === 'chop' ? 0.95 : deposits[job.target].size * 1.6 + 0.4
    const [ax, az] = approachPoint(tx, tz, v.x, v.z, dist)
    if (sendTo(v, ax, az, job.kind === 'chop' ? { kind: 'chop', tree: job.target } : { kind: 'mine', dep: job.target })) {
      v.faceX = tx
      v.faceZ = tz
      return true
    }
  }
  return false
}

export function requestChop(treeId: number) {
  const t = trees[treeId]
  if (!t || !t.choppable) return
  if (t.state !== 'grown') {
    game().toast('That tree is still growing.', 'warn')
    sfx.error()
    return
  }
  if (t.reserved) {
    game().toast('A villager is already on the way.', 'info')
    return
  }
  t.reserved = true
  sfx.click()
  const job: Job = { kind: 'chop', target: treeId }
  if (!tryAssign(job)) {
    jobs.push(job)
    game().toast('All villagers are busy — the job is queued.', 'info')
  }
}

export function requestMine(depId: number) {
  const d = deposits[depId]
  if (!d) return
  if (d.amount <= 0) {
    game().toast('This outcrop is exhausted. It will be workable again later.', 'warn')
    sfx.error()
    return
  }
  if (d.reserved) {
    game().toast('Someone is already quarrying there.', 'info')
    return
  }
  d.reserved = true
  sfx.click()
  const job: Job = { kind: 'mine', target: depId }
  if (!tryAssign(job)) {
    jobs.push(job)
    game().toast('All villagers are busy — the job is queued.', 'info')
  }
}

// --- fishing ----------------------------------------------------------------

function waterClear(ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5)
  for (let i = 1; i <= n; i++) {
    const t = i / n
    if (getHeight(ax + (bx - ax) * t, az + (bz - az) * t) > -0.7) return false
  }
  return true
}

export function launchBoat(id: number) {
  const b = boats[id]
  if (!b) return
  if (b.state !== 'beached') {
    game().toast('That boat is already out at sea.', 'info')
    return
  }
  const fx = Math.sin(b.homeRot + 0) // boats point towards +z (local +x rotated)
  const fz = Math.cos(b.homeRot)
  const out1: [number, number] = [b.homeX + fx * 6, b.homeZ + fz * 6]
  let spot: [number, number] | null = null
  for (let i = 0; i < 40 && !spot; i++) {
    const a = (rnd() - 0.5) * 1.6
    const r = 24 + rnd() * 20
    const cand: [number, number] = [out1[0] + Math.sin(a) * r, out1[1] + Math.cos(a) * r]
    if (getHeight(cand[0], cand[1]) < -3 && waterClear(out1[0], out1[1], cand[0], cand[1])) spot = cand
  }
  if (!spot) spot = [out1[0], out1[1] + 20]
  b.route = [[b.homeX, b.homeZ], out1, spot]
  b.routeLen = Math.hypot(out1[0] - b.homeX, out1[1] - b.homeZ) + Math.hypot(spot[0] - out1[0], spot[1] - out1[1])
  b.dist = 0
  b.state = 'out'
  b.t = 0
  sfx.splash()
  game().bumpStat('fishingTrips')
}

function routePoint(b: BoatState, d: number): [number, number, number] {
  let acc = 0
  for (let i = 0; i < b.route.length - 1; i++) {
    const [ax, az] = b.route[i]
    const [bx, bz] = b.route[i + 1]
    const L = Math.hypot(bx - ax, bz - az)
    if (d <= acc + L || i === b.route.length - 2) {
      const t = Math.min(1, Math.max(0, (d - acc) / L))
      return [ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(bx - ax, bz - az)]
    }
    acc += L
  }
  const last = b.route[b.route.length - 1]
  return [last[0], last[1], 0]
}

// --- merchant ----------------------------------------------------------------

export const merchantShip = {
  x: 150,
  z: 42,
  rot: Math.PI / 2,
  visible: false,
  route: [] as [number, number][],
  dist: 0,
  routeLen: 0,
}

const MERCHANT_ROUTE: [number, number][] = [
  [175, 40],
  [120, 50],
  [70, 54],
  [pier.dockX + pier.dirX * 24, pier.dockZ + pier.dirZ * 24],
  [pier.dockX + pier.dirX * 10, pier.dockZ + pier.dirZ * 10],
  [pier.dockX, pier.dockZ],
]

function smoothRoute(pts: [number, number][], seg = 10): [number, number][] {
  // Catmull-Rom through the control points
  const out: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 0; s < seg; s++) {
      const t = s / seg
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

const merchantPath = smoothRoute(MERCHANT_ROUTE, 12)
const merchantLen = (() => {
  let l = 0
  for (let i = 0; i < merchantPath.length - 1; i++) l += Math.hypot(merchantPath[i + 1][0] - merchantPath[i][0], merchantPath[i + 1][1] - merchantPath[i][1])
  return l
})()

function pathPose(path: [number, number][], d: number): [number, number, number] {
  let acc = 0
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]
    const [bx, bz] = path[i + 1]
    const L = Math.hypot(bx - ax, bz - az)
    if (d <= acc + L || i === path.length - 2) {
      const t = Math.min(1, Math.max(0, (d - acc) / Math.max(L, 1e-6)))
      return [ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(-(bz - az), bx - ax)]
    }
    acc += L
  }
  return [path[0][0], path[0][1], 0]
}

const OFFER_TEMPLATES: (() => Omit<Offer, 'id' | 'left'>)[] = [
  () => ({ give: { res: 'fish', amount: 10 }, get: { res: 'gold', amount: 12 + Math.floor(rnd() * 7) } }),
  () => ({ give: { res: 'wood', amount: 10 }, get: { res: 'gold', amount: 10 + Math.floor(rnd() * 6) } }),
  () => ({ give: { res: 'stone', amount: 8 }, get: { res: 'gold', amount: 12 + Math.floor(rnd() * 6) } }),
  () => ({ give: { res: 'gold', amount: 14 + Math.floor(rnd() * 6) }, get: { res: 'stone', amount: 10 } }),
  () => ({ give: { res: 'gold', amount: 12 + Math.floor(rnd() * 5) }, get: { res: 'wood', amount: 10 } }),
  () => ({ give: { res: 'gold', amount: 8 + Math.floor(rnd() * 4) }, get: { res: 'fish', amount: 10 } }),
]

let offerId = 1
function makeOffers(): Offer[] {
  const idx = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 4)
  return idx.map((i) => ({ ...OFFER_TEMPLATES[i](), id: offerId++, left: 3 }))
}

export function trade(offerId: number) {
  const s = game()
  const m = s.merchant
  const o = m.offers.find((x) => x.id === offerId)
  if (!o || o.left <= 0 || m.status !== 'docked') return
  if (s.res[o.give.res] < o.give.amount) {
    s.toast(`Not enough ${o.give.res}.`, 'warn')
    sfx.error()
    return
  }
  s.addRes({ [o.give.res]: -o.give.amount, [o.get.res]: o.get.amount })
  useGame.setState({ merchant: { ...m, offers: m.offers.map((x) => (x.id === offerId ? { ...x, left: x.left - 1 } : x)) } })
  sfx.coin()
  s.floatText(`+${o.get.amount}`, merchantShip.x, 5, merchantShip.z, o.get.res)
  s.bumpStat('trades')
}

// --- construction --------------------------------------------------------------

let buildingId = 1
let variantCounter = 0

export function footprintObstacle(type: BuildingType, x: number, z: number, rot: number, variant: number, pad = 0): Obstacle {
  const b = buildingModel(type, variant).bounds
  const cx = (b.min.x + b.max.x) / 2
  const cz = (b.min.z + b.max.z) / 2
  const [wx, wz] = localToWorld(x, z, rot, cx, cz)
  return { kind: 'box', x: wx, z: wz, rot, hx: (b.max.x - b.min.x) / 2 + pad, hz: (b.max.z - b.min.z) / 2 + pad }
}

export function nextVariant(type: BuildingType) {
  return type === 'cottage' ? variantCounter % 4 : 0
}

export function placeBuilding(type: BuildingType, x: number, z: number, rot: number): boolean {
  const def = BUILDINGS[type]
  const s = game()
  if (!s.spend(def.cost)) {
    s.toast('Not enough resources.', 'warn')
    sfx.error()
    return false
  }
  const variant = nextVariant(type)
  if (type === 'cottage') variantCounter++
  const y = getHeight(x, z)
  const model = buildingModel(type, variant)
  const obstacle = footprintObstacle(type, x, z, rot, variant, -0.1)
  const b: PlacedBuilding = {
    id: buildingId++,
    type,
    variant,
    x,
    z,
    y,
    rot,
    progress: 0,
    done: false,
    obstacle,
    prodTimer: 0,
    chimneys: model.chimneys.map(([cx, cy, cz]) => {
      const [wx, wz] = localToWorld(x, z, rot, cx, cz)
      return [wx, y + cy, wz]
    }),
  }
  placed.push(b)
  addNavObstacle(obstacle, 0.25)
  // reroute anybody whose path now crosses the site
  for (const v of villagers) if (v.state === 'walk' && v.task?.kind === 'wander') v.state = 'idle'
  s.bumpBuildings()
  sfx.place()
  recruitBuilders(b)
  return true
}

/** Send up to three idle villagers to work on a construction site. */
function recruitBuilders(b: PlacedBuilding) {
  const { x, z, obstacle } = b
  const free = villagers.filter((v) => !busy(v)).sort((a, c) => Math.hypot(a.x - x, a.z - z) - Math.hypot(c.x - x, c.z - z))
  let n = 0
  for (const v of free) {
    if (n >= 3) break
    const ang = (n / 3) * Math.PI * 2 + rnd()
    const r = Math.max(obstacle.hx ?? 2, obstacle.hz ?? 2) + 0.9
    const p = nearestWalkable(x + Math.cos(ang) * r, z + Math.sin(ang) * r, 3)
    if (p && sendTo(v, p[0], p[1], { kind: 'build', bld: b.id })) {
      v.faceX = x
      v.faceZ = z
      n++
    }
  }
}

function finishBuilding(b: PlacedBuilding) {
  b.done = true
  b.progress = 1
  const def = BUILDINGS[b.type]
  const s = game()
  sfx.done()
  s.toast(`${def.name} completed!`, 'good')
  if (def.housing) useGame.setState({ housing: s.housing + def.housing })
  if (b.type === 'cottage') s.bumpStat('cottagesBuilt')
  if (b.type === 'fishery' || b.type === 'lumber' || b.type === 'quarry') s.bumpStat('workshopsBuilt')
  if (b.type === 'lighthouse') {
    s.bumpStat('lighthouseBuilt')
    sfx.fanfare()
    setTimeout(() => game().win(), 1200)
  }
  s.bumpBuildings()
  for (const v of villagers) if (v.task?.kind === 'build' && v.task.bld === b.id) {
    v.task = null
    v.state = 'idle'
    v.timer = 0.5 + rnd() * 2
  }
}

// ---------------------------------------------------------------------------
// Update

let taxAcc = 0
let foodAcc = 0
let arrivalAcc = 0
let taxLabelAcc = 0
let taxLabelGold = 0
let merchantTimer = 25
let uiTick = 0

function spawnArrival() {
  const bx = PIER.x - pier.dirX * 1.5
  const bz = PIER.z - pier.dirZ * 1.5
  const p = nearestWalkable(bx, bz, 5)
  if (!p) return
  const v = makeVillager(p[0], p[1])
  // head for the newest cottage, or anywhere nice
  const cottages = placed.filter((b) => b.done && b.type === 'cottage')
  let target: [number, number] = randomPOI(rnd)
  if (cottages.length) {
    const c = cottages[cottages.length - 1]
    target = localToWorld(c.x, c.z, c.rot, 0, 4)
  }
  sendTo(v, target[0], target[1], { kind: 'wander' })
  const s = game()
  useGame.setState({ population: villagers.length })
  s.setStat('population', villagers.length)
  s.floatText('New villager!', p[0], getHeight(p[0], p[1]) + 2.4, p[1], 'info')
}

function updateVillager(v: Villager, dt: number) {
  if (v.state === 'walk') {
    const target = v.path[v.pi]
    if (!target) {
      arrive(v)
      return
    }
    const dx = target[0] - v.x
    const dz = target[1] - v.z
    const d = Math.hypot(dx, dz)
    const step = v.speed * dt
    if (d <= step) {
      v.x = target[0]
      v.z = target[1]
      v.pi++
      if (v.pi >= v.path.length) arrive(v)
    } else {
      v.x += (dx / d) * step
      v.z += (dz / d) * step
      const want = Math.atan2(dx, dz)
      let diff = want - v.heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      v.heading += diff * Math.min(1, dt * 10)
    }
    v.walkPhase += dt * v.speed * 4.2
    v.moving = Math.min(1, v.moving + dt * 5)
  } else {
    v.moving = Math.max(0, v.moving - dt * 5)
  }
  v.y = getHeight(v.x, v.z)

  if (v.state === 'idle') {
    v.timer -= dt
    if (v.timer <= 0) {
      const [tx, tz] = randomPOI(rnd)
      if (!sendTo(v, tx, tz, { kind: 'wander' })) v.timer = 1 + rnd() * 2
    }
  } else if (v.state === 'work') {
    v.workPhase += dt
    faceTowards(v, v.faceX, v.faceZ, dt)
    const t = v.task
    if (!t) {
      v.state = 'idle'
      return
    }
    if (t.kind === 'build') {
      const b = placed.find((p) => p.id === t.bld)
      if (!b || b.done) {
        v.task = null
        v.state = 'idle'
      }
      return
    }
    v.timer -= dt
    const period = t.kind === 'chop' ? 0.62 : 0.7
    const prev = Math.floor((v.workPhase - dt) / period)
    const cur = Math.floor(v.workPhase / period)
    if (cur !== prev) (t.kind === 'chop' ? sfx.chop : sfx.mine)()
    if (v.timer <= 0) completeWork(v)
  }
}

function faceTowards(v: Villager, x: number, z: number, dt: number) {
  const want = Math.atan2(x - v.x, z - v.z)
  let diff = want - v.heading
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  v.heading += diff * Math.min(1, dt * 8)
}

function arrive(v: Villager) {
  const t = v.task
  v.path = []
  if (!t || t.kind === 'wander') {
    v.state = 'idle'
    v.task = null
    v.timer = 2 + rnd() * 6
    return
  }
  if (t.kind === 'deliver') {
    v.carrying = null
    v.task = null
    v.state = 'idle'
    v.timer = 1 + rnd() * 3
    return
  }
  v.state = 'work'
  v.workPhase = 0
  if (t.kind === 'chop') v.timer = TUNING.chopTime
  else if (t.kind === 'mine') v.timer = TUNING.mineTime
}

function completeWork(v: Villager) {
  const t = v.task!
  const s = game()
  if (t.kind === 'chop') {
    const tree = trees[t.tree]
    tree.state = 'falling'
    tree.t = 0
    tree.fallDir = v.heading
    tree.reserved = false
    s.addRes({ wood: TUNING.chopYield })
    s.floatText(`+${TUNING.chopYield}`, tree.x, tree.y + 3, tree.z, 'wood')
    s.bumpStat('treesChopped')
    sfx.timber()
    v.carrying = 'log'
  } else if (t.kind === 'mine') {
    const d = deposits[t.dep]
    const got = Math.min(TUNING.mineYield, d.amount)
    d.amount -= got
    d.reserved = false
    if (d.amount <= 0) d.regrow = TUNING.depositRegrow
    s.addRes({ stone: got })
    s.floatText(`+${got}`, d.x, d.y + 2.5, d.z, 'stone')
    s.bumpStat('stoneMined')
    v.carrying = 'stone'
  }
  v.task = null
  // carry the goods to the market stall
  const [mx, mz] = market.door
  if (!sendTo(v, mx + (rnd() - 0.5) * 2, mz + (rnd() - 0.5), { kind: 'deliver' })) {
    v.state = 'idle'
    v.carrying = null
    v.timer = 1
  }
}

function updateTrees(dt: number) {
  for (const t of trees) {
    if (t.state === 'grown') continue
    t.t += dt
    if (t.state === 'falling' && t.t > 1.6) {
      t.state = 'stump'
      t.t = 0
    } else if (t.state === 'stump' && t.t > TUNING.treeRegrow) {
      t.state = 'growing'
      t.t = 0
    } else if (t.state === 'growing' && t.t > TUNING.treeGrowTime) {
      t.state = 'grown'
      t.t = 0
    }
  }
}

function updateDeposits(dt: number) {
  for (const d of deposits) {
    if (d.amount <= 0) {
      d.regrow -= dt
      if (d.regrow <= 0) d.amount = TUNING.depositCapacity
    }
  }
}

function updateBoats(dt: number) {
  const s = game()
  for (const b of boats) {
    if (b.state === 'beached') continue
    b.t += dt
    const speed = 3.2
    if (b.state === 'out') {
      b.dist = Math.min(b.routeLen, b.dist + speed * dt * Math.min(1, 0.3 + b.t * 0.5))
      if (b.dist >= b.routeLen) {
        b.state = 'fishing'
        b.t = 0
      }
    } else if (b.state === 'fishing') {
      if (b.t > 7) {
        b.state = 'returning'
        b.t = 0
      }
    } else if (b.state === 'returning') {
      b.dist = Math.max(0, b.dist - speed * dt)
      if (b.dist <= 0) {
        b.state = 'beached'
        const [lo, hi] = TUNING.fishingTrip
        const n = lo + Math.floor(rnd() * (hi - lo + 1))
        s.addRes({ fish: n })
        s.floatText(`+${n}`, b.homeX, 2.2, b.homeZ, 'fish')
        sfx.splash()
      }
    }
    if (b.state !== 'beached') {
      const [x, z, h] = routePoint(b, b.dist)
      b.x = x
      b.z = z
      const want = b.state === 'returning' ? h + Math.PI : h
      if (b.state !== 'fishing') {
        let diff = want - b.rot
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        b.rot += diff * Math.min(1, dt * 2.5)
      }
    } else {
      b.x = b.homeX
      b.z = b.homeZ
      b.rot = b.homeRot
    }
  }
}

function updateMerchant(dt: number) {
  const s = game()
  const m = s.merchant
  const ship = merchantShip
  if (m.status === 'away') {
    merchantTimer -= dt
    if (merchantTimer <= 0) {
      useGame.setState({ merchant: { status: 'arriving', timeLeft: 0, offers: [] } })
      ship.visible = true
      ship.dist = 0
      s.toast('A merchant ship has been sighted!', 'info')
      sfx.bell()
    }
  } else if (m.status === 'arriving') {
    const remain = merchantLen - ship.dist
    const speed = Math.max(1.2, Math.min(7, remain * 0.35))
    ship.dist = Math.min(merchantLen, ship.dist + speed * dt)
    if (ship.dist >= merchantLen - 0.05) {
      useGame.setState({ merchant: { status: 'docked', timeLeft: TUNING.merchantStay, offers: makeOffers() } })
      s.toast('The merchant has docked at the pier. Click the ship to trade!', 'good')
      sfx.bell()
    }
  } else if (m.status === 'docked') {
    const left = m.timeLeft - dt
    if (left <= 0) {
      useGame.setState({ merchant: { status: 'leaving', timeLeft: 0, offers: [] }, tradeOpen: false })
      s.toast('The merchant ship is setting sail.', 'info')
    } else if (Math.floor(left) !== Math.floor(m.timeLeft)) {
      useGame.setState({ merchant: { ...m, timeLeft: left } })
    } else {
      m.timeLeft = left
    }
  } else if (m.status === 'leaving') {
    const speed = Math.min(7, 1.2 + (merchantLen - ship.dist) * 0.3)
    ship.dist = Math.max(0, ship.dist - speed * dt)
    if (ship.dist <= 0) {
      ship.visible = false
      const [a, b] = TUNING.merchantAway
      merchantTimer = a + rnd() * (b - a)
      useGame.setState({ merchant: { status: 'away', timeLeft: merchantTimer, offers: [] } })
    }
  }
  if (ship.visible) {
    const [x, z, h] = pathPose(merchantPath, ship.dist)
    ship.x = x
    ship.z = z
    if (m.status === 'docked' || ship.dist > merchantLen - 3) {
      // settle onto the mooring heading
      let diff = pier.dockRot - ship.rot
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      ship.rot += diff * Math.min(1, dt * 0.8)
    } else {
      const want = m.status === 'leaving' ? h + Math.PI : h
      let diff = want - ship.rot
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      ship.rot += diff * Math.min(1, dt * 1.2)
    }
  }
}

function updateEconomy(dt: number) {
  const s = game()
  const pop = villagers.length
  // taxes
  taxAcc += (dt * pop) / TUNING.taxEvery * (s.hungry ? 0.5 : 1)
  if (taxAcc >= 1) {
    const g = Math.floor(taxAcc)
    taxAcc -= g
    s.addRes({ gold: g })
    taxLabelGold += g
  }
  taxLabelAcc += dt
  if (taxLabelAcc > 12 && taxLabelGold > 0) {
    const h = houses[Math.floor(rnd() * houses.length)]
    s.floatText(`+${taxLabelGold}`, h.x, h.y + 6, h.z, 'gold')
    taxLabelGold = 0
    taxLabelAcc = 0
  }
  // food
  foodAcc += (dt * pop) / TUNING.eatEvery
  if (foodAcc >= 1) {
    const f = Math.floor(foodAcc)
    foodAcc -= f
    const have = s.res.fish
    if (have >= f) {
      s.addRes({ fish: -f })
      if (s.hungry) useGame.setState({ hungry: false })
    } else {
      s.addRes({ fish: -have })
      if (!s.hungry) {
        useGame.setState({ hungry: true })
        s.toast('The villagers are hungry! Send boats out fishing.', 'warn')
      }
    }
  }
  // arrivals
  if (s.housing > pop && s.res.fish > 0 && !s.hungry) {
    arrivalAcc += dt
    if (arrivalAcc > TUNING.arrivalEvery) {
      arrivalAcc = 0
      spawnArrival()
    }
  } else arrivalAcc = 0
  // production & construction
  for (const b of placed) {
    if (!b.done) {
      const builders = villagers.filter((v) => v.state === 'work' && v.task?.kind === 'build' && v.task.bld === b.id).length
      const rate = (0.3 + 0.35 * Math.min(builders, 2)) / BUILDINGS[b.type].buildTime
      b.progress = Math.min(1, b.progress + rate * dt)
      if (b.progress >= 1) finishBuilding(b)
      continue
    }
    const prod = BUILDINGS[b.type].produces
    if (!prod) continue
    b.prodTimer += dt
    if (b.prodTimer >= prod.every) {
      b.prodTimer -= prod.every
      s.addRes({ [prod.res]: prod.amount } as Partial<Record<ResKey, number>>)
      if (rnd() < 0.35) s.floatText(`+${prod.amount}`, b.x, b.y + 4, b.z, prod.res)
    }
  }
}

export function updateSim(dt: number) {
  const s = game()
  if (s.phase === 'title') {
    // keep the village alive behind the title screen
    for (const v of villagers) updateVillager(v, dt)
    updateBoats(dt)
    return
  }
  // assign queued jobs
  if (jobs.length) {
    for (let i = 0; i < jobs.length; i++) {
      if (tryAssign(jobs[i])) {
        jobs.splice(i, 1)
        break
      }
    }
  }
  for (const v of villagers) updateVillager(v, dt)
  updateTrees(dt)
  updateDeposits(dt)
  updateBoats(dt)
  updateMerchant(dt)
  updateEconomy(dt)
  uiTick += dt
  if (uiTick > 0.5) {
    uiTick = 0
    if (s.population !== villagers.length) useGame.setState({ population: villagers.length })
  }
  void QUESTS
}

/** Dev helper: bring the merchant straight to the pier. */
export function debugDockMerchant(stay = 600) {
  merchantShip.visible = true
  merchantShip.dist = merchantLen
  merchantShip.rot = pier.dockRot
  useGame.setState({ merchant: { status: 'docked', timeLeft: stay, offers: makeOffers() } })
}

// ---------------------------------------------------------------------------
// Save-game support

/** Re-create a building from a save file (no cost, no builders). */
export function restoreBuilding(type: BuildingType, variant: number, x: number, z: number, rot: number, done: boolean, progress: number) {
  const y = getHeight(x, z)
  const model = buildingModel(type, variant)
  const obstacle = footprintObstacle(type, x, z, rot, variant, -0.1)
  const b: PlacedBuilding = {
    id: buildingId++,
    type,
    variant,
    x,
    z,
    y,
    rot,
    progress: done ? 1 : progress,
    done,
    obstacle,
    prodTimer: 0,
    chimneys: model.chimneys.map(([cx, cy, cz]) => {
      const [wx, wz] = localToWorld(x, z, rot, cx, cz)
      return [wx, y + cy, wz]
    }),
  }
  placed.push(b)
  addNavObstacle(obstacle, 0.25)
  if (type === 'cottage') variantCounter = Math.max(variantCounter, variant + 1)
}

/** Spawn villagers around the village until there are `n` of them. */
export function spawnVillagersTo(n: number) {
  let guard = 0
  while (villagers.length < n && guard++ < 500) {
    const [px, pz] = randomPOI(rnd)
    const p = nearestWalkable(px, pz, 5)
    if (p) makeVillager(p[0], p[1])
  }
  for (const b of placed) if (!b.done) recruitBuilders(b)
}
