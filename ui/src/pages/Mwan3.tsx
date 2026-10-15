import React from 'react'
import { Card, Loading, useAsync, useToast, Badge, Empty } from '../components/ui'
import { ubusCall } from '../lib/ubus'

export default function Mwan3() {
  const st = useAsync(() => ubusCall<any>('mwan3', 'status', {}), [])
  const toast = useToast()

  return (
    <div>
      <Card
        title="多拨负载均衡 (mwan3) 状态"
        right={<button className="btn small" onClick={() => st.reload()}>刷新</button>}
      >
        {st.loading && !st.data ? (
          <Loading />
        ) : !st.data ? (
          <Empty text="未获取到 mwan3 状态（确认已安装并启用 mwan3）" />
        ) : (
          <div>
            {Object.entries(st.data).map(([key, val]: [string, any]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 800 }}>{key}</span>
                  {typeof val === 'object' && val !== null && val.up !== undefined && (
                    val.up ? <Badge kind="ok">在线</Badge> : <Badge kind="danger">离线</Badge>
                  )}
                </div>
                {typeof val === 'object' && val !== null ? (
                  <div className="mt8">
                    {Object.entries(val).map(([k, v]) => (
                      <div className="kv" key={k}>
                        <span className="k">{k}</span>
                        <span className="mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mono muted">{String(val)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="说明">
        <div className="muted" style={{ lineHeight: 2 }}>
          · mwan3 支持多条上联线路（多拨 / 多 WAN）负载均衡与故障切换<br />
          · 策略与规则可在「软件包」安装 <span className="mono">luci-app-mwan3</span> 后于高级配置中调整<br />
          · 修改接口配置后建议重启 mwan3 服务（启动项页面可操作）
        </div>
      </Card>
    </div>
  )
}
