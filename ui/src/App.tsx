import React, { createContext, useContext, useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider, Loading } from './components/ui'
import { api } from './lib/api'
import { isAuthed, logout as doLogout, getSid } from './lib/ubus'
import type { Personalization } from './lib/types'
import Layout from './components/Layout'
import Login from './pages/Login'

/* 路由级代码分割：首屏只加载登录/框架，页面按需加载 */
const Wizard = lazy(() => import('./pages/Wizard'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TrafficStats = lazy(() => import('./pages/TrafficStats'))
const RealtimeTraffic = lazy(() => import('./pages/RealtimeTraffic'))
const PerfHistory = lazy(() => import('./pages/PerfHistory'))
const RouteViz = lazy(() => import('./pages/RouteViz'))
const Interfaces = lazy(() => import('./pages/Interfaces'))
const Wireless = lazy(() => import('./pages/Wireless'))
const DhcpDns = lazy(() => import('./pages/DhcpDns'))
const Firewall = lazy(() => import('./pages/Firewall'))
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const Settings = lazy(() => import('./pages/Settings'))
const LogView = lazy(() => import('./pages/LogView'))
const Processes = lazy(() => import('./pages/Processes'))
const Services = lazy(() => import('./pages/Services'))
const Packages = lazy(() => import('./pages/Packages'))
const Backup = lazy(() => import('./pages/Backup'))
const Mwan3 = lazy(() => import('./pages/Mwan3'))
const Upnp = lazy(() => import('./pages/Upnp'))

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

// 内置插画：支持 WebP 的浏览器换用 bg.webp（体积约为 jpg 一半），其余回落 bg.jpg；
// 个性化里保存/展示的仍是 bg.jpg 路径，仅在套用到背景层时做运行时替换。
const BUILTIN_BG_JPG = '/luci-static/yueyue/assets/bg.jpg'
const SUPPORTS_WEBP = (() => {
  try {
    return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0
  } catch {
    return false
  }
})()

function resolveBgUrl(u: string) {
  return u === BUILTIN_BG_JPG && SUPPORTS_WEBP ? '/luci-static/yueyue/assets/bg.webp' : u
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
    r.style.setProperty('--yy-bg-image', `url('${resolveBgUrl(p.bg_url)}')`)
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
        <Route path="/wizard" element={<Suspense fallback={<Loading />}><Wizard /></Suspense>} />
        <Route element={<Layout />}>
          <Route path="/" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
          <Route path="/traffic" element={<Suspense fallback={<Loading />}><TrafficStats /></Suspense>} />
          <Route path="/realtime" element={<Suspense fallback={<Loading />}><RealtimeTraffic /></Suspense>} />
          <Route path="/perf" element={<Suspense fallback={<Loading />}><PerfHistory /></Suspense>} />
          <Route path="/routes" element={<Suspense fallback={<Loading />}><RouteViz /></Suspense>} />
          <Route path="/interfaces" element={<Suspense fallback={<Loading />}><Interfaces /></Suspense>} />
          <Route path="/wireless" element={<Suspense fallback={<Loading />}><Wireless /></Suspense>} />
          <Route path="/dhcp" element={<Suspense fallback={<Loading />}><DhcpDns /></Suspense>} />
          <Route path="/firewall" element={<Suspense fallback={<Loading />}><Firewall /></Suspense>} />
          <Route path="/diag" element={<Suspense fallback={<Loading />}><Diagnostics /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<Loading />}><Settings /></Suspense>} />
          <Route path="/log" element={<Suspense fallback={<Loading />}><LogView /></Suspense>} />
          <Route path="/processes" element={<Suspense fallback={<Loading />}><Processes /></Suspense>} />
          <Route path="/services" element={<Suspense fallback={<Loading />}><Services /></Suspense>} />
          <Route path="/packages" element={<Suspense fallback={<Loading />}><Packages /></Suspense>} />
          <Route path="/backup" element={<Suspense fallback={<Loading />}><Backup /></Suspense>} />
          <Route path="/mwan3" element={<Suspense fallback={<Loading />}><Mwan3 /></Suspense>} />
          <Route path="/upnp" element={<Suspense fallback={<Loading />}><Upnp /></Suspense>} />
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
