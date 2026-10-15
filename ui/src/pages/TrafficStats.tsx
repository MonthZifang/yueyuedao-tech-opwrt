import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Loading, Empty, Modal, Badge, useAsync, useToast, useInterval } from '../components/ui'
import { api } from '../lib/api'
import { fmtBytes, fmtTime, fmtMonth } from '../lib/format'
import type { TrafficIp, Flow } from '../lib/types'

export default function TrafficStats() {
  const [sp, setSp] = useSearchParams()
  const [month, setMonth] = useState<string>('')
  const [sortKey, setSortKey] = useState<'total' | 'up' | 'down' | 'ip'>('total')
  const [detailIp, setDetailIp] = useState<TrafficIp | null>(null)
  const [flows, setFlows] = useState<Flow[]>([])
  const [flowBusy, setFlowBusy] = useState(false)
  const toast = useToast()

  const traffic = useAsync(() => api.traffic(month || undefined), [month])

  useEffect(() => {
    const ip = sp.get('ip')
    if (ip && traffic.data) {
      const found = traffic.data.ips.find((x) => x.ip === ip)
      if (found) setDetailIp(found)
    }
  }, [sp, traffic.data])

  const loadFlows = async (ip: string) => {
    setFlowBusy(true)
    try {
      const d = await api.flows(ip, 300)
      setFlows(d.flows)
    } catch (e: any) {
      toast(e?.message || '获取连接失败', 'err')
    } finally {
      setFlowBusy(false)
    }
  }

  useEffect(() => {
    if (detailIp) loadFlows(detailIp.ip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailIp?.ip])

  const rows = useMemo(() => {
    const list = [...(traffic.data?.ips || [])]
    list.sort((a, b) => {
      if (sortKey === 'ip') return a.ip.localeCompare(b.ip)
      return (b[sortKey] as number) - (a[sortKey] as number)
    })
    return list
  }, [traffic.data, sortKey])

  const hosts = traffic.data?.hosts || {}

  return (
    <div>
      <Card>
        <div className="row wrap">
          <div className="grow">
            <div className="stat">
              <div className="label">{traffic.data ? fmtMonth(traffic.data.month) : '本月'} · 全网流量</div>
              <div className="value">
                {traffic.data ? fmtBytes(traffic.data.totals.up + traffic.data.totals.down) : '—'}
                <span className="unit">
                  （↑ {fmtBytes(traffic.data?.totals.up)} ↓ {fmtBytes(traffic.data?.totals.down)}）
                </span>
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="input"
              style={{ width: 150 }}
              value={month || (traffic.data?.month ?? '')}
              onChange={(e) => setMonth(e.target.value)}
            >
              {(traffic.data?.months || []).map((m) => (
                <option key={m.ym} value={m.ym}>{fmtMonth(m.ym)}</option>
              ))}
            </select>
            <button className="btn" onClick={() => traffic.reload()}>刷新</button>
          </div>
        </div>
      </Card>

      <Card title={`按 IP 统计（${rows.length} 个）`}>
        {traffic.loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text="暂无数据。采样守护每 30 秒统计一次各 IP 的上下行流量" />
        ) : (
          <div className="table-wrap">
            <table className="yy">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => setSortKey('ip')}>IP 地址</th>
                  <th>主机名</th>
                  <th className="sortable" onClick={() => setSortKey('up')}>上行</th>
                  <th className="sortable" onClick={() => setSortKey('down')}>下行</th>
                  <th className="sortable" onClick={() => setSortKey('total')}>合计</th>
                  <th>流量占比</th>
                  <th>最近活跃</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const max = rows[0]?.total || 1
                  return (
                    <tr key={r.ip} className="clickable" onClick={() => setDetailIp(r)}>
                      <td className="mono" style={{ fontWeight: 700 }}>{r.ip}</td>
                      <td>{hosts[r.ip] ? <Badge kind="mute">{hosts[r.ip]}</Badge> : <span className="muted">—</span>}</td>
                      <td>{fmtBytes(r.up)}</td>
                      <td>{fmtBytes(r.down)}</td>
                      <td style={{ fontWeight: 700 }}>{fmtBytes(r.total)}</td>
                      <td style={{ minWidth: 130 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <div className="progress grow">
                            <i style={{ width: `${Math.min(100, (r.total / max) * 100)}%` }} />
                          </div>
                          <span className="mono small muted" style={{ minWidth: 34 }}>
                            {Math.round((r.total / max) * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="muted small">{fmtTime(r.last)}</td>
                      <td>
                        <button
                          className="btn small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailIp(r)
                          }}
                        >
                          追踪
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detailIp && (
        <Modal
          title={
            <span>
              <span className="mono">{detailIp.ip}</span>
              {hosts[detailIp.ip] && <span className="muted"> · {hosts[detailIp.ip]}</span>} 流量追踪
            </span>
          }
          onClose={() => {
            setDetailIp(null)
            setSp({})
          }}
        >
          <div className="grid c3">
            <div className="stat">
              <div className="label">本月上行</div>
              <div className="value" style={{ fontSize: 19 }}>{fmtBytes(detailIp.up)}</div>
            </div>
            <div className="stat">
              <div className="label">本月下行</div>
              <div className="value" style={{ fontSize: 19 }}>{fmtBytes(detailIp.down)}</div>
            </div>
            <div className="stat">
              <div className="label">合计</div>
              <div className="value" style={{ fontSize: 19 }}>{fmtBytes(detailIp.total)}</div>
            </div>
          </div>

          <div className="card-title mt16">
            访问目的地 TOP（历史累计）
            <span className="spacer" />
            <span className="muted small">首见 {fmtTime(detailIp.first)} · 最近 {fmtTime(detailIp.last)}</span>
          </div>
          {detailIp.dests.length === 0 ? (
            <Empty text="无目的地记录" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table className="yy">
                <thead>
                  <tr>
                    <th>目标</th>
                    <th>端口</th>
                    <th>协议</th>
                    <th>流量</th>
                    <th>最近</th>
                  </tr>
                </thead>
                <tbody>
                  {detailIp.dests.slice(0, 30).map((d, i) => (
                    <tr key={i}>
                      <td className="mono">{d.dst}</td>
                      <td>{d.port}</td>
                      <td><Badge kind="mute">{d.proto}</Badge></td>
                      <td style={{ fontWeight: 700 }}>{fmtBytes(d.bytes)}</td>
                      <td className="muted small">{fmtTime(d.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-title mt16">
            实时连接（conntrack）
            <span className="spacer" />
            <button className="btn small" disabled={flowBusy} onClick={() => loadFlows(detailIp.ip)}>
              {flowBusy ? '刷新中…' : '刷新'}
            </button>
          </div>
          {flows.length === 0 ? (
            <Empty text="当前无活动连接" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="yy">
                <thead>
                  <tr>
                    <th>协议</th>
                    <th>目标地址</th>
                    <th>端口</th>
                    <th>状态</th>
                    <th>↑字节</th>
                    <th>↓字节</th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map((f, i) => (
                    <tr key={i}>
                      <td><Badge kind="mute">{f.proto}</Badge></td>
                      <td className="mono">{f.dst}</td>
                      <td>{f.dport}</td>
                      <td className="muted small">{f.state || (f.assured ? 'ESTABLISHED' : 'NEW')}</td>
                      <td>{fmtBytes(f.bytes_up)}</td>
                      <td>{fmtBytes(f.bytes_down)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted small mt8">
            提示：目标地址与端口可用于定位该设备正在访问的服务；结合“目标统计”可长期追溯流量去向。
          </div>
        </Modal>
      )}
    </div>
  )
}
