import React from 'react'
import { Card, Loading, useAsync, useInterval, Badge, Empty } from '../components/ui'
import { api } from '../lib/api'
import { fmtBytes } from '../lib/format'

export default function Processes() {
  const proc = useAsync(() => api.processes(), [])
  useInterval(() => proc.reload(), 5000)

  return (
    <Card
      title="进程列表"
      right={<button className="btn small" onClick={() => proc.reload()}>刷新</button>}
    >
      {proc.loading && !proc.data ? (
        <Loading />
      ) : (proc.data?.processes || []).length === 0 ? (
        <Empty text="无进程数据" />
      ) : (
        <div className="table-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="yy">
            <thead>
              <tr>
                <th className="num">PID</th><th>用户</th><th>状态</th><th className="num">内存</th><th className="num">内存 %</th><th className="num">CPU %</th><th>命令</th>
              </tr>
            </thead>
            <tbody>
              {(proc.data?.processes || []).map((p) => (
                <tr key={p.pid}>
                  <td className="num mono">{p.pid}</td>
                  <td>{p.user}</td>
                  <td><Badge kind="mute">{p.stat}</Badge></td>
                  <td className="num">{fmtBytes(p.vsz * 1024)}</td>
                  <td className="num">{p.mem_pct}%</td>
                  <td className="num" style={{ fontWeight: p.cpu_pct > 50 ? 700 : 400 }}>{p.cpu_pct}%</td>
                  <td className="mono" style={{ maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cmd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
