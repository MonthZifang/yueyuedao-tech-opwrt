import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../App'
import { api } from '../lib/api'
import { useInterval } from './ui'

interface MenuItem {
  to: string
  label: string
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

const MENU: MenuGroup[] = [
  {
    label: '',
    items: [{ to: '/', label: '首页' }],
  },
  {
    label: '流量与监控',
    items: [
      { to: '/traffic', label: '流量统计' },
      { to: '/realtime', label: '实时流量' },
      { to: '/perf', label: '性能监控' },
    ],
  },
  {
    label: '网络',
    items: [
      { to: '/interfaces', label: '接口' },
      { to: '/wireless', label: '无线' },
      { to: '/dhcp', label: 'DHCP / DNS' },
      { to: '/firewall', label: '防火墙' },
      { to: '/routes', label: '路由工作流' },
      { to: '/mwan3', label: '多拨负载均衡' },
      { to: '/diag', label: '网络诊断' },
    ],
  },
  {
    label: '服务',
    items: [
      { to: '/services', label: '启动项' },
      { to: '/upnp', label: 'UPnP' },
      { to: '/packages', label: '软件包' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/settings', label: '系统设置' },
      { to: '/log', label: '系统日志' },
      { to: '/processes', label: '进程' },
      { to: '/backup', label: '备份 / 升级' },
    ],
  },
  {
    label: '月月岛',
    items: [{ to: '/wizard', label: '首次设置向导' }],
  },
]

const TITLES: Record<string, string> = {
  '/': '首页',
  '/traffic': '流量统计',
  '/realtime': '实时流量',
  '/perf': '性能监控',
  '/routes': '路由工作流',
  '/interfaces': '网络接口',
  '/wireless': '无线网络',
  '/dhcp': 'DHCP / DNS',
  '/firewall': '防火墙',
  '/diag': '网络诊断',
  '/settings': '系统设置',
  '/log': '系统日志',
  '/processes': '进程',
  '/services': '启动项',
  '/packages': '软件包',
  '/backup': '备份 / 升级',
  '/mwan3': '多拨负载均衡',
  '/upnp': 'UPnP 服务',
}

interface MiniStats {
  cpu: number
  mem: number
  conn: number
  clock: string
}

/* 导航分组折叠状态（持久化） */
const FOLD_KEY = 'yy-nav-fold'
function loadFold(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}')
  } catch {
    return {}
  }
}

function calc(sys: {
  cpu: { user: number; nice: number; system: number; idle: number; iowait: number; irq: number; softirq: number; total: number }
  mem: Record<string, number>
  conn: number
}): MiniStats {
  const cpu = Math.round(((sys.cpu.total - sys.cpu.idle - sys.cpu.iowait) / Math.max(1, sys.cpu.total)) * 100)
  const memTotal = sys.mem?.MemTotal || 0
  const mem = memTotal ? Math.round(((memTotal - (sys.mem.MemAvailable || 0)) / memTotal) * 100) : 0
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return { cpu, mem, conn: sys.conn, clock: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

export default function Layout() {
  const { personalization, setPersonalization, logout } = useApp()
  // 默认左侧栏展开，点左上角 ☰ / Ctrl+B 收起
  const [collapsed, setCollapsed] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [stats, setStats] = useState<MiniStats | null>(null)
  const [fold, setFold] = useState<Record<string, boolean>>(loadFold)
  const [q, setQ] = useState('')
  const loc = useLocation()

  const toggleFold = (label: string) => {
    setFold((f) => {
      // 未记录 = 默认折叠，只有用户点击后才展开
      const next = { ...f, [label]: f[label] === false ? true : false }
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  /* 导航搜索过滤 */
  const kw = q.trim().toLowerCase()
  const filteredMenu = MENU.map((g) => ({
    ...g,
    items: g.items.filter((it) => !kw || it.label.toLowerCase().includes(kw) || it.to.includes(kw)),
  })).filter((g) => g.items.length > 0)

  /* 当前页面所属分组（面包屑） */
  const curGroup = MENU.find((g) => g.items.some((i) => i.to === loc.pathname))?.label || ''

  /* Ctrl+B 切换侧边栏 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allFolded = MENU.filter((g) => g.label).every((g) => fold[g.label] !== false)
  const toggleFoldAll = () => {
    setFold((f) => {
      const next: Record<string, boolean> = {}
      MENU.filter((g) => g.label).forEach((g) => {
        next[g.label] = !allFolded
      })
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  const refreshStats = () => {
    api.sysinfo().then((s) => setStats(calc(s))).catch(() => {})
  }
  useEffect(refreshStats, [])
  useInterval(refreshStats, 30000)

  const toggleTheme = () => {
    if (!personalization) return
    const next = { ...personalization, theme: personalization.theme === 'dark' ? 'light' : 'dark' }
    setPersonalization(next)
    api.personalizationSet({ theme: next.theme }).catch(() => {})
  }

  const toggleNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches) {
      setNavOpen((v) => !v)
    } else {
      setCollapsed((v) => !v)
    }
  }

  return (
    <div className="yy-shell">
      <div className={`side-mask ${navOpen ? 'on' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`yy-side ${collapsed ? 'collapsed' : ''} ${navOpen ? 'open' : ''}`}>
        <div className="yy-brand">
          <img src="/luci-static/yueyue/assets/logo.png" alt="logo" />
          <div>
            <div className="t">月月岛科技</div>
            <div className="s">YUEYUEDAO TECH</div>
          </div>
        </div>
        <nav className="yy-nav">
          <div className="yy-nav-search">
            <input
              className="nav-q"
              placeholder="搜索菜单… (Ctrl+B 收起侧栏)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button className="q-clear" onClick={() => setQ('')} title="清除">✕</button>
            ) : (
              <button className="q-clear" onClick={toggleFoldAll} title={allFolded ? '全部展开' : '全部折叠'}>
                {allFolded ? '⤒' : '⤓'}
              </button>
            )}
          </div>
          {filteredMenu.length === 0 && <div className="yy-nav-empty muted small">没有匹配的菜单</div>}
          {filteredMenu.map((g, gi) => {
            const folded = !!g.label && !kw && fold[g.label] !== false
            return (
              <div className={`yy-nav-group ${folded ? 'folded' : ''}`} key={gi}>
                {g.label ? (
                  <button type="button" className="yy-nav-label" onClick={() => toggleFold(g.label)} title="展开 / 收起">
                    <span className="arrow">{folded ? '▸' : '▾'}</span>
                    {g.label}
                  </button>
                ) : null}
                <div className="yy-nav-items">
                  {g.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      end={it.to === '/'}
                      className={({ isActive }) => `yy-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => setNavOpen(false)}
                    >
                      {it.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="yy-side-foot">
          <span className="btn small ghost" style={{ cursor: 'pointer' }} onClick={toggleTheme} title="切换深浅主题">
            {personalization?.theme === 'light' ? '深色' : '浅色'}
          </span>
          <span className="mono">yueyue · v2.1.0</span>
        </div>
      </aside>

      <div className="yy-main">
        <header className="yy-top">
          <span className="btn small ghost" onClick={toggleNav} title="展开 / 收起侧边栏 (Ctrl+B)">☰</span>
          <div>
            <div className="title">{TITLES[loc.pathname] || '月月岛控制台'}</div>
            <div className="crumb">
              月月岛科技企业路由 · 控制台{curGroup ? ` / ${curGroup}` : ''} / {TITLES[loc.pathname] || '首页'}
            </div>
          </div>
          <span className="spacer" />
          {stats && (
            <div className="yy-top-stats">
              <span className="pill"><i className={`dot ${stats.cpu > 85 ? 'danger' : stats.cpu > 60 ? 'warn' : 'ok'}`} />CPU {stats.cpu}%</span>
              <span className="pill"><i className={`dot ${stats.mem > 85 ? 'danger' : stats.mem > 70 ? 'warn' : 'ok'}`} />MEM {stats.mem}%</span>
              <span className="pill"><i className="dot ok" />连接 {stats.conn}</span>
              <span className="pill mono">{stats.clock}</span>
            </div>
          )}
          <NavLink to="/wizard" className="btn small">向导</NavLink>
          <button className="btn small ghost" onClick={logout}>退出</button>
        </header>
        <main className="yy-content">
          <div className="page-anim" key={loc.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
