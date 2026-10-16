import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Stat, Progress, LineChart, Empty, useAsync, useInterval, Legend } from '../components/ui'
import { api } from '../lib/api'
import { fmtBytes, fmtUptime, fmtMonth, pct, fmtRate } from '../lib/format'

export default function Dashboard() {
  const navigate = useNavigate()
  const traffic = useAsync(() => api.traffic(), [])
  const sys = useAsync(() => api.sysinfo(), [])
  const perf = useAsync(() => api.perf(240), [])

  /* 首页自动刷新（30 秒）：保留旧数据渲染，无骨架闪烁 */
  useInterval(() => {
    traffic.reload()
    sys.reload()
    perf.reload()
  }, 30000)

  const t = traffic.data
  const s = sys.data
  const top = t?.ips?.slice(0, 5) || []
  const maxIp = top[0]?.total || 1

  const cpuSeries = (perf.data?.samples || []).map((x) => x[1])
  const memSeries = (perf.data?.samples || []).map((x) => x[2])

  return (
    <div>
      {/* 本月流量 hero */}
      <div className="hero">
        <div className="row wrap">
          <div className="grow">
            <div className="h-title">{t ? fmtMonth(t.month) : '本月'} · 全网上行 / 下行流量</div>
            <div className="h-big">{t ? fmtBytes(t.totals.up + t.totals.down) : '—'}</div>
            <div className="h-chips">
              <div className="h-chip">
                <div className="l">↑ 上行</div>
                <div className="v up">{t ? fmtBytes(t.totals.up) : '—'}</div>
              </div>
              <div className="h-chip">
                <div className="l">↓ 下行</div>
                <div className="v down">{t ? fmtBytes(t.totals.down) : '—'}</div>
              </div>
              <div className="h-chip">
                <div className="l">活跃 IP</div>
                <div className="v">{t?.ips?.length ?? 0}</div>
              </div>
            </div>
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="muted small" style={{ marginBottom: 8, letterSpacing: 1 }}>流量最多的 IP</div>
            {top.length > 0 ? (
              <>
                <div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>
                  {top[0].ip}
                  {t?.hosts?.[top[0].ip] && (
                    <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> {t.hosts[top[0].ip]}</span>
                  )}
                </div>
                <div className="small muted" style={{ margin: '6px 0 10px' }}>
                  {fmtBytes(top[0].total)}（↑{fmtBytes(top[0].up)} ↓{fmtBytes(top[0].down)}）
                </div>
                <Progress value={pct(top[0].total, maxIp)} />
              </>
            ) : (
              <div className="muted small">暂无数据（采样守护每 30 秒记录一次）</div>
            )}
            <button className="btn primary small mt16" onClick={() => navigate('/traffic')}>查看流量统计 →</button>
          </div>
        </div>
      </div>

      {/* 系统状态 */}
      <div className="grid c4 mt16">
        <Card>
          <Stat
            label="CPU 负载"
            value={s ? `${Math.round(((s.cpu.total - s.cpu.idle - s.cpu.iowait) / Math.max(1, s.cpu.total)) * 100)}%` : '—'}
            sub={s ? `负载 ${s.load?.[0]?.toFixed(2) ?? '—'} / ${s.load?.[1]?.toFixed(2) ?? '—'} / ${s.load?.[2]?.toFixed(2) ?? '—'}` : ''}
          />
          <div className="mt8">
            <Progress value={s ? pct(s.cpu.total - s.cpu.idle - s.cpu.iowait, s.cpu.total) : 0} />
          </div>
        </Card>
        <Card>
          <Stat
            label="内存"
            value={s && s.mem?.MemTotal ? `${pct(s.mem.MemTotal - (s.mem.MemAvailable || 0), s.mem.MemTotal)}%` : '—'}
            sub={s?.mem ? `${fmtBytes(s.mem.MemTotal - (s.mem.MemAvailable || 0))} / ${fmtBytes(s.mem.MemTotal)}` : ''}
          />
          <div className="mt8">
            <Progress value={s?.mem?.MemTotal ? pct(s.mem.MemTotal - (s.mem.MemAvailable || 0), s.mem.MemTotal) : 0} />
          </div>
        </Card>
        <Card>
          <Stat label="运行时间" value={s ? fmtUptime(s.uptime) : '—'} sub={s?.version} />
        </Card>
        <Card>
          <Stat
            label="活动连接 / 磁盘"
            value={s ? s.conn : '—'}
            sub={s?.disk ? `磁盘 ${fmtBytes(s.disk.used)} / ${fmtBytes(s.disk.total)}` : ''}
          />
          <div className="mt8">
            <Progress value={s?.disk?.pct ?? 0} />
          </div>
        </Card>
      </div>

      {/* 性能趋势 */}
      <div className="mt16">
        <Card title="性能趋势（最近 2 小时）" right={<button className="btn small" onClick={() => navigate('/perf')}>详细</button>}>
          {cpuSeries.length > 2 ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Legend items={[{ label: 'CPU %', color: 'var(--yy-accent)' }, { label: '内存 %', color: 'var(--warn)' }]} />
              </div>
              <LineChart
                series={[
                  { data: cpuSeries, color: 'var(--yy-accent)', fill: true },
                  { data: memSeries, color: 'var(--warn)', fill: true },
                ]}
                height={170}
                max={100}
                unit="%"
              />
            </>
          ) : (
            <Empty text="性能历史采样中…" />
          )}
          {s && perf.data && perf.data.samples.length > 0 && (
            <div className="row wrap mt8 small muted" style={{ gap: 16 }}>
              <span>WAN 速率：↓ {fmtRate(perf.data.samples[perf.data.samples.length - 1][5])} / ↑ {fmtRate(perf.data.samples[perf.data.samples.length - 1][6])}</span>
              <span>连接数：{s.conn}</span>
              <span>主机名：{s.hostname}</span>
            </div>
          )}
        </Card>
      </div>

      {/* 快捷入口 */}
      <div className="grid c4 mt16">
        {[
          { to: '/routes', t: '路由工作流', d: '画布 / 静态路由 / 右键配置' },
          { to: '/realtime', t: '实时流量', d: '各网卡速率' },
          { to: '/diag', t: '网络诊断', d: 'ping / 路由追踪' },
          { to: '/settings', t: '个性化', d: '背景 / 主题 / 配色' },
        ].map((q) => (
          <div key={q.to} className="card hoverable row" style={{ cursor: 'pointer', gap: 12 }} onClick={() => navigate(q.to)}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{q.t}</div>
              <div className="muted small">{q.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
