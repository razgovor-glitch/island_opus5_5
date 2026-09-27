import type { ResKey } from '../game/config'
import type { BuildingType } from '../models/buildings'

export function ResIcon({ res, size = 22 }: { res: ResKey; size?: number }) {
  switch (res) {
    case 'wood':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="2.5" y="8" width="16" height="9" rx="4.5" fill="#9a6538" stroke="#5e3a1f" strokeWidth="1.3" />
          <ellipse cx="18.5" cy="12.5" rx="3.2" ry="4.5" fill="#e3bf86" stroke="#5e3a1f" strokeWidth="1.3" />
          <ellipse cx="18.5" cy="12.5" rx="1.4" ry="2" fill="none" stroke="#b58a52" strokeWidth="1" />
          <path d="M5 11.5h8M6.5 14h6" stroke="#7a4b27" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )
    case 'stone':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M4 17.5 6 9.5l6-4 6.5 3 2.5 8-4 2.5H7.5z" fill="#b7b1a8" stroke="#5f5a54" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 9.5l5.5 3 7-4M11.5 12.5 12 20" stroke="#8a847c" strokeWidth="1.1" fill="none" />
        </svg>
      )
    case 'fish':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M3 12c3-5 10-6 14-2l4-3v10l-4-3c-4 4-11 3-14-2z" fill="#7fa9bd" stroke="#34566a" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="7.5" cy="11" r="1.1" fill="#1d2f3a" />
          <path d="M11 9.5c1 1.5 1 3.5 0 5" stroke="#4f7a90" strokeWidth="1" fill="none" />
        </svg>
      )
    case 'gold':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8.5" fill="#f0c24a" stroke="#8a6412" strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5.6" fill="none" stroke="#c9961f" strokeWidth="1.2" />
          <path d="M10.5 9.5h3v5h-3z" fill="#c9961f" />
        </svg>
      )
  }
}

export function PeopleIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="7.5" r="3.2" fill="#e9b893" stroke="#6b4a32" strokeWidth="1.2" />
      <path d="M3.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#b5483a" stroke="#6b2e24" strokeWidth="1.2" />
      <circle cx="16.5" cy="8.5" r="2.7" fill="#e9b893" stroke="#6b4a32" strokeWidth="1.1" />
      <path d="M13.2 13.6c.9-.6 2-.9 3.3-.9 2.8 0 4.6 2.3 4.6 6h-5.3" fill="#e9e1cf" stroke="#7a6a52" strokeWidth="1.1" />
    </svg>
  )
}

export function HouseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 11 12 4l9 7" fill="none" stroke="#6b4a32" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5.5 10v9.5h13V10" fill="#c9965f" stroke="#6b4a32" strokeWidth="1.5" />
      <rect x="10" y="13.5" width="4" height="6" fill="#6b4a32" />
    </svg>
  )
}

export function BuildingIcon({ type, size = 40 }: { type: BuildingType; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 48 48' }
  switch (type) {
    case 'cottage':
      return (
        <svg {...s} aria-hidden>
          <path d="M8 24 24 11l16 13" fill="#b88c63" stroke="#5e3a1f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M11 22v17h26V22L24 12z" fill="#9a6538" stroke="#5e3a1f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 25 24 10l18 15" fill="none" stroke="#6e4a2b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="31" y="11" width="4.5" height="8" fill="#9d978f" stroke="#5f5a54" strokeWidth="1.5" />
          <path d="M20 39v-8a4 4 0 0 1 8 0v8z" fill="#5e3a1f" />
          <rect x="13.5" y="26" width="5" height="5" fill="#2c3a44" stroke="#e2cdb4" strokeWidth="1.3" />
        </svg>
      )
    case 'fishery':
      return (
        <svg {...s} aria-hidden>
          <path d="M4 38c6-2 10 2 16 0s10-2 16 0 8 1 8 1v5H4z" fill="#3d8fa8" />
          <path d="M9 22 21 13l12 9" fill="none" stroke="#6e4a2b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 21v14h20V21l-10-7z" fill="#9a6538" stroke="#5e3a1f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M28 27c3-3 8-3 11 0l3-2v7l-3-2c-3 3-8 3-11 0z" fill="#9fc0cf" stroke="#34566a" strokeWidth="1.5" />
        </svg>
      )
    case 'lumber':
      return (
        <svg {...s} aria-hidden>
          <rect x="6" y="28" width="26" height="8" rx="4" fill="#9a6538" stroke="#5e3a1f" strokeWidth="2" />
          <rect x="10" y="20" width="26" height="8" rx="4" fill="#a8744a" stroke="#5e3a1f" strokeWidth="2" />
          <ellipse cx="36" cy="24" rx="3" ry="4" fill="#e3bf86" stroke="#5e3a1f" strokeWidth="1.6" />
          <path d="M30 8l10 10" stroke="#7a4b27" strokeWidth="3" strokeLinecap="round" />
          <path d="M36 6c4 0 6 2 6 6l-5-1z" fill="#9aa0a6" stroke="#4b4f54" strokeWidth="1.5" />
        </svg>
      )
    case 'quarry':
      return (
        <svg {...s} aria-hidden>
          <path d="M6 40l4-12 9-5 9 3 5 11-4 3H9z" fill="#b7b1a8" stroke="#5f5a54" strokeWidth="2" strokeLinejoin="round" />
          <rect x="30" y="30" width="10" height="8" fill="#d4cfc6" stroke="#5f5a54" strokeWidth="1.8" />
          <path d="M20 21 34 7" stroke="#7a4b27" strokeWidth="3" strokeLinecap="round" />
          <path d="M26 6c5-1 10 1 12 5-4-2-8-2-12 1z" fill="#9aa0a6" stroke="#4b4f54" strokeWidth="1.5" />
        </svg>
      )
    case 'lighthouse':
      return (
        <svg {...s} aria-hidden>
          <path d="M18 42 20 14h8l2 28z" fill="#f1ece2" stroke="#5f4a3a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M19.2 25h9.6l.6 7h-10.8zM18.4 36h11.2l.4 6H18z" fill="#b8483a" />
          <rect x="18" y="12" width="12" height="3" fill="#3d3a38" />
          <rect x="20" y="6" width="8" height="6" fill="#ffe3a3" stroke="#3d3a38" strokeWidth="1.5" />
          <path d="M19 6 24 1l5 5z" fill="#b8483a" stroke="#5f4a3a" strokeWidth="1.2" />
          <path d="M31 8l12-3M31 10l12 3M17 8 5 5M17 10 5 13" stroke="#f4c542" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
  }
}

export function ShipIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 15h18l-3 5H6z" fill="#8a5a38" stroke="#4a2f1c" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 3v12" stroke="#4a2f1c" strokeWidth="1.3" />
      <path d="M12 4c4 1 6 4 6 9h-6zM11 6c-3 1-5 3-5 7h5z" fill="#efe4c8" stroke="#8a7a5a" strokeWidth="1" />
      <path d="M12 3l3 1-3 1" fill="#2f5f9a" />
    </svg>
  )
}
