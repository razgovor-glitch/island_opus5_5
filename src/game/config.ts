import type { BuildingType } from '../models/buildings'

export type ResKey = 'wood' | 'stone' | 'fish' | 'gold'
export type Cost = Partial<Record<ResKey, number>>

export interface BuildingDef {
  type: BuildingType
  name: string
  blurb: string
  cost: Cost
  buildTime: number
  /** Must be placed within this distance of open water. */
  nearWater?: number
  housing?: number
  produces?: { res: ResKey; amount: number; every: number }
  unique?: boolean
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  cottage: {
    type: 'cottage',
    name: 'Cottage',
    blurb: 'Houses 4 more villagers.',
    cost: { wood: 20, stone: 8 },
    buildTime: 14,
    housing: 4,
  },
  fishery: {
    type: 'fishery',
    name: 'Fishing Hut',
    blurb: 'Catches 1 fish every 5s. Build near the shore.',
    cost: { wood: 16, stone: 6 },
    buildTime: 12,
    nearWater: 7,
    produces: { res: 'fish', amount: 1, every: 5 },
  },
  lumber: {
    type: 'lumber',
    name: 'Lumber Camp',
    blurb: 'Saws 1 wood every 6s.',
    cost: { wood: 12, stone: 10 },
    buildTime: 12,
    produces: { res: 'wood', amount: 1, every: 6 },
  },
  quarry: {
    type: 'quarry',
    name: 'Stonecutter',
    blurb: 'Cuts 1 stone every 8s.',
    cost: { wood: 22, gold: 10 },
    buildTime: 12,
    produces: { res: 'stone', amount: 1, every: 8 },
  },
  lighthouse: {
    type: 'lighthouse',
    name: 'Lighthouse',
    blurb: 'Guides ships home. Build it on the coast to win!',
    cost: { wood: 60, stone: 50, gold: 80 },
    buildTime: 24,
    nearWater: 9,
    unique: true,
  },
}

export const BUILD_ORDER: BuildingType[] = ['cottage', 'fishery', 'lumber', 'quarry', 'lighthouse']

export const TUNING = {
  startRes: { wood: 25, stone: 12, fish: 30, gold: 20 } as Record<ResKey, number>,
  startPopulation: 11,
  baseHousing: 12,
  chopYield: 5,
  chopTime: 3.5,
  mineYield: 5,
  mineTime: 4.5,
  depositCapacity: 25,
  depositRegrow: 150,
  treeRegrow: 45,
  treeGrowTime: 50,
  fishingTrip: [9, 14] as [number, number],
  eatEvery: 80, // seconds per fish per villager
  taxEvery: 40, // seconds per gold per villager
  arrivalEvery: 9,
  merchantAway: [55, 80] as [number, number],
  merchantStay: 70,
  walkSpeed: 1.9,
}

export const RES_LABEL: Record<ResKey, string> = { wood: 'Wood', stone: 'Stone', fish: 'Fish', gold: 'Gold' }

export interface Quest {
  id: string
  title: string
  text: string
  goal: number
  stat: StatKey
  reward: Cost
}

export type StatKey = 'treesChopped' | 'stoneMined' | 'fishingTrips' | 'cottagesBuilt' | 'trades' | 'workshopsBuilt' | 'population' | 'lighthouseBuilt'

export const QUESTS: Quest[] = [
  { id: 'chop', title: 'Timber!', text: 'Click trees near the village to send a villager chopping.', goal: 3, stat: 'treesChopped', reward: { gold: 10 } },
  { id: 'mine', title: 'Stone by stone', text: 'Click the grey stone outcrops to quarry stone.', goal: 2, stat: 'stoneMined', reward: { wood: 10 } },
  { id: 'fish', title: 'Gone fishing', text: 'Click a rowboat on the beach to send it out fishing.', goal: 1, stat: 'fishingTrips', reward: { gold: 10 } },
  { id: 'cottage', title: 'A new home', text: 'Open the build bar and place a Cottage on open grass.', goal: 1, stat: 'cottagesBuilt', reward: { fish: 15 } },
  { id: 'trade', title: 'Honest trade', text: 'When a merchant ship docks at the pier, click it and make a trade.', goal: 1, stat: 'trades', reward: { gold: 15 } },
  { id: 'industry', title: 'Industry', text: 'Build a Fishing Hut, Lumber Camp or Stonecutter.', goal: 1, stat: 'workshopsBuilt', reward: { stone: 15 } },
  { id: 'grow', title: 'Growing village', text: 'Reach 20 villagers. Build cottages and keep them fed.', goal: 20, stat: 'population', reward: { gold: 30 } },
  { id: 'lighthouse', title: 'Light the way', text: 'Build the Lighthouse on the coast.', goal: 1, stat: 'lighthouseBuilt', reward: {} },
]
