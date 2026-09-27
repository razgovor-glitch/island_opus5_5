// Tiny procedural sound kit (WebAudio): ambient surf, gulls and UI / work sounds.

import { useGame } from './store'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let started = false

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = useGame.getState().muted ? 0 : 0.6
      master.connect(ctx.destination)
      useGame.subscribe((s) => {
        if (master && ctx) master.gain.setTargetAtTime(s.muted ? 0 : 0.6, ctx.currentTime, 0.1)
      })
    } catch {
      return null
    }
  }
  return ctx
}

function noiseBuffer(c: AudioContext, seconds: number, brown = false): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

/** Call from a user gesture. Starts the ambience loop. */
export function startAudio() {
  const c = ac()
  if (!c || !master) return
  if (c.state === 'suspended') c.resume()
  if (started) return
  started = true
  // surf: brown noise through a low-pass with slow swells
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 6, true)
  src.loop = true
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 520
  const g = c.createGain()
  g.gain.value = 0.18
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.11
  const lfoGain = c.createGain()
  lfoGain.gain.value = 0.1
  lfo.connect(lfoGain).connect(g.gain)
  src.connect(lp).connect(g).connect(master)
  src.start()
  lfo.start()
  // occasional gulls
  const gull = () => {
    if (!ctx || !master) return
    if (!useGame.getState().muted) gullCall()
    setTimeout(gull, 7000 + Math.random() * 14000)
  }
  setTimeout(gull, 4000)
}

function gullCall() {
  const c = ctx!
  const t0 = c.currentTime
  const n = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.22
    const o = c.createOscillator()
    o.type = 'triangle'
    const f = 1500 + Math.random() * 300
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.05)
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.18)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(g).connect(master!)
    o.start(t)
    o.stop(t + 0.22)
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 1) {
  const c = ac()
  if (!c || !master || useGame.getState().muted) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function thud(freq: number, vol: number, dur = 0.12) {
  const c = ac()
  if (!c || !master || useGame.getState().muted) return
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, dur)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 2
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g).connect(master)
  src.start(t)
}

export const sfx = {
  click: () => tone(660, 0.08, 'sine', 0.08),
  chop: () => thud(900, 0.35, 0.09),
  mine: () => {
    thud(2400, 0.2, 0.06)
    tone(1800, 0.05, 'square', 0.02)
  },
  coin: () => {
    tone(1318, 0.12, 'triangle', 0.08)
    tone(1760, 0.18, 'triangle', 0.07, 0.07)
  },
  place: () => {
    thud(300, 0.4, 0.15)
    tone(220, 0.15, 'sine', 0.08)
  },
  done: () => {
    tone(523, 0.14, 'triangle', 0.08)
    tone(659, 0.14, 'triangle', 0.08, 0.1)
    tone(784, 0.25, 'triangle', 0.08, 0.2)
  },
  error: () => tone(180, 0.18, 'sawtooth', 0.04, 0, 0.8),
  splash: () => thud(600, 0.25, 0.3),
  timber: () => {
    thud(160, 0.5, 0.4)
    tone(90, 0.3, 'sine', 0.1)
  },
  bell: () => {
    tone(392, 1.2, 'sine', 0.06)
    tone(784, 0.9, 'sine', 0.03)
  },
  fanfare: () => {
    ;[523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, i * 0.14))
  },
}
