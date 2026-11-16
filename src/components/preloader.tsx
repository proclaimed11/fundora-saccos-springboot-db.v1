import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'

const SHOW_MS = 600

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
      aria-hidden={!visible}
      className={`route-loader fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden ${
        visible
          ? 'opacity-100 transition-none'
          : 'pointer-events-none opacity-0 transition-opacity duration-700 ease-out'
      }`}
    >
      <div className="route-loader__ambient" aria-hidden="true" />
      <div key={pathname} className="route-loader__content">
        <div className="route-loader__mark">
          <div className="route-loader__orbit route-loader__orbit--outer" />
          <div className="route-loader__orbit route-loader__orbit--inner" />
          <img src={logo} alt="" className="route-loader__logo" />
        </div>
        <div className="route-loader__progress" aria-hidden="true">
          <span />
        </div>
        <span className="route-loader__label">Loading your workspace</span>
      </div>
    </div>
  )
}