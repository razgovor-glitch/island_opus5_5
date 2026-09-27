import { createRoot } from 'react-dom/client'
import App from './App'
import { useGame } from './game/store'
import * as sim from './game/sim'
import * as world from './game/world'
import * as cam from './scene/CameraRig'
import * as placement from './scene/Placement'
import * as nav from './game/nav'
import * as save from './game/save'
import './styles.css'

if (import.meta.env.DEV) Object.assign(window, { __game: useGame, __sim: sim, __world: world, __cam: cam, __placement: placement, __nav: nav, __save: save })

createRoot(document.getElementById('root')!).render(<App />)
