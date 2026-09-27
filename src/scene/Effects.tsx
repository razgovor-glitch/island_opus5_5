import { Bloom, EffectComposer, HueSaturation, BrightnessContrast, N8AO, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGame } from '../game/store'

export function Effects() {
  const quality = useGame((s) => s.quality)
  if (quality === 'low') {
    return (
      <EffectComposer multisampling={4}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.05} />
        <Vignette offset={0.3} darkness={0.35} />
      </EffectComposer>
    )
  }
  const high = quality === 'high'
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} distanceFalloff={0.9} intensity={2.2} aoSamples={high ? 16 : 8} denoiseSamples={high ? 8 : 4} halfRes screenSpaceRadius={false} />
      <Bloom mipmapBlur intensity={0.35} luminanceThreshold={0.95} luminanceSmoothing={0.25} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.05} />
      <BrightnessContrast brightness={0.02} contrast={0.04} />
      <SMAA />
      <TiltShift2 blur={0.11} taper={0.72} start={[0, 0.44]} end={[1, 0.44]} samples={high ? 10 : 6} />
      <Vignette offset={0.28} darkness={0.4} />
    </EffectComposer>
  )
}

/**
 * Watches the frame rate once play starts and steps the graphics preset down if the
 * machine can't keep up (only while the player hasn't picked a preset themselves).
 */
export function AutoQuality() {
  const acc = useRef({ t: 0, frames: 0, warm: 0, strikes: 0 })
  useFrame((_, dt) => {
    const s = useGame.getState()
    if (s.phase !== 'playing' || !s.qualityAuto || s.quality === 'low') return
    const a = acc.current
    // background / unfocused tabs are throttled by the browser — that says nothing about the GPU
    if (document.visibilityState !== 'visible' || !document.hasFocus() || dt > 0.5) {
      a.warm = 0
      a.t = 0
      a.frames = 0
      return
    }
    if (a.warm < 3) {
      a.warm += dt
      return
    }
    a.t += dt
    a.frames++
    if (a.t >= 4) {
      const fps = a.frames / a.t
      a.t = 0
      a.frames = 0
      a.strikes = fps < 34 ? a.strikes + 1 : 0
      if (a.strikes >= 2) {
        a.strikes = 0
        a.warm = 0
        const next = s.quality === 'high' ? 'medium' : 'low'
        useGame.setState({ quality: next })
        s.toast(`Graphics set to ${next} for smoother play (change with the HQ button).`, 'info')
      }
    }
  })
  return null
}
