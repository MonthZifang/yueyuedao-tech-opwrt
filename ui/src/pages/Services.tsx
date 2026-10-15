import React from 'react'
import { Card, Loading, useAsync, useToast, Badge, Empty, Switch } from '../components/ui'
import { api } from '../lib/api'

export default function Services() {
  const svc = useAsync(() => api.services(), [])
  const toast = useToast()

  const op = async (opName: string, name: string) => {
    try {
      await api.serviceOp(opName, name)
      toast(`${name}: ${opName} 成功`, 'ok')
      setTimeout(() => svc.reload(), 800)
    } catch (e: any) {
      toast(e?.message || '操作失败', 'err')
    }
  }

  return (
    <Card
      title="启动项 / 服务管理"
      right={<button className="btn small" onClick={() => svc.reload()}>刷新</button>}
    >
      {svc.loading && !svc.data ? (
        <Loading />
      ) : (svc.data?.services || []).length === 0 ? (
        <Empty text="无服务数据" />
      ) : (
        <div className="table-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="yy">
            <thead>
              <tr><th>服务</th><th>运行状态</th><th>开机自启</th><th>操作</th></tr>
            </thead>
            <tbody>
              {(svc.data?.services || []).map((s) => (
                <tr key={s.name}>
                  <td className="mono" style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.running ? <Badge kind="ok">运行中</Badge> : <Badge kind="mute">已停止</Badge>}</td>
                  <td>
                    <Switch on={s.enabled} onChange={(v) => op(v ? 'enable' : 'disable', s.name)} />
                  </td>
                  <td>
                    {s.running ? (
                      <button className="btn small danger" onClick={() => op('stop', s.name)}>停止</button>
                    ) : (
                      <button className="btn small" onClick={() => op('start', s.name)}>启动</button>
                    )}{' '}
                    <button className="btn small" onClick={() => op('restart', s.name)}>重启</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
