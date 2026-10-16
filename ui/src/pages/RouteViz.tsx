import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Field, Loading, Modal, Switch, useAsync, useToast } from '../components/ui'
import { api } from '../lib/api'
import type { IfaceInfo, RouteItem } from '../lib/types'

/* ============================================================
   路由工作流（可视化路由配置 v3.1 · 渲染性能优化版）
   - 节点画布：核心路由 / 上联(WAN) / 内网(LAN) / 静态路由 / 模拟设备
   - 左键点击空白处：在鼠标位置弹出快捷框（加路由 / 模拟设备 / 排列 / 保存）
   - 线条交互：点击选中查看、拖动路由连线到其他接口 = 改绑出口
   - 拖拽平移、滚轮缩放、自动排列、布局持久化、右键菜单
   - 性能：mousemove 按帧合并（rAF）、节点/连线 memo 化、拓扑数组缓存
   ============================================================ */

type NodeKind = 'core' | 'wan' | 'lan' | 'route' | 'sim'

interface LayoutPos { x: number; y: number }

interface WfSettings {
  grid: boolean
  flow: boolean
  ports: boolean
  snap: boolean
  runtime: boolean
  subs: boolean
}

interface SimDevice {
  id: string
  name: string
  ip: string
  mac: string
  iface: string
}

interface EdgeInfo {
  key: string
  d: string
  up: boolean
  dashed: boolean
  kind: 'iface' | 'rt-core' | 'rt-if' | 'sim'
  routeId?: string
  ifaceName?: string
  simId?: string
}

interface PopState {
  x: number
  y: number
  kind: 'canvas' | 'edge'
  key?: string
}

const DEFAULT_SETTINGS: WfSettings = { grid: true, flow: true, ports: true, snap: true, runtime: false, subs: true }
const SET_KEY = '***'

function loadSettings(): WfSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const SNAP = 8
const ZERO_POS: LayoutPos = { x: 0, y: 0 }

function nodeSize(kind: NodeKind): { w: number; h: number } {
  if (kind === 'core') return { w: 212, h: 90 }
  if (kind === 'route') return { w: 196, h: 88 }
  if (kind === 'sim') return { w: 132, h: 44 }
  return { w: 184, h: 88 }
}

/* 自适应贝塞尔连线：横向为主，纵向时改用纵向控制点 */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  if (Math.abs(dy) > Math.abs(dx) * 0.9) {
    const k = Math.max(50, Math.abs(dy) * 0.5)
    return `M ${x1} ${y1} C ${x1} ${y1 + k * Math.sign(dy)}, ${x2} ${y2 - k * Math.sign(dy)}, ${x2} ${y2}`
  }
  const k = Math.max(60, Math.abs(dx) * 0.45)
  return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`
}

function centerOf(p: LayoutPos, kind: NodeKind): { x: number; y: number } {
  const s = nodeSize(kind)
  return { x: p.x + s.w / 2, y: p.y + s.h / 2 }
}

function randMac(): string {
  const hex = '0123456789abcdef'
  const seg = () => hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)]
  return `02:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}`
}

interface CtxState {
  x: number
  y: number
  kind: NodeKind | 'canvas'
  id?: string
}

const isWan = (f: IfaceInfo) => f.name.startsWith('wan') || f.name.startsWith('wwan')
const isLoopback = (f: IfaceInfo) => f.device === 'lo' || f.name === 'lo' || f.name === 'loopback'

type DragHandler = (e: React.MouseEvent, key: string) => void
type CtxHandler = (e: React.MouseEvent, kind: NodeKind | 'canvas', id?: string) => void

/* ============================================================
   memo 化节点视图：拖拽 / 平移时只有位置变化的节点重渲染
   ============================================================ */
const CoreNode = React.memo(function CoreNode({ pos, selected, subs, ports, onDrag, onCtx }: {
  pos: LayoutPos
  selected: boolean
  subs: boolean
  ports: boolean
  onDrag: DragHandler
  onCtx: CtxHandler
}) {
  return (
    <div
      className={`wf-node wf-core ${selected ? 'sel' : ''}`}
      style={{ left: pos.x, top: pos.y, ...nodeSize('core') }}
      data-testid="wf-node-core"
      onMouseDown={(e) => onDrag(e, 'core')}
      onContextMenu={(e) => onCtx(e, 'core', 'core')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="n-head"><span className="n-name">月月岛路由</span><i className="n-dot ok" /></div>
      {subs && <div className="n-sub">核心转发 · NAT · 策略分流</div>}
      {subs && <div className="n-sub mono">192.168.21.1</div>}
      {ports && <><i className="wf-port left" /><i className="wf-port right" /></>}
    </div>
  )
})

const IfaceNode = React.memo(function IfaceNode({ f, kind, pos, selected, subs, ports, onDrag, onCtx }: {
  f: IfaceInfo
  kind: NodeKind
  pos: LayoutPos
  selected: boolean
  subs: boolean
  ports: boolean
  onDrag: DragHandler
  onCtx: CtxHandler
}) {
  return (
    <div
      className={`wf-node wf-${kind} ${selected ? 'sel' : ''}`}
      style={{ left: pos.x, top: pos.y, ...nodeSize(kind) }}
      data-testid={`wf-node-${f.name}`}
      data-ifname={f.name}
      onMouseDown={(e) => onDrag(e, f.name)}
      onContextMenu={(e) => onCtx(e, kind, f.name)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="n-head">
        <span className="n-name">{f.name}</span>
        <i className={`n-dot ${f.up ? 'ok' : 'bad'}`} />
      </div>
      {subs && <div className="n-sub mono">{f.ipaddr || '未获取 IP'}</div>}
      {subs && <div className="n-sub">{f.device} · {f.proto}</div>}
      {ports && <i className={`wf-port ${kind === 'wan' ? 'right' : 'left'}`} />}
    </div>
  )
})

const RouteNode = React.memo(function RouteNode({ r, pos, selected, subs, ports, onDrag, onCtx, onEdit }: {
  r: RouteItem
  pos: LayoutPos
  selected: boolean
  subs: boolean
  ports: boolean
  onDrag: DragHandler
  onCtx: CtxHandler
  onEdit: (r: RouteItem) => void
}) {
  return (
    <div
      className={`wf-node wf-route ${selected ? 'sel' : ''} ${r.enabled ? '' : 'off'}`}
      style={{ left: pos.x, top: pos.y, ...nodeSize('route') }}
      data-testid={`wf-route-${r.id}`}
      onMouseDown={(e) => onDrag(e, `route:${r.id}`)}
      onContextMenu={(e) => onCtx(e, 'route', r.id)}
      onDoubleClick={() => onEdit(r)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="n-head">
        <span className="n-name mono">{r.target}</span>
        <i className={`n-dot ${r.enabled ? 'ok' : 'bad'}`} />
      </div>
      {subs && <div className="n-sub">via {r.gateway || '直连'} → {r.iface}</div>}
      {subs && <div className="n-sub">metric {r.metric}{r.enabled ? '' : ' · 已停用'}</div>}
      {ports && <i className="wf-port left" />}
    </div>
  )
})

const SimNode = React.memo(function SimNode({ s, pos, selected, onDrag }: {
  s: SimDevice
  pos: LayoutPos
  selected: boolean
  onDrag: DragHandler
}) {
  return (
    <div
      className={`wf-node wf-sim ${selected ? 'sel' : ''}`}
      style={{ left: pos.x, top: pos.y, ...nodeSize('sim') }}
      data-testid={`wf-sim-${s.id}`}
      onMouseDown={(e) => onDrag(e, `sim:${s.id}`)}
      onClick={(e) => e.stopPropagation()}
      title={`${s.mac} · 接入 ${s.iface}`}
    >
      <div className="n-head">
        <span className="n-name">{s.name}</span>
        <i className="n-dot ok" />
      </div>
      <div className="n-sub mono">{s.ip}</div>
    </div>
  )
})

/* memo 化连线层：平移 / 缩放时完全跳过重渲染 */
const EdgeLayer = React.memo(function EdgeLayer({ edges, sel, flow, rewire, onEdgeDown, onEdgeClick }: {
  edges: EdgeInfo[]
  sel: string | null
  flow: boolean
  rewire: { routeId: string; x: number; y: number; x1: number; y1: number } | null
  onEdgeDown: (e: React.MouseEvent, ed: EdgeInfo) => void
  onEdgeClick: (e: React.MouseEvent, ed: EdgeInfo) => void
}) {
  return (
    <svg className="wf-svg" width="100%" height="100%">
      {edges.map((e) => (
        <g key={e.key}>
          <path
            className="wf-edge-hit"
            d={e.d}
            onMouseDown={(ev) => onEdgeDown(ev, e)}
            onClick={(ev) => onEdgeClick(ev, e)}
          />
          <path
            className={`wf-edge ${flow && e.up && e.kind !== 'sim' ? 'flow' : ''} ${e.dashed ? 'down' : ''} ${sel === e.key ? 'sel' : ''} ${e.kind === 'sim' ? 'sim' : ''}`}
            d={e.d}
          />
        </g>
      ))}
      {rewire && <path className="wf-rewire" d={curve(rewire.x1, rewire.y1, rewire.x, rewire.y)} />}
    </svg>
  )
})

export default function RouteViz() {
  const topo = useAsync(() => api.topology(), [])
  const sys = useAsync(() => api.sysinfo(), [])
  const toast = useToast()
  const navigate = useNavigate()
  const [edit, setEdit] = useState<Partial<RouteItem> | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [layout, setLayout] = useState<Record<string, LayoutPos>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [pan, setPan] = useState<LayoutPos>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [sel, setSel] = useState<string | null>(null)
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [settings, setSettings] = useState<WfSettings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [sims, setSims] = useState<SimDevice[]>([])
  const [pop, setPop] = useState<PopState | null>(null)
  const [rewire, setRewire] = useState<{ routeId: string; x: number; y: number } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragOff = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStart = useRef<{ x: number; y: number; px: number; py: number }>({ x: 0, y: 0, px: 0, py: 0 })
  const downAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const settingsRef = useRef(settings)
  const movedRef = useRef(false)
  const routesRef = useRef<RouteItem[]>([])
  panRef.current = pan
  zoomRef.current = zoom
  settingsRef.current = settings

  /* ---------- 拓扑数据缓存（避免每次渲染重建数组导致连线 memo 失效） ---------- */
  const ifaces = useMemo(() => topo.data?.ifaces || [], [topo.data])
  // 回环口不参与拓扑可视化（不画节点不连线）
  const nodes = useMemo(() => ifaces.filter((f) => !isLoopback(f)), [ifaces])
  const routes = useMemo(() => topo.data?.routes || [], [topo.data])
  routesRef.current = routes
  const staticRoutes = useMemo(() => routes.filter((r) => r.source === 'static'), [routes])
  const runtimeRoutes = useMemo(() => routes.filter((r) => r.source === 'runtime'), [routes])
  const pending = !!topo.data?.pending

  /* ---------- 布局 ---------- */
  const autoPos = useMemo(() => {
    const m: Record<string, LayoutPos> = { core: { x: 430, y: 180 } }
    let wi = 0
    let li = 0
    nodes.forEach((f) => {
      if (isWan(f)) {
        m[f.name] = { x: 48, y: 64 + wi * 128 }
        wi++
      } else {
        m[f.name] = { x: 812, y: 64 + li * 128 }
        li++
      }
    })
    staticRoutes.forEach((r, i) => {
      m[`route:${r.id}`] = { x: 268 + (i % 3) * 260, y: 400 + Math.floor(i / 3) * 128 }
    })
    return m
  }, [nodes, staticRoutes])

  useEffect(() => {
    if (topo.data?.layout) {
      setLayout((prev) => ({ ...(topo.data!.layout as Record<string, LayoutPos>), ...prev }))
    }
  }, [topo.data])

  const posOf = useCallback(
    (key: string): LayoutPos => layout[key] || autoPos[key] || ZERO_POS,
    [layout, autoPos],
  )
  const posOfRef = useRef(posOf)
  posOfRef.current = posOf
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const autoPosRef = useRef(autoPos)
  autoPosRef.current = autoPos

  const setSettingsPersist = (next: WfSettings) => {
    setSettings(next)
    try {
      localStorage.setItem(SET_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  /* 世界坐标换算（相对画布可视区） */
  const toWorld = (cx: number, cy: number): LayoutPos => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { x: (cx - r.left - panRef.current.x) / zoomRef.current, y: (cy - r.top - panRef.current.y) / zoomRef.current }
  }

  /* ---------- 按帧合并的拖拽 / 平移 / 改绑写入 ----------
     mousemove 触发频率远高于刷新率，这里只记录目标值，
     每个动画帧最多提交一次状态更新，手势结束时冲刷残留。 */
  const pendingDrag = useRef<{ key: string; x: number; y: number } | null>(null)
  const pendingPan = useRef<LayoutPos | null>(null)
  const pendingRewire = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef(0)

  const applyPending = useCallback(() => {
    const d = pendingDrag.current
    if (d) {
      pendingDrag.current = null
      setLayout((l) => ({ ...l, [d.key]: { x: d.x, y: d.y } }))
    }
    const p = pendingPan.current
    if (p) {
      pendingPan.current = null
      panRef.current = p
      setPan(p)
    }
    const rw = pendingRewire.current
    if (rw) {
      pendingRewire.current = null
      setRewire((r) => (r ? { ...r, x: rw.x, y: rw.y } : r))
    }
  }, [])

  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      applyPending()
    })
  }, [applyPending])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  /* ---------- 拖拽 / 平移 ----------
     startDrag 保持引用稳定（内部走 posOfRef），否则拖拽时所有 memo 节点会因 handler 变化全部重渲染 */
  const startDrag = useCallback((e: React.MouseEvent, key: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = posOfRef.current(key)
    // 世界坐标 = (屏幕坐标 - 平移) / 缩放，拖拽偏移必须扣掉 pan
    dragOff.current = { x: (e.clientX - panRef.current.x) / zoomRef.current - p.x, y: (e.clientY - panRef.current.y) / zoomRef.current - p.y }
    downAt.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    setDragging(key)
    setSel(key)
    setPop(null)
  }, [])

  const startPan = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSel(null)
    downAt.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y }
  }, [])

  useEffect(() => {
    if (!dragging && !panning) return
    const move = (e: MouseEvent) => {
      if (Math.abs(e.clientX - downAt.current.x) > 4 || Math.abs(e.clientY - downAt.current.y) > 4) movedRef.current = true
      if (dragging) {
        const z = zoomRef.current
        const p = panRef.current
        let x = (e.clientX - p.x) / z - dragOff.current.x
        let y = (e.clientY - p.y) / z - dragOff.current.y
        if (settingsRef.current.snap) {
          x = Math.round(x / SNAP) * SNAP
          y = Math.round(y / SNAP) * SNAP
        }
        pendingDrag.current = { key: dragging, x: Math.max(4, x), y: Math.max(4, y) }
      } else {
        pendingPan.current = {
          x: panStart.current.px + (e.clientX - panStart.current.x),
          y: panStart.current.py + (e.clientY - panStart.current.y),
        }
      }
      schedule()
    }
    const up = () => {
      applyPending()
      setDragging(null)
      setPanning(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging, panning, schedule, applyPending])

  /* 滚轮缩放（原生监听，passive:false 才能阻止页面滚动；锚定鼠标位置缩放） */
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const z0 = zoomRef.current
      const p0 = panRef.current
      const nz = Math.min(1.8, Math.max(0.4, Math.round((z0 + (e.deltaY > 0 ? -0.08 : 0.08)) * 100) / 100))
      const k = nz / z0
      const np = { x: cx - (cx - p0.x) * k, y: cy - (cy - p0.y) * k }
      panRef.current = np
      zoomRef.current = nz
      setPan(np)
      setZoom(nz)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- 线条拖拽改绑出口 ---------- */
  useEffect(() => {
    if (!rewire) return
    const move = (e: MouseEvent) => {
      if (Math.abs(e.clientX - downAt.current.x) > 4 || Math.abs(e.clientY - downAt.current.y) > 4) movedRef.current = true
      const w = toWorld(e.clientX, e.clientY)
      pendingRewire.current = { x: w.x, y: w.y }
      schedule()
    }
    const up = (e: MouseEvent) => {
      applyPending()
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest('[data-ifname]')
        ?.getAttribute('data-ifname')
      const r = routesRef.current.find((x) => x.id === rewire.routeId)
      if (movedRef.current && target && r && target !== r.iface) {
        api
          .routeSave({ ...r, iface: target })
          .then(() => {
            toast(`路由 ${r.target} 出口已改绑到 ${target}（记得应用更改）`, 'ok')
            topo.reload()
          })
          .catch((e2: any) => toast(e2?.message || '改绑失败', 'err'))
      }
      setRewire(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewire, schedule, applyPending])

  /* ---------- 右键菜单 ---------- */
  const openCtx = useCallback((e: React.MouseEvent, kind: NodeKind | 'canvas', id?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 300), kind, id })
    setPop(null)
  }, [])

  useEffect(() => {
    const close = () => {
      setCtx(null)
      setPop(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtx(null)
        setPop(null)
        setShowSettings(false)
      }
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  /* ---------- 画布操作 ---------- */
  const saveLayout = async () => {
    try {
      await api.layoutSave({ ...autoPos, ...layout })
      toast('工作流布局已保存', 'ok')
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    }
  }

  const autoLayout = () => {
    setLayout({})
    setPan({ x: 0, y: 0 })
    setZoom(1)
    panRef.current = { x: 0, y: 0 }
    zoomRef.current = 1
    setSims([])
    toast('已恢复自动排列', 'ok')
    window.setTimeout(() => fitView(), 60)
  }

  function fitView() {
    const el = canvasRef.current
    if (!el) return
    // 走 ref 取最新布局：延迟调用（如模拟设备生成后 80ms）时闭包里的 state 是旧快照
    const l = layoutRef.current
    const a = autoPosRef.current
    const keys = Object.keys({ ...a, ...l })
    let maxX = 0
    let maxY = 0
    keys.forEach((k) => {
      const p = l[k] || a[k] || ZERO_POS
      maxX = Math.max(maxX, p.x + 240)
      maxY = Math.max(maxY, p.y + 130)
    })
    const z = Math.min(1.15, Math.max(0.4, Math.min(el.clientWidth / (maxX + 30), el.clientHeight / (maxY + 30))))
    const nz = Math.round(z * 100) / 100
    zoomRef.current = nz
    panRef.current = { x: 16, y: 12 }
    setZoom(nz)
    setPan({ x: 16, y: 12 })
  }

  /* 数据就绪后自动适应视野，避免节点被画布裁掉 */
  useEffect(() => {
    if (!topo.data) return
    const t = window.setTimeout(() => fitView(), 80)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topo.data])

  const canvasSize = useMemo(() => {
    const keys = Object.keys({ ...autoPos, ...layout })
    let maxX = 1000
    let maxY = 560
    keys.forEach((k) => {
      const p = layout[k] || autoPos[k]
      if (p) {
        maxX = Math.max(maxX, p.x + 260)
        maxY = Math.max(maxY, p.y + 150)
      }
    })
    return { w: maxX, h: maxY }
  }, [autoPos, layout])

  /* ---------- 模拟设备 ---------- */
  const makeSims = () => {
    const lanIf = nodes.find((f) => !isWan(f))
    const positions: Record<string, LayoutPos> = {}
    const list: SimDevice[] = []
    for (let i = 0; i < 100; i++) {
      const id = `sim${i + 1}`
      list.push({
        id,
        name: `设备-${String(i + 1).padStart(3, '0')}`,
        ip: `192.168.21.${10 + i}`,
        mac: randMac(),
        iface: lanIf?.name ?? 'lan',
      })
      positions[`sim:${id}`] = { x: 1040 + (i % 10) * 152, y: 40 + Math.floor(i / 10) * 74 }
    }
    setSims(list)
    setLayout((l) => ({ ...l, ...positions }))
    setPop(null)
    toast('已生成 100 个模拟设备（仅演示，不写入配置）', 'ok')
    window.setTimeout(() => fitView(), 80)
  }

  const clearSims = () => {
    setSims([])
    setLayout((l) => {
      const next: Record<string, LayoutPos> = {}
      Object.keys(l).forEach((k) => {
        if (!k.startsWith('sim:')) next[k] = l[k]
      })
      return next
    })
    setPop(null)
    toast('已清除模拟设备', 'ok')
  }

  /* ---------- 路由 CRUD ---------- */
  const saveRoute = async () => {
    const t = (edit?.target || '').trim()
    if (!t || !edit?.iface) {
      setEditErr('请填写目标网段和出口接口')
      return
    }
    if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(t)) {
      setEditErr('目标网段格式不对，例如 10.8.0.0/24 或 0.0.0.0/0')
      return
    }
    if (edit.gateway && !/^\d{1,3}(\.\d{1,3}){3}$/.test(edit.gateway)) {
      setEditErr('网关格式不对，例如 192.168.21.254')
      return
    }
    try {
      await api.routeSave(edit)
      toast('路由已保存（记得应用更改）', 'ok')
      setEdit(null)
      setEditErr(null)
      topo.reload()
    } catch (e: any) {
      setEditErr(e?.message || '保存失败')
    }
  }

  const delRoute = async (id: string) => {
    if (!confirm('确认删除该静态路由？')) return
    try {
      await api.routeDelete(id)
      toast('已删除（记得应用更改）', 'ok')
      setPop(null)
      topo.reload()
    } catch (e: any) {
      toast(e?.message || '删除失败', 'err')
    }
  }

  const toggleRoute = async (r: RouteItem) => {
    try {
      await api.routeSave({ ...r, enabled: !r.enabled })
      toast(r.enabled ? '已停用（记得应用更改）' : '已启用（记得应用更改）', 'ok')
      topo.reload()
    } catch (e: any) {
      toast(e?.message || '操作失败', 'err')
    }
  }

  const applyAll = async () => {
    try {
      await api.applyRoutes()
      toast('网络配置已应用', 'ok')
      topo.reload()
    } catch (e: any) {
      toast(e?.message || '应用失败', 'err')
    }
  }

  const newRoute = (iface?: string) => {
    setPop(null)
    setEdit({ enabled: true, metric: 0, iface: iface || (nodes[0]?.name ?? 'lan') })
  }

  const openEdit = useCallback((r: RouteItem) => {
    setEdit({ ...r })
    setEditErr(null)
  }, [])

  /* ---------- 连线 ---------- */
  const edges = useMemo(() => {
    const core = centerOf(posOf('core'), 'core')
    const nodeMap = new Map(nodes.map((f) => [f.name, f]))
    const out: EdgeInfo[] = []
    nodes.forEach((f) => {
      const c = centerOf(posOf(f.name), isWan(f) ? 'wan' : 'lan')
      out.push({
        key: `e-${f.name}`,
        d: isWan(f) ? curve(c.x, c.y, core.x, core.y) : curve(core.x, core.y, c.x, c.y),
        up: f.up,
        dashed: false,
        kind: 'iface',
        ifaceName: f.name,
      })
    })
    staticRoutes.forEach((r) => {
      const rc = centerOf(posOf(`route:${r.id}`), 'route')
      out.push({ key: `e-core-${r.id}`, d: curve(core.x, core.y, rc.x, rc.y), up: r.enabled, dashed: !r.enabled, kind: 'rt-core', routeId: r.id })
      const f = nodeMap.get(r.iface)
      if (f) {
        const fc = centerOf(posOf(f.name), isWan(f) ? 'wan' : 'lan')
        out.push({ key: `e-if-${r.id}`, d: curve(rc.x, rc.y, fc.x, fc.y), up: r.enabled && f.up, dashed: !r.enabled, kind: 'rt-if', routeId: r.id, ifaceName: f.name })
      }
    })
    sims.forEach((s) => {
      const sp = centerOf(posOf(`sim:${s.id}`), 'sim')
      const f = nodeMap.get(s.iface)
      const target = f ? centerOf(posOf(f.name), isWan(f) ? 'wan' : 'lan') : core
      out.push({ key: `e-sim-${s.id}`, d: curve(sp.x, sp.y, target.x, target.y), up: true, dashed: false, kind: 'sim', simId: s.id, ifaceName: s.iface })
    })
    return out
  }, [nodes, staticRoutes, sims, posOf])

  /* 线条按下 / 点击 */
  const edgeDownStart = useCallback((e: React.MouseEvent, ed: EdgeInfo) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    downAt.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    if (ed.kind === 'rt-core' || ed.kind === 'rt-if') {
      const w = toWorld(e.clientX, e.clientY)
      setRewire({ routeId: ed.routeId!, x: w.x, y: w.y })
    }
  }, [])

  const edgeClick = useCallback((e: React.MouseEvent, ed: EdgeInfo) => {
    e.stopPropagation()
    if (movedRef.current) return
    setPop({ x: e.clientX, y: e.clientY, kind: 'edge', key: ed.key })
    setSel(ed.key)
  }, [])

  const popEdge = pop?.kind === 'edge' ? edges.find((x) => x.key === pop.key) : undefined
  const popRoute = popEdge?.routeId ? routes.find((x) => x.id === popEdge.routeId) : undefined

  /* 改绑拖拽线的起点（路由节点中心） */
  const rewireView = useMemo(() => {
    if (!rewire) return null
    const c = centerOf(posOf(`route:${rewire.routeId}`), 'route')
    return { routeId: rewire.routeId, x: rewire.x, y: rewire.y, x1: c.x, y1: c.y }
  }, [rewire, posOf])

  if (topo.loading) return <Loading text="正在加载路由工作流…" />

  const online = nodes.filter((f) => f.up).length

  return (
    <div>
      {/* 页面头部 + 摘要 */}
      <div className="row" style={{ gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 260 }}>
          <div className="page-head">
            <div>
              <div className="p-title">路由工作流</div>
              <div className="p-sub muted small">左键点击空白处弹出快捷框 · 拖拽排版 · 点击 / 拖动连线可编辑 · 右键更多配置</div>
            </div>
            <span className="spacer" />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" data-testid="wf-add-route" onClick={() => newRoute()}>＋ 添加路由</button>
              <button className="btn small" data-testid="wf-save-layout" onClick={saveLayout}>保存布局</button>
              <button
                className="btn small primary"
                data-testid="wf-apply"
                onClick={applyAll}
                disabled={!pending}
                title={pending ? '应用未生效的更改' : '没有待应用的更改'}
              >
                {pending ? '应用更改' : '已应用'}
              </button>
            </div>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="pill"><i className={`dot ${online > 0 ? 'ok' : 'danger'}`} />接口 {nodes.length}（在线 {online}）</span>
            <span className="pill"><i className="dot ok" />静态路由 {staticRoutes.length}</span>
            <span className="pill"><i className="dot warn" />运行时路由 {runtimeRoutes.length}</span>
            <span className="pill"><i className="dot ok" />连接数 {sys.data?.conn ?? '—'}</span>
            {sims.length > 0 && <span className="pill"><i className="dot ok" />模拟设备 {sims.length}</span>}
            {pending && <span className="pill"><i className="dot warn" />有未应用的更改</span>}
          </div>
        </div>
      </div>

      <Card
        title="工作流画布"
        right={
          <div className="wf-toolbar" data-testid="wf-toolbar">
            <button className="btn small ghost" data-testid="wf-sim" onClick={makeSims} title="生成 100 个模拟接入设备（仅演示）">模拟 100 设备</button>
            <button className="btn small ghost" data-testid="wf-autolayout" onClick={autoLayout} title="恢复自动排列">自动排列</button>
            <button className="btn small ghost" data-testid="wf-fit" onClick={fitView} title="适应画布">适应</button>
            <span className="wf-zoom">
              <button data-testid="wf-zoom-out" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))}>−</button>
              <b>{Math.round(zoom * 100)}%</b>
              <button data-testid="wf-zoom-in" onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.1) * 100) / 100))}>＋</button>
            </span>
            <button className="btn small ghost" data-testid="wf-refresh" onClick={() => topo.reload()}>⟳ 刷新</button>
            <button className="btn small ghost" data-testid="wf-settings-btn" onClick={() => setShowSettings(true)}>设置</button>
          </div>
        }
      >
        <div
          className={`wf-canvas ${settings.grid ? 'grid' : ''} ${panning ? 'panning' : ''}`}
          ref={canvasRef}
          data-testid="wf-canvas"
          onMouseDown={startPan}
          onContextMenu={(e) => openCtx(e, 'canvas')}
          onClick={(e) => {
            e.stopPropagation()
            setSel(null)
            // 左键点击空白处：在鼠标位置弹出快捷框（拖拽过的不算点击）
            if (!movedRef.current) {
              setPop({ x: e.clientX, y: e.clientY, kind: 'canvas' })
            }
          }}
        >
          <div
            className="wf-world"
            style={{ width: canvasSize.w, height: canvasSize.h, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <EdgeLayer
              edges={edges}
              sel={sel}
              flow={settings.flow}
              rewire={rewireView}
              onEdgeDown={edgeDownStart}
              onEdgeClick={edgeClick}
            />

            {/* 核心节点 */}
            <CoreNode
              pos={posOf('core')}
              selected={sel === 'core'}
              subs={settings.subs}
              ports={settings.ports}
              onDrag={startDrag}
              onCtx={openCtx}
            />

            {/* 接口节点 */}
            {nodes.map((f) => (
              <IfaceNode
                key={f.name}
                f={f}
                kind={isWan(f) ? 'wan' : 'lan'}
                pos={posOf(f.name)}
                selected={sel === f.name}
                subs={settings.subs}
                ports={settings.ports}
                onDrag={startDrag}
                onCtx={openCtx}
              />
            ))}

            {/* 静态路由节点 */}
            {staticRoutes.map((r) => (
              <RouteNode
                key={r.id}
                r={r}
                pos={posOf(`route:${r.id}`)}
                selected={sel === `route:${r.id}`}
                subs={settings.subs}
                ports={settings.ports}
                onDrag={startDrag}
                onCtx={openCtx}
                onEdit={openEdit}
              />
            ))}

            {/* 模拟设备节点（仅演示） */}
            {sims.map((s) => (
              <SimNode
                key={s.id}
                s={s}
                pos={posOf(`sim:${s.id}`)}
                selected={sel === `sim:${s.id}`}
                onDrag={startDrag}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* 运行时路由表 */}
      {settings.runtime && (
        <Card title={`运行时路由表（${runtimeRoutes.length} 条）`}>
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="yy">
              <thead>
                <tr><th>目标网段</th><th>网关</th><th>接口</th><th>跃点</th><th>路由表</th></tr>
              </thead>
              <tbody>
                {runtimeRoutes.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.target}</td>
                    <td className="mono">{r.gateway || <span className="muted">直连</span>}</td>
                    <td>{r.iface}</td>
                    <td>{r.metric}</td>
                    <td className="muted small">{r.table}</td>
                  </tr>
                ))}
                {runtimeRoutes.length === 0 && (
                  <tr><td colSpan={5}><Empty text="没有运行时路由" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 左键快捷框（鼠标在哪就在哪弹出） */}
      {pop && pop.kind === 'canvas' && (
        <div
          className="ctx-menu wf-pop"
          data-testid="wf-pop"
          style={{ left: Math.min(pop.x, window.innerWidth - 220), top: Math.min(pop.y, window.innerHeight - 280) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="ctx-item" data-testid="wf-pop-add" onClick={() => newRoute()}>添加静态路由</button>
          <button className="ctx-item" data-testid="wf-pop-sim" onClick={makeSims}>模拟 100 设备</button>
          {sims.length > 0 && <button className="ctx-item" onClick={clearSims}>清除模拟设备</button>}
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { setPop(null); autoLayout() }}>自动排列</button>
          <button className="ctx-item" onClick={() => { setPop(null); fitView() }}>适应画布</button>
          <button className="ctx-item" onClick={() => { setPop(null); saveLayout() }}>保存布局</button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { setPop(null); setShowSettings(true) }}>工作流设置</button>
          <button className="ctx-item" onClick={() => { setPop(null); topo.reload() }}>⟳ 刷新数据</button>
        </div>
      )}

      {/* 线条选中框：查看 / 编辑 / 拖动改绑 */}
      {pop && pop.kind === 'edge' && popEdge && (
        <div
          className="ctx-menu wf-pop"
          data-testid="wf-edge-pop"
          style={{ left: Math.min(pop.x, window.innerWidth - 240), top: Math.min(pop.y, window.innerHeight - 300) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="wf-pop-head">
            {popEdge.kind === 'sim' && `模拟设备连线 · 接入 ${popEdge.ifaceName}`}
            {popEdge.kind === 'iface' && `接口连线 · ${popEdge.ifaceName}`}
            {(popEdge.kind === 'rt-core' || popEdge.kind === 'rt-if') && `路由连线 · ${popRoute?.target || ''}`}
          </div>
          {popRoute && (
            <>
              <div className="muted small" style={{ padding: '2px 12px 6px' }}>
                via {popRoute.gateway || '直连'} → {popRoute.iface} · metric {popRoute.metric} · {popRoute.enabled ? '启用' : '已停用'}
              </div>
              <button className="ctx-item" onClick={() => { openEdit(popRoute); setPop(null) }}>编辑路由</button>
              <button className="ctx-item" onClick={() => { toggleRoute(popRoute); setPop(null) }}>{popRoute.enabled ? '停用路由' : '启用路由'}</button>
              <button className="ctx-item danger" onClick={() => delRoute(popRoute.id)}>删除路由</button>
              <div className="ctx-sep" />
              <div className="muted small" style={{ padding: '2px 12px 8px', lineHeight: 1.6 }}>拖动这条连线到其他接口节点，可直接改绑出口</div>
            </>
          )}
          {!popRoute && popEdge.kind === 'iface' && (
            <>
              <button className="ctx-item" onClick={() => { newRoute(popEdge.ifaceName); setPop(null) }}>从此接口添加路由</button>
              <button className="ctx-item" onClick={() => { navigate('/diag'); setPop(null) }}>去网络诊断</button>
            </>
          )}
          {!popRoute && popEdge.kind === 'sim' && (
            <button className="ctx-item danger" onClick={() => { setSims((s) => s.filter((x) => x.id !== popEdge.simId)); setPop(null) }}>移除该设备</button>
          )}
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => { setPop(null); setSel(null) }}>关闭</button>
        </div>
      )}

      {/* 右键菜单 */}
      {ctx && (
        <div className="ctx-menu" data-testid="wf-ctx" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
          {ctx.kind === 'canvas' && (
            <>
              <button className="ctx-item" onClick={() => newRoute()}>添加静态路由</button>
              <button className="ctx-item" onClick={makeSims}>模拟 100 设备</button>
              <button className="ctx-item" onClick={autoLayout}>自动排列</button>
              <button className="ctx-item" onClick={fitView}>适应画布</button>
              <button className="ctx-item" onClick={saveLayout}>保存布局</button>
              <div className="ctx-sep" />
              <button className="ctx-item" onClick={() => setShowSettings(true)}>工作流设置</button>
              <button className="ctx-item" onClick={() => topo.reload()}>⟳ 刷新数据</button>
            </>
          )}
          {ctx.kind === 'route' && (
            <>
              <button className="ctx-item" onClick={() => { const r = routes.find((x) => x.id === ctx.id); if (r) openEdit(r) }}>编辑路由</button>
              <button className="ctx-item" onClick={() => { const r = routes.find((x) => x.id === ctx.id); if (r) toggleRoute(r) }}>
                {routes.find((x) => x.id === ctx.id)?.enabled ? '停用路由' : '启用路由'}
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  const r = routes.find((x) => x.id === ctx.id)
                  if (r) navigator.clipboard?.writeText(`${r.target} via ${r.gateway || '直连'} dev ${r.iface}`)
                  toast('路由条目已复制', 'ok')
                }}
              >
                复制路由条目
              </button>
              <div className="ctx-sep" />
              <button className="ctx-item danger" onClick={() => { if (ctx.id) delRoute(ctx.id) }}>删除路由</button>
            </>
          )}
          {(ctx.kind === 'wan' || ctx.kind === 'lan') && (
            <>
              <button className="ctx-item" onClick={() => newRoute(ctx.id)}>从此接口添加路由</button>
              <button
                className="ctx-item"
                onClick={() => {
                  const f = nodes.find((x) => x.name === ctx.id)
                  if (f) toast(`${f.name} · ${f.ipaddr || '未获取 IP'} · ${f.device} · ${f.proto}`, 'ok')
                }}
              >
                查看接口详情
              </button>
              <button className="ctx-item" onClick={() => navigate('/diag')}>去网络诊断</button>
              <div className="ctx-sep" />
              <button className="ctx-item" onClick={saveLayout}>保存布局</button>
            </>
          )}
          {ctx.kind === 'core' && (
            <>
              <button className="ctx-item" onClick={() => newRoute()}>添加静态路由</button>
              <button className="ctx-item" onClick={autoLayout}>自动排列</button>
              <button className="ctx-item" onClick={fitView}>适应画布</button>
            </>
          )}
        </div>
      )}

      {/* 设置抽屉 */}
      {showSettings && (
        <div className="wf-drawer-mask" onClick={() => setShowSettings(false)}>
          <div className="wf-drawer" data-testid="wf-settings-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="d-head">
              <span>工作流设置</span>
              <button className="btn small ghost" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="d-body">
              <div className="wf-set-row"><span>网格背景</span><Switch on={settings.grid} onChange={(v) => setSettingsPersist({ ...settings, grid: v })} /></div>
              <div className="wf-set-row"><span>连线流动动画</span><Switch on={settings.flow} onChange={(v) => setSettingsPersist({ ...settings, flow: v })} /></div>
              <div className="wf-set-row"><span>节点端口圆点</span><Switch on={settings.ports} onChange={(v) => setSettingsPersist({ ...settings, ports: v })} /></div>
              <div className="wf-set-row"><span>拖拽吸附网格</span><Switch on={settings.snap} onChange={(v) => setSettingsPersist({ ...settings, snap: v })} /></div>
              <div className="wf-set-row"><span>节点详情副标题</span><Switch on={settings.subs} onChange={(v) => setSettingsPersist({ ...settings, subs: v })} /></div>
              <div className="wf-set-row"><span>显示运行时路由表</span><Switch on={settings.runtime} onChange={(v) => setSettingsPersist({ ...settings, runtime: v })} /></div>
              <div className="ctx-sep" style={{ margin: '10px 0' }} />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn small" onClick={autoLayout}>重置布局</button>
                <button className="btn small" onClick={saveLayout}>保存布局</button>
              </div>
              <div className="muted small" style={{ marginTop: 12, lineHeight: 1.7 }}>
                提示：左键点击空白处弹出快捷框；点击连线选中查看 / 编辑；拖动路由连线到接口节点改绑出口；双击路由节点打开编辑；布局保存后下次进入自动恢复。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 路由编辑弹窗 */}
      {edit && (
        <Modal title={edit.id ? '编辑静态路由' : '添加静态路由'} onClose={() => { setEdit(null); setEditErr(null) }}>
          <Field label="目标网段 (CIDR)">
            <input className="input mono" placeholder="例如 10.8.0.0/24 或 0.0.0.0/0" data-testid="wf-edit-target"
              value={edit.target || ''} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
          </Field>
          <Field label="网关（留空为直连）">
            <input className="input mono" placeholder="例如 192.168.21.254" data-testid="wf-edit-gateway"
              value={edit.gateway || ''} onChange={(e) => setEdit({ ...edit, gateway: e.target.value })} />
          </Field>
          <div className="grid c2">
            <Field label="出口接口">
              <select className="input" value={edit.iface || 'lan'} data-testid="wf-edit-iface"
                onChange={(e) => setEdit({ ...edit, iface: e.target.value })}>
                {nodes.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="跃点 (metric，小者优先)">
              <input className="input" type="number" min={0} max={65535} value={edit.metric ?? 0} data-testid="wf-edit-metric"
                onChange={(e) => setEdit({ ...edit, metric: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="row">
            <span className="muted small">启用该路由</span>
            <Switch on={edit.enabled !== false} onChange={(v) => setEdit({ ...edit, enabled: v })} />
          </div>
          {editErr && <div className="form-err" data-testid="wf-edit-err">{editErr}</div>}
          <div className="muted small" style={{ marginTop: 8 }}>
            保存后写入 network 配置，需点「应用更改」才会生效。
          </div>
          <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setEdit(null); setEditErr(null) }}>取消</button>
            <button className="btn primary" data-testid="wf-edit-save" onClick={saveRoute}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
