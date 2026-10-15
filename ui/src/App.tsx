import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/ui'
import { api } from './lib/api'
import { isAuthed, logout as doLogout, getSid } from './lib/ubus'
import type { Personalization } from './lib/types'
import Layout from './components/Layout'
import Login from './pages/Login'
import Wizard from './pages/Wizard'
import Dashboard from './pages/Dashboard'
import TrafficStats from './pages/TrafficStats'
import RealtimeTraffic from './pages/RealtimeTraffic'
import PerfHistory from './pages/PerfHistory'
import RouteViz from './pages/RouteViz'
import Interfaces from './pages/Interfaces'
import Wireless from './pages/Wireless'
import DhcpDns from './pages/DhcpDns'
import Firewall from './pages/Firewall'
import Diagnostics from './pages/Diagnostics'
import Settings from './pages/Settings'
import LogView from './pages/LogView'
import Processes from './pages/Processes'
import Services from './pages/Services'
import Packages from './pages/Packages'
import Backup from './pages/Backup'
import Mwan3 from './pages/Mwan3'
import Upnp from './pages/Upnp'

/* ---------- 会话 & 个性化上下文 ---------- */
interface Ctx {
  authed: boolean
  setAuthed: (v: boolean) => void
  logout: () => void
  personalization: Personalization | null
  setPersonalization: (p: Personalization) => void
}

const AppCtx = createContext<Ctx>({
  authed: false,
  setAuthed: () => {},
  logout: () => {},
  personalization: null,
  setPersonalization: () => {},
})

export function useApp() {
  return useContext(AppCtx)
}

const DEFAULT_PERS: Personalization = {
  bg_mode: 'builtin',
  bg_file: '',
  bg_url: '/luci-static/yueyue/assets/bg.jpg',
  overlay: 60,
  blur: 14,
  accent: '#7fe7d2',
  theme: 'dark',
  radius: 18,
}

function applyPersonalization(p: Personalization) {
  const r = document.documentElement
  r.dataset.theme = p.theme === 'light' ? 'light' : 'dark'
  r.style.setProperty('--yy-accent', p.accent)
  r.style.setProperty('--yy-accent-dim', `color-mix(in srgb, ${p.accent} 16%, transparent)`)
  r.style.setProperty('--yy-overlay', String((p.overlay ?? 60) / 100))
  r.style.setProperty('--yy-blur', `${p.blur ?? 14}px`)
  r.style.setProperty('--yy-radius', `${p.radius ?? 18}px`)
  if (p.bg_url) {
    r.style.setProperty('--yy-bg-image', `url('${p.bg_url}')`)
  }
}

function Shell() {
  const [authed, setAuthed] = useState(isAuthed())
  const [pers, setPers] = useState<Personalization | null>(null)
  const navigate = useNavigate()

  const setPersonalization = useCallback((p: Personalization) => {
    setPers(p)
    applyPersonalization(p)
  }, [])

  const logout = useCallback(() => {
    doLogout().finally(() => {
      setAuthed(false)
      navigate('/')
    })
  }, [navigate])

  // 启动: 恢复会话 + 拉取个性化
  useEffect(() => {
    api
      .personalization()
      .then((d) => setPersonalization(d.personalization))
      .catch(() => setPersonalization(DEFAULT_PERS))
    if (isAuthed()) {
      api.wizardStatus().then((s) => {
        if (!s.done) navigate('/wizard')
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!authed) {
    return (
      <AppCtx.Provider value={{ authed, setAuthed, logout, personalization: pers, setPersonalization }}>
        <div className="yy-bg" />
        <Login onDone={() => setAuthed(true)} />
      </AppCtx.Provider>
    )
  }

  return (
    <AppCtx.Provider value={{ authed, setAuthed, logout, personalization: pers, setPersonalization }}>
      <div className="yy-bg" />
      <Routes>
        <Route path="/wizard" element={<Wizard />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/traffic" element={<TrafficStats />} />
          <Route path="/realtime" element={<RealtimeTraffic />} />
          <Route path="/perf" element={<PerfHistory />} />
          <Route path="/routes" element={<RouteViz />} />
          <Route path="/interfaces" element={<Interfaces />} />
          <Route path="/wireless" element={<Wireless />} />
          <Route path="/dhcp" element={<DhcpDns />} />
          <Route path="/firewall" element={<Firewall />} />
          <Route path="/diag" element={<Diagnostics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/log" element={<LogView />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/services" element={<Services />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/mwan3" element={<Mwan3 />} />
          <Route path="/upnp" element={<Upnp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppCtx.Provider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  )
}

export { getSid }
