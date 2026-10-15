import React from 'react'
import { Card, Badge, Loading, useAsync, useToast, Empty, Stat } from '../components/ui'
import { api } from '../lib/api'
import { ubusCall } from '../lib/ubus'
import { fmtUptime, fmtBytes } from '../lib/format'

export default function Interfaces() {
  const sys = useAsync(() => api.sysinfo(), [])
  const toast = useToast()

  const ifaceAction = async (name: string, up: boolean) => {
    try {
      await ubusCall(`network.interface.${name}`, up ? 'up' : 'down', {})
      toast(`接口 ${name} ${up ? '启用' : '停用'}指令已发送`, 'ok')
      setTimeout(() => sys.reload(), 1500)
    } catch (e: any) {
      toast(e?.message || '操作失败', 'err')
    }
  }

  const reloadAll = async () => {
    try {
      await ubusCall('network', 'reload', {})
      toast('网络已重载', 'ok')
      setTimeout(() => sys.reload(), 1500)
    } catch (e: any) {
      toast(e?.message || '重载失败', 'err')
    }
  }

  if (sys.loading && !sys.data) return <Loading />

  return (
    <div>
      <Card
        title="网络接口"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => sys.reload()}>刷新</button>
            <button className="btn small primary" onClick={reloadAll}>重载网络</button>
          </div>
        }
      >
        {(sys.data?.ifaces || []).length === 0 ? (
          <Empty text="无接口信息" />
        ) : (
          <div className="grid c3">
            {(sys.data?.ifaces || []).map((f) => (
              <div key={f.name} className="card" style={{ padding: 16 }}>
                <div className="row">
                  <div style={{ fontSize: 22 }}>{f.name.startsWith('wan') || f.name.startsWith('wwan') ? '🌍' : '📡'}</div>
                  <div className="grow">
                    <div style={{ fontWeight: 800 }}>{f.name}</div>
                    <div className="muted small">{f.device || '—'} · {f.proto}</div>
                  </div>
                  {f.up ? <Badge kind="ok">在线</Badge> : <Badge kind="danger">离线</Badge>}
                </div>
                <div className="mt8">
                  <div className="kv"><span className="k">IP 地址</span><span className="mono">{f.ipaddr || '—'}</span></div>
                  {f.gateway && <div className="kv"><span className="k">网关</span><span className="mono">{f.gateway}</span></div>}
                  {f.uptime ? <div className="kv"><span className="k">在线时长</span><span>{fmtUptime(f.uptime)}</span></div> : null}
                </div>
                <div className="row mt8">
                  {f.up ? (
                    <button className="btn small danger" onClick={() => ifaceAction(f.name, false)}>停用</button>
                  ) : (
                    <button className="btn small" onClick={() => ifaceAction(f.name, true)}>启用</button>
                  )}
                  {f.proto === 'dhcp' && (
                    <button
                      className="btn small"
                      onClick={async () => {
                        try {
                          await ubusCall(`network.interface.${f.name}`, 'renew', {})
                          toast('已请求续约', 'ok')
                        } catch (e: any) {
                          toast(e?.message || '续约失败', 'err')
                        }
                      }}
                    >
                      续约 DHCP
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="各网卡累计流量">
        <div className="table-wrap">
          <table className="yy">
            <thead>
              <tr><th>网卡</th><th>累计接收 (RX)</th><th>累计发送 (TX)</th></tr>
            </thead>
            <tbody>
              {Object.entries(sys.data?.net || {}).map(([name, v]) => (
                <tr key={name}>
                  <td className="mono">{name}</td>
                  <td>{fmtBytes(v.rx)}</td>
                  <td>{fmtBytes(v.tx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
