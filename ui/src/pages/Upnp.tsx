import React, { useEffect, useState } from 'react'
import { Card, Badge, Loading, useToast, Switch, Field } from '../components/ui'
import { ubusCall } from '../lib/ubus'
import { api } from '../lib/api'

export default function Upnp() {
  const toast = useToast()
  const [cfg, setCfg] = useState<any>(null)
  const [section, setSection] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<{ running: boolean; enabled: boolean } | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      const d = await ubusCall<any>('uci', 'get', { config: 'upnpd' })
      const values = d?.values || {}
      const hit = Object.entries(values).find(([, v]: any) => v['.type'] === 'settings')
      if (hit) {
        setSection(hit[0])
        setCfg(hit[1])
      }
      const svcs = await api.services()
      const s = svcs.services.find((x) => x.name === 'miniupnpd')
      if (s) setService({ running: s.running, enabled: s.enabled })
    } catch (e: any) {
      toast(e?.message || '获取配置失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (patch: Record<string, string>) => {
    if (!section) return
    setBusy(true)
    try {
      await ubusCall('uci', 'set', { config: 'upnpd', section, values: patch })
      await ubusCall('uci', 'commit', { config: 'upnpd' })
      await api.serviceOp('restart', 'miniupnpd').catch(() => {})
      toast('UPnP 配置已保存', 'ok')
      load()
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Card
        title="UPnP / NAT-PMP 设置"
        right={service ? (service.running ? <Badge kind="ok">服务运行中</Badge> : <Badge kind="mute">服务未运行</Badge>) : null}
      >
        {!cfg ? (
          <Loading />
        ) : (
          <>
            <div className="kv">
              <span className="k">启用 UPnP IGD</span>
              <Switch on={cfg.enable_upnp === '1'} onChange={(v) => save({ enable_upnp: v ? '1' : '0' })} />
            </div>
            <div className="kv">
              <span className="k">启用 NAT-PMP</span>
              <Switch on={cfg.enable_natpmp === '1'} onChange={(v) => save({ enable_natpmp: v ? '1' : '0' })} />
            </div>
            <div className="kv">
              <span className="k">允许删除规则</span>
              <Switch on={cfg.enable_secure === '1'} onChange={(v) => save({ enable_secure: v ? '1' : '0' })} />
            </div>
            <div className="kv">
              <span className="k">下载速率上限 (KByte/s)</span>
              <input
                className="input"
                style={{ width: 120 }}
                value={cfg.download || ''}
                onChange={(e) => setCfg({ ...cfg, download: e.target.value })}
                onBlur={() => save({ download: cfg.download })}
              />
            </div>
            <div className="kv">
              <span className="k">上传速率上限 (KByte/s)</span>
              <input
                className="input"
                style={{ width: 120 }}
                value={cfg.upload || ''}
                onChange={(e) => setCfg({ ...cfg, upload: e.target.value })}
                onBlur={() => save({ upload: cfg.upload })}
              />
            </div>
          </>
        )}
      </Card>

      <Card title="说明">
        <div className="muted" style={{ lineHeight: 2 }}>
          · UPnP 允许内网设备（游戏主机 / 下载器等）自动创建端口映射<br />
          · 出于安全考虑，不建议在企业网络长期开启<br />
          · 修改后 miniupnpd 服务将自动重启生效
        </div>
      </Card>
    </div>
  )
}
