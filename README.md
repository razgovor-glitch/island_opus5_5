# Harbor Isle

A cozy 3D island-village builder in **React + TypeScript + three.js** (react-three-fiber), styled after a
miniature diorama: a rocky hill crowned with pines, timber cottages with shingled roofs, a stone chapel,
sailing ships, rowboats on the beach, a pier and a hazy archipelago on the horizon.

Everything is procedural — geometry, textures (planks, shingles, stone, granite, water normals), terrain,
vegetation and sky are generated at start-up, so there are no asset files.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
```

Add `?play` to the URL to skip the title screen, `?perf` to log start-up timings.

## How to play

| Action | How |
| --- | --- |
| Chop wood | click a tree — the nearest free villager walks over and fells it (stumps regrow) |
| Quarry stone | click one of the grey stone outcrops |
| Fish | click a rowboat on the beach — it rows out, fishes and comes back with fish |
| Trade | when a merchant ship docks at the pier, click it (or **T**) |
| Build | pick a building in the bottom bar (or **1–5**), click to place, **R** rotate, **Shift** keep placing, right-click/**Esc** cancel |

Villagers eat fish; when fish runs out they get hungry (half taxes, nobody new moves in). Cottages add
housing so new settlers arrive. Follow the quests — the goal is the **Lighthouse** on the coast.
Progress autosaves to localStorage; the title screen offers **Continue**.

Camera: drag to pan · right-drag (or Shift-drag) to rotate · wheel/pinch to zoom · **WASD**/arrows to move ·
**Q**/**E** to turn. **H** opens help.

## Graphics

The **HQ/MQ/LQ** button switches presets (render scale, shadow-map size, ambient occlusion,
tilt-shift blur, SMAA). The game steps down automatically if the frame rate stays low.

## Code map

```
src/game/       simulation & data (no rendering)
  layout.ts       hand-placed village layout (houses, paths, pier, ships…)
  terrain.ts      island heightfield (SDF coast, granite dome, paths, flattened pads)
  world.ts        vegetation scatter, obstacles, runtime state (trees, boats, buildings)
  nav.ts          grid A* for villagers (roads are cheaper)
  sim.ts          villagers, jobs, fishing, merchant, construction, economy
  store.ts        zustand store for the UI (resources, quests, toasts…)
  save.ts         autosave / continue
src/models/     procedural models (houses, church, ships, props, trees, villagers)
src/three/      geometry helpers, canvas-painted textures, shared materials
src/scene/      react-three-fiber components (terrain, water shader, sky, ships, effects, camera…)
src/ui/         HUD, build bar, trade panel, title / victory screens
```
