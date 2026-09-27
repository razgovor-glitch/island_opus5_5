import { Component, ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Shows a friendly message instead of a blank page if the 3D scene fails (e.g. WebGL unavailable). */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <div className="crash-card panel">
            <h2>The island sank…</h2>
            <p>Something went wrong while rendering the scene. Your browser may not support WebGL 2, or the graphics driver ran into trouble.</p>
            <pre>{this.state.error.message}</pre>
            <button className="btn-primary" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
