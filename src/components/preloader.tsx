import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const SHOW_MS = 600

// a 3 x 3 grid; each tile's delay follows its diagonal (row + column), so the light sweeps corner to corner
const TILES = Array.from({ length: 9 }, (_, i) => Math.floor(i / 3) + (i % 3))

export function Preloader() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(true)
  const [lastPath, setLastPath] = useState(pathname)

  if (pathname !== lastPath) {
    setLastPath(pathname)
    setVisible(true)
  }

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), SHOW_MS)
    return () => clearTimeout(timer)
  }, [visible, pathname])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={`route-loader fixed inset-0 z-[1000] flex items-center justify-center ${
        visible
          ? 'opacity-100 transition-none'
          : 'pointer-events-none opacity-0 transition-opacity duration-500 ease-out'
      }`}
    >
      <div key={pathname} className="route-loader__content">
        <div className="route-loader__grid" aria-hidden="true">
          {TILES.map((diagonal, i) => (
            <span key={i} style={{ animationDelay: `${diagonal * 110}ms` }} />
          ))}
        </div>
        <span className="route-loader__label">Loading</span>
      </div>
    </div>
  )
}
