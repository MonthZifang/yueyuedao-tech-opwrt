import React, { useEffect, useRef, useState } from 'react'
import { Card, Stat, Loading, useInterval, Empty } from '../components/ui'
import { api } from '../lib/api'
import { fmtBytes, fmtRate } from '../lib/format'
import type { Sysinfo } from '../lib/types'

interface IfaceHist {
  name: string
  rx: number[]
  tx: number[]
  last?: { rx: number; tx: number }
}

const MAX_POINTS = 90

export default function RealtimeTraffic() {
  const [sys, setSys] = useState<Sysinfo | null>(null)
  const [hists, setHists] = useState<IfaceHist[]>([])
  const [error, setError] = useState<string | null>(null)

  const poll = async () => {
    try {
      const s = await api.sysinfo()
      setSys(s)
      setError(null)
      setHists((prev) => {
        const map = new Map(prev.map((h) => [h.name, h]))
        const next: IfaceHist[] = []
        for (const [name, v] of Object.entries(s.net || {})) {
          if (name === 'lo') continue
          const h = map.get(name) || { name, rx: [], tx: [] }
          let rx = 0
          let tx = 0
          if (h.last) {
            rx = Math.max(0, (v.rx - h.last.rx) / 2)
            tx = Math.max(0, (v.tx - h.last.tx) / 2)
          }
          next.push({
            name,
            rx: [...h.rx, rx].slice(-MAX_POINTS),
            tx: [...h.tx, tx].slice(-MAX_POINTS),
            last: { rx: v.rx, tx: v.tx },
          })
        }
        return next
      })
    } catch (e: any) {
      setError(e?.message || '获取失败')
    }
  }

  useEffect(() => {
    poll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useInterval(poll, 2000)

  const Spark = ({ data, color }: { data: number[]; color: string }) => {
    const max = Math.max(1, ...data)
    const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 200},${40 - (v / max) * 36}`).join(' ')
    return (
      <svg viewBox="0 0 200 40" style={{ width: '100%', height: 40 }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />
      </svg>
    )
  }

  return (
    <div>
      {error && (
        <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 50%, transparent)' }}>{error}</div>
      )}
      {!sys ? (
        <Loading />
      ) : (
        <div className="grid c4">
          <Card>
            <Stat label="下行速率 (WAN 总)" value={fmtRate(aggregate(hists, 'rx'))} sub="每 2 秒刷新" />
          </Card>
          <Card>
            <Stat label="上行速率 (WAN 总)" value={fmtRate(aggregate(hists, 'tx'))} sub="每 2 秒刷新" />
          </Card>
          <Card>
            <Stat label="活动连接" value={sys.conn} sub="conntrack 会话数" />
          </Card>
          <Card>
            <Stat label="时间" value={new Date().toLocaleTimeString()} sub={sys.hostname} />
          </Card>

          <div style={{ gridColumn: '1 / -1' }}>
            <Card title="各网卡实时速率">
              {hists.length === 0 ? (
                <Empty text="无网卡数据" />
              ) : (
                <div className="table-wrap">
                  <table className="yy">
                    <thead>
                      <tr>
                        <th>网卡</th>
                        <th>累计接收</th>
                        <th>累计发送</th>
                        <th style={{ width: 220 }}>下行速率</th>
                        <th style={{ width: 220 }}>上行速率</th>
                        <th>当前速率 ↑ / ↓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hists.map((h) => {
                        const cur = sys.net?.[h.name]
                        return (
                          <tr key={h.name}>
                            <td className="mono" style={{ fontWeight: 700 }}>{h.name}</td>
                            <td>{fmtBytes(cur?.rx)}</td>
                            <td>{fmtBytes(cur?.tx)}</td>
                            <td><Spark data={h.rx} color="var(--yy-accent)" /></td>
                            <td><Spark data={h.tx} color="var(--warn)" /></td>
                            <td className="mono">
                              {fmtRate(h.rx[h.rx.length - 1] || 0)} / {fmtRate(h.tx[h.tx.length - 1] || 0)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function aggregate(hists: IfaceHist[], key: 'rx' | 'tx'): number {
  return hists
    .filter((h) => !h.name.startsWith('br-') && !h.name.startsWith('docker') && !h.name.startsWith('veth'))
    .reduce((a, h) => a + (h[key][h[key].length - 1] || 0), 0)
}
