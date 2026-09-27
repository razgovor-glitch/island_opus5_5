import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mark, perfEnabled, perfReport } from '../game/perf'
import { Sky } from './Sky'
import { Lighting } from './Lighting'
import { Terrain } from './Terrain'
import { Water } from './Water'
import { Village } from './Village'
import { Nature } from './Nature'
import { CameraRig } from './CameraRig'
import { DistantIslands } from './DistantIslands'
import { Ships } from './Ships'
import { Rowboats } from './Rowboats'
import { Villagers } from './Villagers'
import { AutoQuality, Effects } from './Effects'
import { BuildGhost } from './Placement'
import { PlayerBuildings } from './PlayerBuildings'
import { Gulls, Smoke } from './Ambient'
import { FloatingLabels, HoverRing } from './Overlays'

/** Hides the HTML boot screen once the scene has actually drawn a few frames. */
function BootFade() {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 3) {
      document.getElementById('boot')?.classList.add('done')
      mark('third frame')
      if (perfEnabled) console.info('[startup]\n' + perfReport())
    }
  })
  return null
}

export function World() {
  return (
    <>
      <Sky />
      <Lighting />
      <Terrain />
      <Water />
      <DistantIslands />
      <Village />
      <Nature />
      <Ships />
      <Rowboats />
      <Villagers />
      <PlayerBuildings />
      <BuildGhost />
      <Smoke />
      <Gulls />
      <HoverRing />
      <FloatingLabels />
      <CameraRig />
      <Effects />
      <AutoQuality />
      <BootFade />
    </>
  )
}
