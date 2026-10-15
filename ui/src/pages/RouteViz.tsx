import React, { useEffect, useRef, useState } from 'react'
import { Card, Badge, Loading, Modal, Field, useAsync, useToast, Empty } from '../components/ui'
import { api } from '../lib/api'
import type { RouteItem, IfaceInfo } from '../lib/types'

interface LayoutPos { x: number; y: number }

export default function RouteViz() {
  const topo = useAsync(() => api.topology(), [])
  const toast = useToast()
  const [edit, setEdit] = useState<Partial<RouteItem> | null>(null)
  const [layout, setLayout] = useState<Record<string, LayoutPos>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const dragOff = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (topo.data?.layout) {
      setLayout((prev) => ({ ...(topo.data!.layout as Record<string, LayoutPos>), ...prev }))
    }
  }, [topo.data])

  const ifaces = topo.data?.ifaces || []
  const routes = topo.data?.routes || []

  const pos = (name: string, idx: number): LayoutPos => {
    if (layout[name]) return layout[name]
    return { x: 220 + (idx % 3) * 190, y: 30 + Math.floor(idx / 3) * 130 }
  }

  const onMouseDown = (e: React.MouseEvent, name: string) => {
    const p = pos(name, 0)
    dragOff.current = { x: e.clientX - p.x, y: e.clientY - p.y }
    setDragging(name)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setLayout((l) => ({
      ...l,
      [dragging]: {
        x: Math.max(8, e.clientX - dragOff.current.x),
        y: Math.max(8, e.clientY - dragOff.current.y),
      },
    }))
  }

  const saveLayout = async () => {
    try {
      await api.layoutSave(layout)
      toast('拓扑布局已保存', 'ok')
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    }
  }

  const saveRoute = async () => {
    if (!edit?.target || !edit?.iface) {
      toast('请填写目标网段和接口', 'err')
      return
    }
    try {
      await api.routeSave(edit)
      toast('路由已保存', 'ok')
      setEdit(null)
      topo.reload()
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
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

  const applyAll = async () => {
    try {
      await api.applyRoutes()
      toast('网络配置已应用', 'ok')
      topo.reload()
    } catch (e: any) {
      toast(e?.message || '应用失败', 'err')
    }
  }

  if (topo.loading) return <Loading />

  return (
    <div>
      {topo.data?.pending && (
        <div className="card row" style={{ borderColor: 'color-mix(in srgb, var(--warn) 50%, transparent)' }}>
          <Badge kind="warn">有未应用的更改</Badge>
          <span className="grow muted small">路由配置已修改但尚未生效</span>
          <button className="btn primary" onClick={applyAll}>立即应用</button>
        </div>
      )}

      <Card
        title="网络拓扑（可拖动节点保存布局）"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={saveLayout}>保存布局</button>
            <button className="btn small" onClick={() => topo.reload()}>刷新</button>
          </div>
        }
      >
        <div
          className="topo-canvas"
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
          style={{ height: 120 + Math.ceil(ifaces.length / 3) * 130 }}
        >
          {/* 路由器核心节点 */}
          <div
            className="topo-node topo-wan"
            style={{ left: 20, top: 40, width: 170, borderColor: 'var(--yy-accent)' }}
          >
            <div className="n-title">🌐 月月岛路由</div>
            <div className="n-sub">核心转发 · NAT</div>
          </div>

          {ifaces.map((f, i) => {
            const p = pos(f.name, i)
            return (
              <div
                key={f.name}
                className={`topo-node ${f.name.startsWith('wan') || f.name.startsWith('wwan') ? 'topo-wan' : 'topo-lan'}`}
                style={{ left: p.x, top: p.y }}
                onMouseDown={(e) => onMouseDown(e, f.name)}
              >
                <div className="n-title">
                  {f.name.startsWith('wan') ? '🌍' : '📡'} {f.name}
                  <span
                    style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: 8,
                      background: f.up ? 'var(--ok)' : 'var(--danger)', marginLeft: 6,
                    }}
                  />
                </div>
                <div className="n-sub">{f.ipaddr || '未获取 IP'}</div>
                <div className="n-sub">{f.device} · {f.proto}</div>
              </div>
            )
          })}

          <svg className="topo-svg" style={{ width: '100%', height: '100%' }}>
            {ifaces.map((f, i) => {
              const p = pos(f.name, i)
              return (
                <line
                  key={f.name}
                  x1={105}
                  y1={75}
                  x2={p.x + 75}
                  y2={p.y + 30}
                  stroke={f.up ? 'var(--yy-accent)' : 'var(--text-2)'}
                  strokeWidth={1.6}
                  strokeDasharray={f.up ? '' : '5 5'}
                  opacity={0.7}
                />
              )
            })}
          </svg>
        </div>
      </Card>

      <Card
        title="静态路由"
        right={<button className="btn primary small" onClick={() => setEdit({ enabled: true, metric: 0, iface: 'lan' })}>＋ 添加路由</button>}
      >
        <div className="table-wrap">
          <table className="yy">
            <thead>
              <tr>
                <th>目标网段</th><th>网关</th><th>接口</th><th>跃点</th><th>状态</th><th>来源</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.filter((r) => r.source === 'static').map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.target}</td>
                  <td className="mono">{r.gateway || <span className="muted">直连</span>}</td>
                  <td>{r.iface}</td>
                  <td>{r.metric}</td>
                  <td>{r.enabled ? <Badge kind="ok">启用</Badge> : <Badge kind="mute">停用</Badge>}</td>
                  <td><Badge kind="mute">静态</Badge></td>
                  <td>
                    <button className="btn small" onClick={() => setEdit({ ...r })}>编辑</button>{' '}
                    <button className="btn small danger" onClick={() => delRoute(r.id)}>删除</button>
                  </td>
                </tr>
              ))}
              {routes.filter((r) => r.source === 'static').length === 0 && (
                <tr><td colSpan={7}><Empty text="没有静态路由" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`运行时路由表（${routes.filter((r) => r.source === 'runtime').length} 条）`}>
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="yy">
            <thead>
              <tr><th>目标网段</th><th>网关</th><th>接口</th><th>跃点</th><th>路由表</th></tr>
            </thead>
            <tbody>
              {routes.filter((r) => r.source === 'runtime').map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.target}</td>
                  <td className="mono">{r.gateway || <span className="muted">直连</span>}</td>
                  <td>{r.iface}</td>
                  <td>{r.metric}</td>
                  <td className="muted small">{r.table}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id && String(edit.id).startsWith('rt') === false ? '编辑静态路由' : '添加静态路由'} onClose={() => setEdit(null)}>
          <Field label="目标网段 (CIDR)">
            <input className="input mono" placeholder="例如 10.8.0.0/24 或 0.0.0.0/0"
              value={edit.target || ''} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
          </Field>
          <Field label="网关（留空为直连）">
            <input className="input mono" placeholder="例如 192.168.21.254"
              value={edit.gateway || ''} onChange={(e) => setEdit({ ...edit, gateway: e.target.value })} />
          </Field>
          <div className="grid c2">
            <Field label="出口接口">
              <select className="input" value={edit.iface || 'lan'} onChange={(e) => setEdit({ ...edit, iface: e.target.value })}>
                {ifaces.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="跃点 (metric)">
              <input className="input" type="number" value={edit.metric ?? 0}
                onChange={(e) => setEdit({ ...edit, metric: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="row">
            <span className="muted small">启用该路由</span>
            <input type="checkbox" checked={edit.enabled !== false}
              onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />
          </div>
          <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={saveRoute}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
