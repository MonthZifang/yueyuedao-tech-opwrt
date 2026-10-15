import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Loading, useToast, Field, Empty } from '../components/ui'
import { api } from '../lib/api'
import type { WifiAp } from '../lib/types'

const STEPS = ['欢迎', '上联连接', '组网方式', '管理密码', '完成']

export default function Wizard() {
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [aps, setAps] = useState<WifiAp[]>([])
  const [scanning, setScanning] = useState(false)

  // 上联
  const [uplinkMode, setUplinkMode] = useState<'wired' | 'wisp'>('wired')
  const [selAp, setSelAp] = useState<WifiAp | null>(null)
  const [wifiKey, setWifiKey] = useState('')

  // 组网
  const [netMode, setNetMode] = useState<'simple' | 'mesh' | 'vlan'>('simple')
  const [meshId, setMeshId] = useState('yueyue-mesh')
  const [meshKey, setMeshKey] = useState('')
  const [vlanCount, setVlanCount] = useState(3)

  // 密码
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  useEffect(() => {
    api.wizardStatus().then(setStatus).catch(() => {})
  }, [])

  const doScan = async () => {
    setScanning(true)
    try {
      const d = await api.wizardScan()
      setAps(d.aps)
    } catch (e: any) {
      toast(e?.message || '扫描失败', 'err')
    } finally {
      setScanning(false)
    }
  }

  const applyUplink = async (): Promise<boolean> => {
    setBusy(true)
    try {
      if (uplinkMode === 'wired') {
        await api.wizardUplink({ uplink_action: 'wired' })
      } else {
        if (!selAp) {
          toast('请选择一个无线信号', 'err')
          return false
        }
        await api.wizardUplink({
          uplink_action: 'wisp',
          device: selAp.device,
          ssid: selAp.ssid,
          key: wifiKey,
          encryption: selAp.encryption === 'none' ? 'none' : 'psk2+ccmp',
        })
      }
      toast('上联配置已应用', 'ok')
      return true
    } catch (e: any) {
      toast(e?.message || '配置失败', 'err')
      return false
    } finally {
      setBusy(false)
    }
  }

  const applyMode = async (): Promise<boolean> => {
    setBusy(true)
    try {
      await api.wizardMode({ mode: netMode, mesh_id: meshId, mesh_key: meshKey, count: vlanCount })
      toast('组网方式已应用', 'ok')
      return true
    } catch (e: any) {
      toast(e?.message || '配置失败', 'err')
      return false
    } finally {
      setBusy(false)
    }
  }

  const applyPassword = async (): Promise<boolean> => {
    if (!pw1) return true // 允许跳过
    if (pw1.length < 4) {
      toast('密码至少 4 位', 'err')
      return false
    }
    if (pw1 !== pw2) {
      toast('两次密码不一致', 'err')
      return false
    }
    setBusy(true)
    try {
      await api.wizardPassword(pw1)
      toast('密码已修改', 'ok')
      return true
    } catch (e: any) {
      toast(e?.message || '修改失败', 'err')
      return false
    } finally {
      setBusy(false)
    }
  }

  const next = async () => {
    if (step === 1 && !(await applyUplink())) return
    if (step === 2 && !(await applyMode())) return
    if (step === 3 && !(await applyPassword())) return
    if (step === 4) {
      setBusy(true)
      try {
        await api.wizardFinish()
        toast('向导完成，欢迎使用月月岛科技路由！', 'ok')
        navigate('/')
      } catch (e: any) {
        toast(e?.message || '完成失败', 'err')
      } finally {
        setBusy(false)
      }
      return
    }
    setStep(step + 1)
    if (step + 1 === 1) doScan()
  }

  return (
    <div className="wizard-wrap">
      <div className="card wizard-card">
        <div className="wizard-head">
          <img src="/luci-static/yueyue/assets/logo.png" alt="" />
          <div>
            <div className="t">月月岛科技 · 首次设置向导</div>
            <div className="s">YUEYUEDAO TECH FIRST-SETUP WIZARD</div>
          </div>
          <span className="grow" />
          <button className="btn small ghost" onClick={() => navigate('/')}>跳过向导</button>
        </div>

        <div className="wz-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`wz-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <div className="wz-dot">{i < step ? '✓' : i + 1}</div>
              <div className="wz-lab">{s}</div>
              {i < STEPS.length - 1 && <div className="wz-line" />}
            </div>
          ))}
        </div>

        <div className="wz-pane" key={step}>
          {step === 0 && (
            <div>
              <h2>欢迎使用 月月岛科技企业路由 🎉</h2>
              <p className="muted">
                本向导将帮助你完成初始配置：<br />
                1️⃣ 检测并连接上联网络（网线 或 无线中继 WISP）<br />
                2️⃣ 选择组网方式（标准 / Mesh 组网 / 多网段隔离）<br />
                3️⃣ 设置管理密码，保障设备安全<br />
                随时可以点击右上角“跳过向导”直接进入控制台。
              </p>
              {status && (
                <div className="grid c3 mt16">
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div className="muted small">设备型号</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{status.version}</div>
                  </div>
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div className="muted small">管理地址</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{status.lan_ip}</div>
                  </div>
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div className="muted small">当前主机名</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{status.hostname}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <h3>连接上联网络</h3>
              <div className="grid c2">
                <div
                  className={`card choice-card ${uplinkMode === 'wired' ? 'selected' : ''}`}
                  onClick={() => setUplinkMode('wired')}
                >
                  <div className="cc-icon">🔌</div>
                  <div className="cc-title">
                    网线接入（DHCP）
                    {uplinkMode === 'wired' && <span className="cc-check">✓</span>}
                  </div>
                  <div className="cc-desc">将上联网线插入 WAN 口，自动获取上级网络地址，光猫/主路由场景即插即用。</div>
                </div>
                <div
                  className={`card choice-card ${uplinkMode === 'wisp' ? 'selected' : ''}`}
                  onClick={() => { setUplinkMode('wisp'); doScan() }}
                >
                  <div className="cc-icon">📶</div>
                  <div className="cc-title">
                    无线中继（WISP）
                    {uplinkMode === 'wisp' && <span className="cc-check">✓</span>}
                  </div>
                  <div className="cc-desc">无需网线，扫描并连接上级 WiFi 作为上联，适合不便布线的环境。</div>
                </div>
              </div>

              {uplinkMode === 'wisp' && (
                <div className="mt16">
                  <div className="row">
                    <button className="btn small" onClick={doScan} disabled={scanning}>
                      {scanning ? '扫描中…' : '🔄 重新扫描'}
                    </button>
                    <span className="muted small">选择要中继的上级无线信号</span>
                  </div>
                  {scanning && <Loading text="正在扫描周边无线信号…" />}
                  {!scanning && aps.length === 0 && <Empty text="点击上方按钮开始扫描" icon="📡" />}
                  {!scanning && aps.length > 0 && (
                    <div className="table-wrap mt8" style={{ maxHeight: 240, overflowY: 'auto' }}>
                      <table className="yy">
                        <thead>
                          <tr><th>SSID</th><th>信号</th><th>信道</th><th>加密</th><th>选择</th></tr>
                        </thead>
                        <tbody>
                          {aps.map((ap, i) => (
                            <tr key={i} className="clickable" onClick={() => setSelAp(ap)}>
                              <td style={{ fontWeight: 600 }}>{ap.ssid || '(隐藏网络)'}</td>
                              <td className="num">{ap.signal} dBm</td>
                              <td className="num">{ap.channel}</td>
                              <td><Badge kind="mute">{ap.encryption}</Badge></td>
                              <td>
                                <input
                                  type="radio"
                                  checked={selAp?.bssid === ap.bssid && selAp?.ssid === ap.ssid}
                                  onChange={() => setSelAp(ap)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selAp && selAp.encryption !== 'none' && (
                    <Field label={`无线密码（连接 ${selAp.ssid}）`}>
                      <input className="input" type="password" value={wifiKey} onChange={(e) => setWifiKey(e.target.value)} placeholder="上级 WiFi 密码，至少 8 位" />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3>选择组网方式</h3>
              <div className="grid c3">
                {[
                  { id: 'simple', icon: '🏠', t: '标准路由', d: '单网段 NAT 上网，适合家庭 / 小微办公室' },
                  { id: 'mesh', icon: '🕸️', t: 'Mesh 组网', d: '多台设备无线回程自动组网，无缝漫游' },
                  { id: 'vlan', icon: '🧩', t: '多网段隔离', d: '划分多个隔离网段（办公 / 访客 / IoT）' },
                ].map((o) => (
                  <div
                    key={o.id}
                    className={`card choice-card ${netMode === o.id ? 'selected' : ''}`}
                    onClick={() => setNetMode(o.id as any)}
                  >
                    <div className="cc-icon">{o.icon}</div>
                    <div className="cc-title">
                      {o.t}
                      {netMode === o.id && <span className="cc-check">✓</span>}
                    </div>
                    <div className="cc-desc">{o.d}</div>
                  </div>
                ))}
              </div>
              {netMode === 'mesh' && (
                <div className="grid c2 mt16">
                  <Field label="Mesh 网络 ID">
                    <input className="input" value={meshId} onChange={(e) => setMeshId(e.target.value)} />
                  </Field>
                  <Field label="Mesh 密码（至少 8 位，可留空开放）">
                    <input className="input" type="password" value={meshKey} onChange={(e) => setMeshKey(e.target.value)} />
                  </Field>
                  <div className="muted small" style={{ gridColumn: '1 / -1' }}>
                    将自动选择周边占用最少的信道（2.4G 在 1/6/11 中挑选）
                  </div>
                </div>
              )}
              {netMode === 'vlan' && (
                <div className="mt16">
                  <Field label={`隔离网段数量（${vlanCount} 个）`}>
                    <input type="range" min={2} max={4} value={vlanCount} onChange={(e) => setVlanCount(Number(e.target.value))} />
                  </Field>
                  <div className="muted small">
                    将创建 {vlanCount} 个隔离网段（192.168.22.x ~ 192.168.{21 + vlanCount}.x），各网段无线名称与密码自动生成，可在控制台修改。
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h3>设置管理密码</h3>
              <div className="muted" style={{ marginBottom: 14 }}>
                为保障设备安全，请设置新的管理密码（可留空跳过，保持默认）。
              </div>
              <div className="grid c2">
                <Field label="新密码（至少 4 位）">
                  <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
                </Field>
                <Field label="确认密码">
                  <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="wz-summary">
              <h3>配置摘要</h3>
              <div className="kv"><span className="k">🔌 上联方式</span><span>{uplinkMode === 'wired' ? '网线 DHCP' : `WISP 中继 ${selAp?.ssid || ''}`}</span></div>
              <div className="kv"><span className="k">🧩 组网方式</span><span>{netMode === 'simple' ? '标准路由' : netMode === 'mesh' ? `Mesh（${meshId}）` : `多网段隔离（${vlanCount} 段）`}</span></div>
              <div className="kv"><span className="k">🔑 管理密码</span><span>{pw1 ? '已修改' : '保持默认'}</span></div>
              <div className="kv"><span className="k">🌐 管理地址</span><span className="mono">{status?.lan_ip || '192.168.21.1'}</span></div>
              <div className="muted small mt16">点击“完成”保存配置并进入控制台首页。</div>
            </div>
          )}
        </div>

        <div className="row mt24" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>← 上一步</button>
          <button className="btn primary" disabled={busy} onClick={next}>
            {busy ? '处理中…' : step === 4 ? '完成 ✓' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
