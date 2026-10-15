import React, { useMemo, useState } from 'react'
import { Card, Stat, LineChart, Loading, useAsync, Empty, Badge } from '../components/ui'
import { api } from '../lib/api'
import { fmtBytes, fmtRate, fmtTimeShort } from '../lib/format'

const RANGES = [
  { label: '1 小时', n: 120 },
  { label: '6 小时', n: 720 },
  { label: '12 小时', n: 1440 },
  { label: '24 小时', n: 2880 },
]

export default function PerfHistory() {
  const [range, setRange] = useState(720)
  const perf = useAsync(() => api.perf(), [])

  const samples = useMemo(() => {
    const s = perf.data?.samples || []
    return s.slice(-range)
  }, [perf.data, range])

  const labels = useMemo(() => {
    if (samples.length === 0) return []
    return [fmtTimeShort(samples[0][0]), fmtTimeShort(samples[samples.length - 1][0])]
  }, [samples])

  const last = samples[samples.length - 1]
  const avgCpu = samples.length ? Math.round(samples.reduce((a, s) => a + s[1], 0) / samples.length) : 0
  const maxConn = samples.length ? Math.max(...samples.map((s) => s[4])) : 0

  return (
    <div>
      <div className="row wrap">
        <div className="grow row" style={{ gap: 10 }}>
          {RANGES.map((r) => (
            <button
              key={r.n}
              className={`btn small ${range === r.n ? 'primary' : ''}`}
              onClick={() => setRange(r.n)}
            >
              {r.label}
            </button>
          ))}
          <Badge kind="mute">采样间隔 30 秒 · 保留最近 24 小时</Badge>
        </div>
        <button className="btn" onClick={() => perf.reload()}>刷新</button>
      </div>

      {perf.loading ? (
        <Loading />
      ) : samples.length < 2 ? (
        <div className="card mt16"><Empty text="历史样本不足，采样守护运行后自动积累" /></div>
      ) : (
        <>
          <div className="grid c4 mt16">
            <Card>
              <Stat label="当前 CPU" value={`${last[1]}%`} sub={`区间平均 ${avgCpu}%`} />
            </Card>
            <Card>
              <Stat label="当前内存" value={`${last[2]}%`} sub={`负载 ${last[3].toFixed(2)}`} />
            </Card>
            <Card>
              <Stat label="活动连接" value={last[4]} sub={`区间峰值 ${maxConn}`} />
            </Card>
            <Card>
              <Stat label="当前 WAN 速率" value={`${fmtRate(last[5])} / ${fmtRate(last[6])}`} sub="↓ / ↑" />
            </Card>
          </div>

          <Card title="CPU / 内存使用率 %" className="mt16">
            <LineChart
              series={[
                { data: samples.map((s) => s[1]), color: 'var(--yy-accent)', fill: true },
                { data: samples.map((s) => s[2]), color: 'var(--warn)' },
              ]}
              labels={labels}
              max={100}
              unit="%"
              height={190}
            />
          </Card>

          <Card title="活动连接数">
            <LineChart
              series={[{ data: samples.map((s) => s[4]), color: 'var(--yy-accent)', fill: true }]}
              labels={labels}
              height={170}
            />
          </Card>

          <Card title="WAN 流量速率 (B/s)">
            <LineChart
              series={[
                { data: samples.map((s) => s[5]), color: 'var(--yy-accent)', fill: true },
                { data: samples.map((s) => s[6]), color: 'var(--warn)' },
              ]}
              labels={labels}
              height={190}
            />
            <div className="muted small mt8">↑ 绿色为下行速率、黄色为上行速率（按采样区间累计字节差值计算）</div>
          </Card>

          <Card title="最近样本明细">
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="yy">
                <thead>
                  <tr><th>时间</th><th>CPU %</th><th>内存 %</th><th>负载</th><th>连接数</th><th>下行速率</th><th>上行速率</th></tr>
                </thead>
                <tbody>
                  {[...samples].reverse().slice(0, 60).map((s, i) => (
                    <tr key={i}>
                      <td className="muted">{new Date(s[0] * 1000).toLocaleString()}</td>
                      <td>{s[1]}</td>
                      <td>{s[2]}</td>
                      <td>{s[3].toFixed(2)}</td>
                      <td>{s[4]}</td>
                      <td>{fmtRate(s[5])}</td>
                      <td>{fmtRate(s[6])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
