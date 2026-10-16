import React, { useEffect, useState } from 'react'
import { Card, Badge, Loading, useAsync, useToast, Empty, Field, Modal } from '../components/ui'
import { api } from '../lib/api'
import { ubusCall } from '../lib/ubus'
import type { WifiAp } from '../lib/types'

interface WifiIface {
  ifname: string
  ssid?: string
  mode?: string
  encryption?: string
  key?: string
  network?: string
  device?: string
  up?: boolean
}

export default function Wireless() {
  const toast = useToast()
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<{ section: string; ssid: string; key: string; disabled: boolean } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [aps, setAps] = useState<WifiAp[]>([])
  const [showScan, setShowScan] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      let d: any = null
      try {
        d = await ubusCall('network.wireless', 'status', {})
      } catch {
        // 某些 netifd 版本 status 必须显式带 device 参数，回退逐设备查询
        try {
          const devs: any = await ubusCall('iwinfo', 'devices', {})
          d = {}
          for (const n of (devs?.devices || []).map((x: any) => x?.name || x).filter(Boolean)) {
            try { d[n] = await ubusCall('network.wireless', 'status', { device: n }) } catch { /* skip */ }
          }
        } catch {
          d = {}
        }
      }
      setStatus(d || {})
    } catch {
      setStatus({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scan = async () => {
    setScanning(true)
    setShowScan(true)
    try {
      const d = await api.wizardScan()
      setAps(d.aps)
    } catch (e: any) {
      toast(e?.message || '扫描失败', 'err')
    } finally {
      setScanning(false)
    }
  }

  const saveIface = async () => {
    if (!edit) return
    try {
      await ubusCall('uci', 'set', {
        config: 'wireless',
        section: edit.section,
        values: { ssid: edit.ssid, key: edit.key, disabled: edit.disabled ? '1' : '0' },
      })
      await ubusCall('uci', 'commit', { config: 'wireless' })
      await ubusCall('network', 'reload', {})
      toast('无线配置已保存并重载', 'ok')
      setEdit(null)
      setTimeout(load, 1800)
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    }
  }

  if (loading && !status) return <Loading />

  const radios: [string, any][] = Object.entries(status || {})

  return (
    <div>
      <Card
        title="无线网络"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={scan}>{scanning ? '扫描中…' : '扫描周边'}</button>
            <button className="btn small" onClick={load}>刷新</button>
          </div>
        }
      >
        {radios.length === 0 ? (
          <Empty text="未检测到无线设备（虚拟机无无线网卡时显示为空）" />
        ) : (
          radios.map(([radio, r]) => (
            <div key={radio}>
              <div className="row mt8">
                <span style={{ fontWeight: 800 }}> {radio}</span>
                <Badge kind="mute">{(r as any).channel ? `CH ${(r as any).channel}` : ''}</Badge>
                {(r as any).up ? <Badge kind="ok">已启用</Badge> : <Badge kind="danger">已关闭</Badge>}
                <span className="muted small">{(r as any).band || ''} {(r as any).country || ''}</span>
              </div>
              <div className="table-wrap mt8">
                <table className="yy">
                  <thead>
                    <tr><th>接口</th><th>SSID</th><th>模式</th><th>加密</th><th>网络</th><th>状态</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {(((r as any).interfaces || []) as WifiIface[]).map((itf, i) => (
                      <tr key={i}>
                        <td className="mono">{itf.ifname}</td>
                        <td style={{ fontWeight: 700 }}>{itf.ssid}</td>
                        <td><Badge kind="mute">{itf.mode === 'ap' ? '接入点' : itf.mode === 'sta' ? '客户端' : itf.mode === 'mesh' ? 'Mesh' : itf.mode}</Badge></td>
                        <td>{itf.encryption || 'none'}</td>
                        <td>{itf.network}</td>
                        <td>{itf.up ? <Badge kind="ok">在线</Badge> : <Badge kind="mute">离线</Badge>}</td>
                        <td>
                          <button
                            className="btn small"
                            onClick={async () => {
                              // 找到对应 uci section
                              try {
                                const all = await ubusCall('uci', 'get', { config: 'wireless' })
                                const entries = Object.entries((all as any).values || {})
                                const hit = entries.find(([, v]: any) => v.ssid === itf.ssid && v.mode === (itf.mode || 'ap'))
                                const section = (hit?.[0] as string) || '@wifi-iface[0]'
                                setEdit({ section, ssid: itf.ssid || '', key: itf.key || '', disabled: false })
                              } catch {
                                setEdit({ section: '@wifi-iface[0]', ssid: itf.ssid || '', key: '', disabled: false })
                              }
                            }}
                          >
                            编辑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Card>

      {edit && (
        <Modal title={`编辑无线接口`} onClose={() => setEdit(null)}>
          <Field label="SSID（无线名称）">
            <input className="input" value={edit.ssid} onChange={(e) => setEdit({ ...edit, ssid: e.target.value })} />
          </Field>
          <Field label="无线密码（留空为开放网络）">
            <input className="input" type="password" value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value })} />
          </Field>
          <div className="row">
            <span className="muted small">停用该接口</span>
            <input type="checkbox" checked={edit.disabled} onChange={(e) => setEdit({ ...edit, disabled: e.target.checked })} />
          </div>
          <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={saveIface}>保存并重载</button>
          </div>
        </Modal>
      )}

      {showScan && (
        <Modal title="周边无线信号" onClose={() => setShowScan(false)}>
          {scanning ? (
            <Loading text="扫描中…" />
          ) : aps.length === 0 ? (
            <Empty text="未发现信号" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="yy">
                <thead>
                  <tr><th>SSID</th><th>BSSID</th><th>信号</th><th>信道</th><th>加密</th></tr>
                </thead>
                <tbody>
                  {aps.map((ap, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{ap.ssid || '(隐藏)'}</td>
                      <td className="mono">{ap.bssid}</td>
                      <td>{ap.signal} dBm</td>
                      <td>{ap.channel}</td>
                      <td><Badge kind="mute">{ap.encryption}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
