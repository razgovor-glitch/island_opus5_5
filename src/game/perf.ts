// Lightweight start-up profiling (dev only).
const t0 = 0
const marks: [string, number][] = []
const enabled = import.meta.env.DEV || location.search.includes('perf')

export function mark(label: string) {
  if (!enabled) return
  marks.push([label, performance.now() - t0])
}

export function timed<T>(label: string, fn: () => T): T {
  if (!enabled) return fn()
  const s = performance.now()
  const r = fn()
  marks.push([`${label} (${(performance.now() - s).toFixed(0)}ms)`, performance.now() - t0])
  return r
}

export function perfReport() {
  return marks.map(([l, t]) => `${t.toFixed(0).padStart(6)}ms  ${l}`).join('\n')
}

export const perfEnabled = enabled
