import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, Empty, Field, Loading, Modal, Switch, useAsync, useToast } from '../components/ui'
import { api } from '../lib/api'
import type { IfaceInfo, RouteItem } from '../lib/types'

/* ============================================================
   路由工作流（可视化路由配置 v2）
   - 节点画布：核心路由 / 上联(WAN) / 内网(LAN) / 静态路由
   - 拖拽平移、滚轮缩放、自动排列、布局持久化
   - 右键菜单：节点与画布的快捷配置
   - 设置面板：网格 / 流动动画 / 吸附 / 端口 / 运行时路由 等
   ============================================================ */

type NodeKind = 'core' | 'wan' | 'lan' | 'route'

interface LayoutPos { x: number; y: number }

interface WfSettings {
  grid: boolean
  flow: boolean
  ports: boolean
  snap: boolean
  runtime: boolean
  subs: boolean
}

const DEFAULT_SETTINGS: WfSettings = { grid: true, flow: true, ports: true, snap: true, runtime: true, subs: true }
const SET_KEY = 'yy-wf-settings'

function loadSettings(): WfSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const SNAP = 8

function nodeSize(kind: NodeKind): { w: number; h: number } {
  if (kind === 'core') return { w: 212, h: 90 }
  if (kind === 'route') return { w: 196, h: 88 }
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

interface CtxState {
  x: number
  y: number
  kind: NodeKind | 'canvas'
  id?: string
}

const isWan = (f: IfaceInfo) => f.name.startsWith('wan') || f.name.startsWith('wwan')

export default function RouteViz() {
  const topo = useAsync(() => api.topology(), [])
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

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragOff = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStart = useRef<{ x: number; y: number; px: number; py: number }>({ x: 0, y: 0, px: 0, py: 0 })

  const ifaces = topo.data?.ifaces || []
  const routes = topo.data?.routes || []
  const staticRoutes = routes.filter((r) => r.source === 'static')
  const runtimeRoutes = routes.filter((r) => r.source === 'runtime')
  const pending = !!topo.data?.pending

  /* ---------- 布局 ---------- */
  const autoPos = useMemo(() => {
    const m: Record<string, LayoutPos> = { core: { x: 430, y: 180 } }
    let wi = 0
    let li = 0
    ifaces.forEach((f) => {
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
  }, [ifaces, staticRoutes])

  useEffect(() => {
    if (topo.data?.layout) {
      setLayout((prev) => ({ ...(topo.data!.layout as Record<string, LayoutPos>), ...prev }))
    }
  }, [topo.data])

  const posOf = useCallback(
    (key: string): LayoutPos => layout[key] || autoPos[key] || { x: 0, y: 0 },
    [layout, autoPos],
  )

  const setSettingsPersist = (next: WfSettings) => {
    setSettings(next)
    try {
      localStorage.setItem(SET_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  /* ---------- 拖拽 / 平移 ---------- */
  const startDrag = (e: React.MouseEvent, key: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = posOf(key)
    dragOff.current = { x: e.clientX / zoom - p.x, y: e.clientY / zoom - p.y }
    setDragging(key)
    setSel(key)
  }

  const startPan = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSel(null)
    setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }

  useEffect(() => {
    if (!dragging && !panning) return
    const move = (e: MouseEvent) => {
      if (dragging) {
        setLayout((l) => {
          let x = e.clientX / zoom - dragOff.current.x
          let y = e.clientY / zoom - dragOff.current.y
          if (settings.snap) {
            x = Math.round(x / SNAP) * SNAP
            y = Math.round(y / SNAP) * SNAP
          }
          return { ...l, [dragging]: { x: Math.max(4, x), y: Math.max(4, y) } }
        })
      } else {
        setPan({
          x: panStart.current.px + (e.clientX - panStart.current.x),
          y: panStart.current.py + (e.clientY - panStart.current.y),
        })
      }
    }
    const up = () => {
      setDragging(null)
      setPanning(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging, panning, zoom, settings.snap])

  /* 滚轮缩放（原生监听，passive:false 才能阻止页面滚动） */
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      setZoom((z) => Math.min(1.8, Math.max(0.4, Math.round((z + delta) * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- 右键菜单 ---------- */
  const openCtx = (e: React.MouseEvent, kind: NodeKind | 'canvas', id?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 300), kind, id })
  }

  useEffect(() => {
    const close = () => setCtx(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtx(null)
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
    toast('已恢复自动排列', 'ok')
  }

  const fitView = () => {
    const el = canvasRef.current
    if (!el) return
    const keys = Object.keys({ ...autoPos, ...layout })
    let maxX = 0
    let maxY = 0
    keys.forEach((k) => {
      const p = posOf(k)
      maxX = Math.max(maxX, p.x + 220)
      maxY = Math.max(maxY, p.y + 120)
    })
    const z = Math.min(1.2, Math.max(0.4, Math.min(el.clientWidth / (maxX + 40), el.clientHeight / (maxY + 40))))
    setZoom(Math.round(z * 100) / 100)
    setPan({ x: 20, y: 16 })
  }

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

  const newRoute = (iface?: string) =>
    setEdit({ enabled: true, metric: 0, iface: iface || (ifaces[0]?.name ?? 'lan') })

  /* ---------- 连线 ---------- */
  const edges = useMemo(() => {
    const core = centerOf(posOf('core'), 'core')
    const out: { key: string; d: string; up: boolean; dashed: boolean }[] = []
    ifaces.forEach((f) => {
      const c = centerOf(posOf(f.name), isWan(f) ? 'wan' : 'lan')
      out.push({
        key: `e-${f.name}`,
        d: isWan(f) ? curve(c.x, c.y, core.x, core.y) : curve(core.x, core.y, c.x, c.y),
        up: f.up,
        dashed: false,
      })
    })
    staticRoutes.forEach((r) => {
      const rc = centerOf(posOf(`route:${r.id}`), 'route')
      out.push({ key: `e-core-${r.id}`, d: curve(core.x, core.y, rc.x, rc.y), up: r.enabled, dashed: !r.enabled })
      const f = ifaces.find((x) => x.name === r.iface)
      if (f) {
        const fc = centerOf(posOf(f.name), isWan(f) ? 'wan' : 'lan')
        out.push({ key: `e-if-${r.id}`, d: curve(rc.x, rc.y, fc.x, fc.y), up: r.enabled && f.up, dashed: !r.enabled })
      }
    })
    return out
  }, [ifaces, staticRoutes, posOf])

  if (topo.loading) return <Loading text="正在加载路由工作流…" />

  const online = ifaces.filter((f) => f.up).length

  return (
    <div>
      {/* 页面头部 + 摘要 */}
      <div className="row" style={{ gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 260 }}>
          <div className="page-head">
            <div>
              <div className="p-title">路由工作流</div>
              <div className="p-sub muted small">节点式可视化 · 拖拽排版 · 右键配置 · 保存布局</div>
            </div>
            <span className="spacer" />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" data-testid="wf-add-route" onClick={() => newRoute()}>＋ 添加路由</button>
              <button className="btn small" data-testid="wf-save-layout" onClick={saveLayout}>💾 保存布局</button>
              <button
                className="btn small primary"
                data-testid="wf-apply"
                onClick={applyAll}
                disabled={!pending}
                title={pending ? '应用未生效的更改' : '没有待应用的更改'}
              >
                {pending ? '⚡ 应用更改' : '✓ 已应用'}
              </button>
            </div>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="pill"><i className={`dot ${online > 0 ? 'ok' : 'danger'}`} />接口 {ifaces.length}（在线 {online}）</span>
            <span className="pill"><i className="dot ok" />静态路由 {staticRoutes.length}</span>
            <span className="pill"><i className="dot warn" />运行时路由 {runtimeRoutes.length}</span>
            {pending && <span className="pill"><i className="dot warn" />有未应用的更改</span>}
          </div>
        </div>
      </div>

      <Card
        title="工作流画布"
        right={
          <div className="wf-toolbar" data-testid="wf-toolbar">
            <button className="btn small ghost" data-testid="wf-autolayout" onClick={autoLayout} title="恢复自动排列">🪄 自动排列</button>
            <button className="btn small ghost" data-testid="wf-fit" onClick={fitView} title="适应画布">🎯 适应</button>
            <span className="wf-zoom">
              <button data-testid="wf-zoom-out" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))}>−</button>
              <b>{Math.round(zoom * 100)}%</b>
              <button data-testid="wf-zoom-in" onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.1) * 100) / 100))}>＋</button>
            </span>
            <button className="btn small ghost" data-testid="wf-refresh" onClick={() => topo.reload()}>⟳ 刷新</button>
            <button className="btn small ghost" data-testid="wf-settings-btn" onClick={() => setShowSettings(true)}>⚙️ 设置</button>
          </div>
        }
      >
        <div
          className={`wf-canvas ${settings.grid ? 'grid' : ''} ${panning ? 'panning' : ''}`}
          ref={canvasRef}
          data-testid="wf-canvas"
          onMouseDown={startPan}
          onContextMenu={(e) => openCtx(e, 'canvas')}
          onClick={() => setSel(null)}
        >
          <div
            className="wf-world"
            style={{ width: canvasSize.w, height: canvasSize.h, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg className="wf-svg" width={canvasSize.w} height={canvasSize.h}>
              {edges.map((e) => (
                <path
                  key={e.key}
                  className={`wf-edge ${settings.flow && e.up ? 'flow' : ''} ${e.dashed ? 'down' : ''}`}
                  d={e.d}
                />
              ))}
            </svg>

            {/* 核心节点 */}
            <div
              className={`wf-node wf-core ${sel === 'core' ? 'sel' : ''}`}
              style={{ left: posOf('core').x, top: posOf('core').y, ...nodeSize('core') }}
              data-testid="wf-node-core"
              onMouseDown={(e) => startDrag(e, 'core')}
              onContextMenu={(e) => openCtx(e, 'core', 'core')}
            >
              <div className="n-head"><span className="n-ico">🧠</span><span className="n-name">月月岛路由</span><i className="n-dot ok" /></div>
              {settings.subs && <div className="n-sub">核心转发 · NAT · 策略分流</div>}
              {settings.subs && <div className="n-sub mono">192.168.21.1</div>}
              {settings.ports && <><i className="wf-port left" /><i className="wf-port right" /></>}
            </div>

            {/* 接口节点 */}
            {ifaces.map((f) => {
              const kind: NodeKind = isWan(f) ? 'wan' : 'lan'
              const p = posOf(f.name)
              return (
                <div
                  key={f.name}
                  className={`wf-node wf-${kind} ${sel === f.name ? 'sel' : ''}`}
                  style={{ left: p.x, top: p.y, ...nodeSize(kind) }}
                  data-testid={`wf-node-${f.name}`}
                  onMouseDown={(e) => startDrag(e, f.name)}
                  onContextMenu={(e) => openCtx(e, kind, f.name)}
                >
                  <div className="n-head">
                    <span className="n-ico">{kind === 'wan' ? '🌍' : '📡'}</span>
                    <span className="n-name">{f.name}</span>
                    <i className={`n-dot ${f.up ? 'ok' : 'bad'}`} />
                  </div>
                  {settings.subs && <div className="n-sub mono">{f.ipaddr || '未获取 IP'}</div>}
                  {settings.subs && <div className="n-sub">{f.device} · {f.proto}</div>}
                  {settings.ports && <i className={`wf-port ${kind === 'wan' ? 'right' : 'left'}`} />}
                </div>
              )
            })}

            {/* 静态路由节点 */}
            {staticRoutes.map((r) => {
              const p = posOf(`route:${r.id}`)
              return (
                <div
                  key={r.id}
                  className={`wf-node wf-route ${sel === `route:${r.id}` ? 'sel' : ''} ${r.enabled ? '' : 'off'}`}
                  style={{ left: p.x, top: p.y, ...nodeSize('route') }}
                  data-testid={`wf-route-${r.id}`}
                  onMouseDown={(e) => startDrag(e, `route:${r.id}`)}
                  onContextMenu={(e) => openCtx(e, 'route', r.id)}
                  onDoubleClick={() => {
                    setEdit({ ...r })
                    setEditErr(null)
                  }}
                >
                  <div className="n-head">
                    <span className="n-ico">🔀</span>
                    <span className="n-name mono">{r.target}</span>
                    <i className={`n-dot ${r.enabled ? 'ok' : 'bad'}`} />
                  </div>
                  {settings.subs && <div className="n-sub">via {r.gateway || '直连'} → {r.iface}</div>}
                  {settings.subs && <div className="n-sub">metric {r.metric}{r.enabled ? '' : ' · 已停用'}</div>}
                  {settings.ports && <i className="wf-port left" />}
                </div>
              )
            })}
          </div>

          <div className="wf-hint muted small">左键拖拽节点 / 拖空白平移 / 滚轮缩放 / 右键打开菜单 · 双击路由节点可编辑</div>
        </div>
      </Card>

      {/* 静态路由表 */}
      <Card title={`静态路由（${staticRoutes.length} 条）`} right={<button className="btn primary small" onClick={() => newRoute()}>＋ 添加路由</button>}>
        <div className="table-wrap">
          <table className="yy">
            <thead>
              <tr>
                <th>目标网段</th><th>网关</th><th>接口</th><th>跃点</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {staticRoutes.map((r) => (
                <tr key={r.id} data-testid={`wf-row-${r.id}`}>
                  <td className="mono">{r.target}</td>
                  <td className="mono">{r.gateway || <span className="muted">直连</span>}</td>
                  <td>{r.iface}</td>
                  <td>{r.metric}</td>
                  <td>{r.enabled ? <Badge kind="ok">启用</Badge> : <Badge kind="mute">停用</Badge>}</td>
                  <td>
                    <button className="btn small" onClick={() => { setEdit({ ...r }); setEditErr(null) }}>编辑</button>{' '}
                    <button className="btn small" onClick={() => toggleRoute(r)}>{r.enabled ? '停用' : '启用'}</button>{' '}
                    <button className="btn small danger" onClick={() => delRoute(r.id)}>删除</button>
                  </td>
                </tr>
              ))}
              {staticRoutes.length === 0 && (
                <tr><td colSpan={6}><Empty text="没有静态路由，点右上角添加" /></td></tr>
              )}
            </tbody>
          </table>
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

      {/* 右键菜单 */}
      {ctx && (
        <div className="ctx-menu" data-testid="wf-ctx" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
          {ctx.kind === 'canvas' && (
            <>
              <button className="ctx-item" onClick={() => newRoute()}>➕ 添加静态路由</button>
              <button className="ctx-item" onClick={autoLayout}>🪄 自动排列</button>
              <button className="ctx-item" onClick={fitView}>🎯 适应画布</button>
              <button className="ctx-item" onClick={saveLayout}>💾 保存布局</button>
              <div className="ctx-sep" />
              <button className="ctx-item" onClick={() => setShowSettings(true)}>⚙️ 工作流设置</button>
              <button className="ctx-item" onClick={() => topo.reload()}>⟳ 刷新数据</button>
            </>
          )}
          {ctx.kind === 'route' && (
            <>
              <button className="ctx-item" onClick={() => { const r = routes.find((x) => x.id === ctx.id); if (r) { setEdit({ ...r }); setEditErr(null) } }}>✏️ 编辑路由</button>
              <button className="ctx-item" onClick={() => { const r = routes.find((x) => x.id === ctx.id); if (r) toggleRoute(r) }}>
                {routes.find((x) => x.id === ctx.id)?.enabled ? '⏸ 停用路由' : '▶️ 启用路由'}
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  const r = routes.find((x) => x.id === ctx.id)
                  if (r) navigator.clipboard?.writeText(`${r.target} via ${r.gateway || '直连'} dev ${r.iface}`)
                  toast('路由条目已复制', 'ok')
                }}
              >
                📋 复制路由条目
              </button>
              <div className="ctx-sep" />
              <button className="ctx-item danger" onClick={() => { if (ctx.id) delRoute(ctx.id) }}>🗑️ 删除路由</button>
            </>
          )}
          {(ctx.kind === 'wan' || ctx.kind === 'lan') && (
            <>
              <button className="ctx-item" onClick={() => newRoute(ctx.id)}>➕ 从此接口添加路由</button>
              <button
                className="ctx-item"
                onClick={() => {
                  const f = ifaces.find((x) => x.name === ctx.id)
                  if (f) toast(`${f.name} · ${f.ipaddr || '未获取 IP'} · ${f.device} · ${f.proto}`, 'ok')
                }}
              >
                📋 查看接口详情
              </button>
              <button className="ctx-item" onClick={() => navigate('/diag')}>🩺 去网络诊断</button>
              <div className="ctx-sep" />
              <button className="ctx-item" onClick={saveLayout}>💾 保存布局</button>
            </>
          )}
          {ctx.kind === 'core' && (
            <>
              <button className="ctx-item" onClick={() => newRoute()}>➕ 添加静态路由</button>
              <button className="ctx-item" onClick={autoLayout}>🪄 自动排列</button>
              <button className="ctx-item" onClick={fitView}>🎯 适应画布</button>
            </>
          )}
        </div>
      )}

      {/* 设置抽屉 */}
      {showSettings && (
        <div className="wf-drawer-mask" onClick={() => setShowSettings(false)}>
          <div className="wf-drawer" data-testid="wf-settings-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="d-head">
              <span>⚙️ 工作流设置</span>
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
                <button className="btn small" onClick={autoLayout}>🪄 重置布局</button>
                <button className="btn small" onClick={saveLayout}>💾 保存布局</button>
              </div>
              <div className="muted small" style={{ marginTop: 12, lineHeight: 1.7 }}>
                提示：右键节点可直接编辑 / 启停 / 删除路由；双击路由节点打开编辑；布局保存后下次进入自动恢复。
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
                {ifaces.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
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
          {editErr && <div className="form-err" data-testid="wf-edit-err">⚠️ {editErr}</div>}
          <div className="muted small" style={{ marginTop: 8 }}>
            保存后写入 network 配置，需点「⚡ 应用更改」才会生效。
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
