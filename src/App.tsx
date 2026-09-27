import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import * as THREE from 'three'
import { World } from './scene/World'
import { UI } from './ui/UI'
import { useGame } from './game/store'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { mark } from './game/perf'

const DPR = { high: 1.5, medium: 1.25, low: 1 }

export default function App() {
  const quality = useGame((s) => s.quality)
  return (
    <div className="app">
      <ErrorBoundary>
        <Canvas
          shadows="percentage"
          dpr={Math.min(DPR[quality], window.devicePixelRatio || 1)}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: 38, near: 0.5, far: 4000, position: [0, 60, 90] }}
          onCreated={({ gl, scene }) => {
            mark('canvas created')
            if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene })
            gl.localClippingEnabled = true
            // skipping the synchronous shader-status queries makes first-frame compilation much faster
            gl.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug')
            gl.toneMapping = THREE.AgXToneMapping
          }}
        >
          <Suspense fallback={null}>
            <World />
          </Suspense>
        </Canvas>
        <UI />
      </ErrorBoundary>
    </div>
  )
}
