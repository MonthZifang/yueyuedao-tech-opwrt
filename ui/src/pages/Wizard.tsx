import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Loading, useToast, Field, Empty, Switch } from '../components/ui'
import { api } from '../lib/api'
import type { WifiAp } from '../lib/types'

const STEPS = ['欢迎', '上联连接', '组网方式', 'WiFi 设置', '管理密码', '完成']

type NetMode = 'simple' | 'ap_unified' | 'mesh' | 'vlan'

interface VlanNet {
  name: string
  octet: number
  ssid: string
  key: string
  hidden: boolean
  guest: boolean
  guestSsid: string
  guestKey: string
  dhcpStart: number
  dhcpLimit: number
}

interface ApCfg {
  name: string
  radio: string
  enabled: boolean
  follow: boolean
  ssid: string
  key: string
  hidden: boolean
  isolate: boolean
  channel: string
  width: string
  power: string
  guestOn: boolean
  guestSsid: string
  guestKey: string
  net: string
}

const NET_OCTETS = [22, 23, 24, 25, 26, 27, 28, 29]

const makeNet = (i: number, used: number[]): VlanNet => {
  const oct = NET_OCTETS.find((o) => !used.includes(o)) ?? 22 + i
  return {
    name: `网段${i + 1}`,
    octet: oct,
    ssid: `yueyue-${oct}`,
    key: `opwrt${oct}`,
    hidden: false,
    guest: false,
    guestSsid: `yueyue-${oct}-Guest`,
    guestKey: '',
    dhcpStart: 100,
    dhcpLimit: 150,
  }
}

const makeAp = (i: number, radio = ''): ApCfg => ({
  name: `AP-${i + 1}`,
  radio,
  enabled: true,
  follow: true,
  ssid: '',
  key: '',
  hidden: false,
  isolate: false,
  channel: 'auto',
  width: 'auto',
  power: 'auto',
  guestOn: false,
  guestSsid: `AP-${i + 1}-Guest`,
  guestKey: '',
  net: '',
})

const CHANNELS_24 = ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']
const CHANNELS_5 = ['auto', '36', '40', '44', '48', '149', '153', '157', '161', '165']
const WIDTHS = [
  { v: 'auto', t: '自动' },
  { v: '20', t: '20 MHz' },
  { v: '40', t: '40 MHz' },
  { v: '80', t: '80 MHz' },
  { v: '160', t: '160 MHz' },
]
const POWERS = [
  { v: 'auto', t: '自动' },
  { v: '20', t: '高（20 dBm）' },
  { v: '15', t: '中（15 dBm）' },
  { v: '10', t: '低（10 dBm）' },
]

export default function Wizard() {
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [aps, setAps] = useState<WifiAp[]>([])
  const [radios, setRadios] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)

  // 网络角色
  const [isMain, setIsMain] = useState(true)

  // 上联
  const [uplinkMode, setUplinkMode] = useState<'wired' | 'wisp'>('wired')
  const [selAp, setSelAp] = useState<WifiAp | null>(null)
  const [wifiKey, setWifiKey] = useState('')

  // 组网
  const [netMode, setNetMode] = useState<NetMode>('ap_unified')
  const [meshId, setMeshId] = useState('yueyue-mesh')
  const [meshKey, setMeshKey] = useState('')
  const [vlanNets, setVlanNets] = useState<VlanNet[]>([makeNet(0, []), makeNet(1, [22])])
  const [allowLan, setAllowLan] = useState(false)
  const [guestOn, setGuestOn] = useState(false)

  // 统一 WiFi（非 vlan 模式 / vlan 各网段的默认模板）
  const [mainSsid, setMainSsid] = useState('yueyue-opwrt')
  const [mainKey, setMainKey] = useState('')
  const [mainHidden, setMainHidden] = useState(false)
  const [guestSsid, setGuestSsid] = useState('yueyue-opwrt-Guest')
  const [guestKey, setGuestKey] = useState('')

  // 逐 AP 配置
  const [apCfgs, setApCfgs] = useState<ApCfg[]>([makeAp(0)])

  // 密码
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  useEffect(() => {
    api.wizardStatus().then((s: any) => {
      setStatus(s)
      if (s.main_router === false) setIsMain(false)
      // 重进向导：回读已存配置预填
      if (s.mode) setNetMode(s.mode)
      if (s.allow_lan) setAllowLan(true)
      if (Array.isArray(s.nets) && s.nets.length > 0) {
        setVlanNets(s.nets.map((n: any, i: number) => ({
          ...makeNet(i, []),
          name: n.name ?? `网段${i + 1}`,
          octet: Number(n.octet) || 22 + i,
          ssid: n.ssid ?? `yueyue-${n.octet}`,
          key: n.key ?? '',
          hidden: !!n.hidden,
          guest: !!n.guest,
          guestSsid: n.guest_ssid ?? `yueyue-${n.octet}-Guest`,
          guestKey: n.guest_key ?? '',
          dhcpStart: Number(n.dhcp_start) || 100,
          dhcpLimit: Number(n.dhcp_limit) || 150,
        })))
      }
      if (s.main && typeof s.main === 'object') {
        if (s.main.ssid) setMainSsid(s.main.ssid)
        setMainKey(s.main.key ?? '')
        setMainHidden(!!s.main.hidden)
      }
      if (s.guest && typeof s.guest === 'object') {
        if (s.guest.enabled) setGuestOn(true)
        if (s.guest.ssid) setGuestSsid(s.guest.ssid)
        setGuestKey(s.guest.key ?? '')
      }
      if (Array.isArray(s.aps) && s.aps.length > 0) {
        setApCfgs(s.aps.map((a: any, i: number) => ({
          ...makeAp(i, a.radio ?? ''),
          name: a.name ?? `AP-${i + 1}`,
          enabled: a.enabled === undefined ? true : !!(a.enabled === true || a.enabled === '1' || a.enabled === 1),
          follow: a.follow === undefined ? true : !(a.follow === false || a.follow === '0' || a.follow === 0),
          ssid: a.ssid ?? '',
          key: a.key ?? '',
          hidden: !!a.hidden,
          isolate: !!a.isolate,
          channel: a.channel ?? 'auto',
          width: a.width ?? 'auto',
          power: a.power ?? 'auto',
          guestOn: !!(a.guest && (a.guest.enabled === true || a.guest.enabled === '1' || a.guest.enabled === 1)),
          guestSsid: a.guest?.ssid ?? `AP-${i + 1}-Guest`,
          guestKey: a.guest?.key ?? '',
          net: a.net ?? '',
        })))
      }
    }).catch(() => {})
    api.wizardScan().then((d) => {
      setRadios(d.devices || [])
      // 无回读配置时：按检测到的射频生成 AP 列表
      if (d.devices && d.devices.length > 0) {
        setApCfgs((prev) => (prev.length === 1 && prev[0].name === 'AP-1' && !prev[0].radio
          ? d.devices.map((r: string, i: number) => ({ ...makeAp(i, r) }))
          : prev))
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doScan = async () => {
    setScanning(true)
    try {
      const d = await api.wizardScan()
      setAps(d.aps)
      setRadios(d.devices || [])
    } catch (e: any) {
      toast(e?.message || '扫描失败', 'err')
    } finally {
      setScanning(false)
    }
  }

  const setVlan = (i: number, patch: Partial<VlanNet>) => {
    setVlanNets((arr) => arr.map((n, k) => (k === i ? { ...n, ...patch } : n)))
  }
  const setAp = (i: number, patch: Partial<ApCfg>) => {
    setApCfgs((arr) => arr.map((a, k) => (k === i ? { ...a, ...patch } : a)))
  }
  const addAp = () => {
    setApCfgs((arr) => (arr.length >= 8 ? arr : [...arr, makeAp(arr.length)]))
  }
  const delAp = (i: number) => {
    setApCfgs((arr) => (arr.length <= 1 ? arr : arr.filter((_, k) => k !== i)))
  }
  const addNet = () => {
    setVlanNets((arr) => {
      if (arr.length >= 6) return arr
      return [...arr, makeNet(arr.length, arr.map((n) => n.octet))]
    })
  }
  const delNet = () => {
    setVlanNets((arr) => (arr.length <= 2 ? arr : arr.slice(0, -1)))
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
    if (netMode === 'mesh' && meshKey && meshKey.length < 8) {
      toast('Mesh 密码至少 8 位（或留空开放）', 'err')
      return false
    }
    setBusy(true)
    try {
      const nets = netMode === 'vlan'
        ? vlanNets.map((n) => ({
            name: n.name, octet: n.octet, ssid: n.ssid, key: n.key,
            hidden: n.hidden ? '1' : '0',
            guest: n.guest ? '1' : '0', guest_ssid: n.guestSsid, guest_key: n.guestKey,
            dhcp_start: n.dhcpStart, dhcp_limit: n.dhcpLimit,
          }))
        : undefined
      await api.wizardMode({
        mode: netMode,
        main_router: isMain ? '1' : '0',
        guest: netMode === 'vlan' ? '0' : (guestOn ? '1' : '0'),
        mesh_id: meshId,
        mesh_key: meshKey,
        allow_lan: netMode === 'vlan' && allowLan ? '1' : '0',
        nets,
      })
      toast('组网方式已应用', 'ok')
      return true
    } catch (e: any) {
      toast(e?.message || '配置失败', 'err')
      return false
    } finally {
      setBusy(false)
    }
  }

  const applyWifi = async (): Promise<boolean> => {
    if (netMode !== 'vlan' && !mainSsid.trim()) {
      toast('请填写主 WiFi 名称', 'err')
      return false
    }
    if (netMode !== 'vlan' && mainKey && mainKey.length < 8) {
      toast('WiFi 密码至少 8 位（留空为开放网络）', 'err')
      return false
    }
    for (const n of vlanNets) {
      if (netMode === 'vlan') {
        if (!n.ssid.trim()) { toast(`「${n.name}」请填写 WiFi 名称`, 'err'); return false }
        if (n.key && n.key.length < 8) { toast(`「${n.name}」WiFi 密码至少 8 位`, 'err'); return false }
      }
    }
    for (const a of apCfgs) {
      if (a.enabled && !a.follow && !a.ssid.trim()) {
        toast(`「${a.name}」独立设置未填写 WiFi 名称`, 'err')
        return false
      }
      if (a.enabled && !a.follow && a.key && a.key.length < 8) {
        toast(`「${a.name}」WiFi 密码至少 8 位`, 'err')
        return false
      }
    }
    setBusy(true)
    try {
      const nets = netMode === 'vlan'
        ? vlanNets.map((n) => ({
            net: `lan${n.octet}`,
            octet: n.octet,
            name: n.name,
            ssid: n.ssid,
            key: n.key,
            hidden: n.hidden ? '1' : '0',
            guest: n.guest ? '1' : '0',
            guest_ssid: n.guestSsid,
            guest_key: n.guestKey,
          }))
        : []
      await api.wizardWifi({
        mode: netMode,
        main: { ssid: mainSsid, key: mainKey, hidden: mainHidden ? '1' : '0' },
        guest: { enabled: guestOn ? '1' : '0', ssid: guestSsid, key: guestKey },
        nets,
        aps: apCfgs.map((a) => ({
          name: a.name,
          radio: a.radio || undefined,
          enabled: a.enabled ? '1' : '0',
          net: netMode === 'vlan' ? a.net : undefined,
          follow: a.follow ? '1' : '0',
          ssid: a.ssid,
          key: a.key,
          hidden: a.hidden ? '1' : '0',
          isolate: a.isolate ? '1' : '0',
          channel: a.channel,
          width: a.width,
          power: a.power,
          guest: { enabled: a.guestOn ? '1' : '0', ssid: a.guestSsid, key: a.guestKey },
        })),
      })
      toast('WiFi 配置已应用', 'ok')
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
    if (step === 3 && !(await applyWifi())) return
    if (step === 4 && !(await applyPassword())) return
    if (step === 5) {
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

  const netLabel = (): string => {
    if (netMode === 'simple') return '标准路由（单网段）'
    if (netMode === 'ap_unified') return 'AP 统一网络（全部 AP 同网段）'
    if (netMode === 'mesh') return `Mesh 组网（${meshId}）`
    return `AP IP 分离（${vlanNets.length} 个独立网段${allowLan ? '，允许互访' : '，互相隔离'}）`
  }

  const apBindLabel = (a: ApCfg): string => {
    if (netMode !== 'vlan') return '主网段 192.168.21.0/24'
    const n = vlanNets.find((x) => `lan${x.octet}` === a.net) || vlanNets[0]
    return n ? `${n.name} 192.168.${n.octet}.0/24` : '未绑定'
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
              <h2>欢迎使用 月月岛科技企业路由</h2>
              <p className="muted">
                本向导将帮助你完成初始配置：<br />
                1. 确认网络角色（主路由 / 二级路由）并连接上联网络（网线 或 无线中继 WISP）<br />
                2. 选择组网方式：AP 统一网络（全部 AP 同网）/ AP IP 分离（每 AP 独立网段）/ 标准路由 / Mesh，
                可逐网段开启访客模式、设置 DHCP 范围、选择网段是否互相隔离<br />
                3. 配置 WiFi：统一一套设置并可逐 AP 精调（名称 / 信道 / 带宽 / 发射功率 / 客户端隔离 / 访客模式）；
                IP 分离模式下可为每个网段单独设置 WiFi 名称与密码<br />
                4. 设置管理密码，保障设备安全<br />
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
                    <div className="muted small">无线射频</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{radios.length > 0 ? `${radios.length} 个` : '未检测到'}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <h3>是否为主路由</h3>
              <div className="grid c2">
                <div
                  className={`card choice-card ${isMain ? 'selected' : ''}`}
                  data-testid="cc-main"
                  onClick={() => setIsMain(true)}
                >
                  <div className="cc-title">
                    是，主路由
                    {isMain && <span className="cc-check">✓</span>}
                  </div>
                  <div className="cc-desc">本机是网络唯一出口：负责拨号 / NAT / DHCP 地址分配，内网设备以本机为默认网关。</div>
                </div>
                <div
                  className={`card choice-card ${!isMain ? 'selected' : ''}`}
                  data-testid="cc-second"
                  onClick={() => setIsMain(false)}
                >
                  <div className="cc-title">
                    否，二级路由
                    {!isMain && <span className="cc-check">✓</span>}
                  </div>
                  <div className="cc-desc">上级已有主路由：本机关闭 DHCP 地址分配（由上级下发地址），仅作二级路由 / 接入扩展，管理地址保持不变。</div>
                </div>
              </div>

              <h3 className="mt24">连接上联网络</h3>
              <div className="grid c2">
                <div
                  className={`card choice-card ${uplinkMode === 'wired' ? 'selected' : ''}`}
                  data-testid="cc-wired"
                  onClick={() => setUplinkMode('wired')}
                >
                  <div className="cc-title">
                    网线接入（DHCP）
                    {uplinkMode === 'wired' && <span className="cc-check">✓</span>}
                  </div>
                  <div className="cc-desc">将上联网线插入 WAN 口，自动获取上级网络地址，光猫/主路由场景即插即用。</div>
                </div>
                <div
                  className={`card choice-card ${uplinkMode === 'wisp' ? 'selected' : ''}`}
                  data-testid="cc-wisp"
                  onClick={() => { setUplinkMode('wisp'); doScan() }}
                >
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
                      {scanning ? '扫描中…' : '重新扫描'}
                    </button>
                    <span className="muted small">选择要中继的上级无线信号</span>
                  </div>
                  {scanning && <Loading text="正在扫描周边无线信号…" />}
                  {!scanning && aps.length === 0 && <Empty text="点击上方按钮开始扫描" />}
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
              <div className="grid c2">
                {[
                  { id: 'ap_unified', t: 'AP 全部同网', d: '所有 AP 接入同一网段（192.168.21.0/24），广播同一套 WiFi，设备在 AP 之间无缝漫游，适合全屋 / 全店统一 WiFi' },
                  { id: 'vlan', t: 'AP IP 分离', d: '每个 AP 使用独立网段（独立地址池 / 默认隔离互访），可为每个网段单独设置 WiFi 名称、密码、DHCP 范围与访客模式' },
                  { id: 'simple', t: '标准路由', d: '单网段 NAT 上网，最简配置，适合家庭 / 小微办公室' },
                  { id: 'mesh', t: 'Mesh 组网', d: '多台设备无线回程自动组网，无缝漫游，适合不便布线的多层环境' },
                ].map((o) => (
                  <div
                    key={o.id}
                    className={`card choice-card ${netMode === o.id ? 'selected' : ''}`}
                    data-testid={`cc-${o.id}`}
                    onClick={() => setNetMode(o.id as any)}
                  >
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
                  <div className="row">
                    <div style={{ fontWeight: 700 }}>独立网段（{vlanNets.length} 个，每 AP 一段）</div>
                    <span className="grow" />
                    <button className="btn small ghost" data-testid="wz-del-net" onClick={delNet} disabled={vlanNets.length <= 2}>－ 删除网段</button>
                    <button className="btn small" data-testid="wz-add-net" onClick={addNet} disabled={vlanNets.length >= 6}>＋ 添加网段</button>
                  </div>
                  <div className="table-wrap mt8">
                    <table className="yy">
                      <thead>
                        <tr><th>网段名称</th><th>网段</th><th>网关地址</th><th>DHCP 起始</th><th>DHCP 数量</th><th>访客模式</th></tr>
                      </thead>
                      <tbody>
                        {vlanNets.map((n, i) => (
                          <tr key={i}>
                            <td>
                              <input className="input" style={{ width: 120 }} value={n.name}
                                onChange={(e) => setVlan(i, { name: e.target.value })} />
                            </td>
                            <td className="mono">192.168.{n.octet}.0/24</td>
                            <td className="mono">192.168.{n.octet}.1</td>
                            <td>
                              <input className="input num" style={{ width: 70 }} type="number" min={2} max={240} value={n.dhcpStart}
                                onChange={(e) => setVlan(i, { dhcpStart: Number(e.target.value) || 100 })} />
                            </td>
                            <td>
                              <input className="input num" style={{ width: 70 }} type="number" min={10} max={150} value={n.dhcpLimit}
                                onChange={(e) => setVlan(i, { dhcpLimit: Number(e.target.value) || 150 })} />
                            </td>
                            <td>
                              <span data-testid={`net-guest-${i}`}><Switch on={n.guest} onChange={(v) => setVlan(i, { guest: v })} /></span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="card mt12" style={{ padding: '14px 16px' }}>
                    <div className="row">
                      <div className="grow">
                        <div style={{ fontWeight: 700 }}>允许网段之间互访</div>
                        <div className="muted small" style={{ marginTop: 3 }}>
                          关闭（默认）：各网段完全隔离，仅共享上联出口；开启：各网段之间可互相访问（适合办公内网互通）
                        </div>
                      </div>
                      <Switch on={allowLan} onChange={setAllowLan} />
                    </div>
                  </div>
                  <div className="muted small mt8">
                    每个网段独立 DHCP 地址池与防火墙区域；逐网段的 WiFi 名称、密码与访客 WiFi 在下一步设置，AP 与网段的绑定关系也可在下一步调整。
                  </div>
                </div>
              )}

              {(netMode === 'simple' || netMode === 'ap_unified') && (
                <div className="card mt16" style={{ padding: '14px 16px' }}>
                  <div className="row">
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>启用访客网络</div>
                      <div className="muted small" style={{ marginTop: 3 }}>
                        额外广播一套访客 WiFi（192.168.30.0/24）：只能上外网，与内网设备隔离（客户端隔离 + 禁止互访）；
                        可在下一步逐 AP 决定是否广播访客信号
                      </div>
                    </div>
                    <span data-testid="wz-guest-on"><Switch on={guestOn} onChange={setGuestOn} /></span>
                  </div>
                </div>
              )}

              {netMode === 'mesh' && (
                <div className="card mt16" style={{ padding: '14px 16px' }}>
                  <div className="row">
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>启用访客网络</div>
                      <div className="muted small" style={{ marginTop: 3 }}>
                        在 Mesh 主网之外广播访客 WiFi（192.168.30.0/24），仅可访问外网
                      </div>
                    </div>
                    <span data-testid="wz-guest-on"><Switch on={guestOn} onChange={setGuestOn} /></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h3>WiFi 设置</h3>
              <div className="muted small" style={{ marginBottom: 12 }}>
                {netMode === 'vlan'
                  ? '已开启 AP IP 分离：先为每个网段设置 WiFi 名称、密码与访客模式，再逐 AP 绑定网段与射频参数。'
                  : netMode === 'ap_unified'
                    ? 'AP 全部同网：默认所有 AP 广播同一套 WiFi；每个 AP 可切换为独立设置，并单独调整信道 / 带宽 / 发射功率 / 客户端隔离 / 访客模式。'
                    : netMode === 'mesh'
                      ? 'Mesh 组网：主 WiFi 在所有节点广播（回程自动协商），可逐 AP 微调射频参数。'
                      : '标准路由：设置唯一的内网 WiFi，可逐 AP 微调。'}
                {uplinkMode === 'wisp' && ' 当前为 WISP 无线中继，2.4G 射频可能同时承担上联，速率会受影响。'}
              </div>

              {netMode !== 'vlan' ? (
                <div className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>统一设置（各 AP 默认跟随）</div>
                  <div className="grid c2">
                    <Field label="WiFi 名称（SSID）">
                      <input className="input" data-testid="wz-main-ssid" value={mainSsid} onChange={(e) => setMainSsid(e.target.value)} placeholder="例如 yueyue-opwrt" />
                    </Field>
                    <Field label="WiFi 密码（至少 8 位，留空为开放网络）">
                      <input className="input" data-testid="wz-main-key" type="password" value={mainKey} onChange={(e) => setMainKey(e.target.value)} />
                    </Field>
                  </div>
                  <div className="row mt8">
                    <span className="muted small">隐藏 SSID（不广播名称，需手动输入加入）</span>
                    <span data-testid="wz-main-hidden"><Switch on={mainHidden} onChange={setMainHidden} /></span>
                  </div>
                  {guestOn && (
                    <div className="mt12" style={{ paddingLeft: 12, borderLeft: '2px solid var(--glass-border)' }}>
                      <div className="grid c2">
                        <Field label="访客 WiFi 名称">
                          <input className="input" value={guestSsid} onChange={(e) => setGuestSsid(e.target.value)} />
                        </Field>
                        <Field label="访客 WiFi 密码（至少 8 位，留空为开放）">
                          <input className="input" type="password" value={guestKey} onChange={(e) => setGuestKey(e.target.value)} />
                        </Field>
                      </div>
                      <div className="muted small mt8">访客走隔离网段 192.168.30.0/24，仅可上外网；由下方各 AP 的访客模式开关决定在哪些 AP 广播。</div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>逐网段设置</div>
                  {vlanNets.map((n, i) => (
                    <div className="card mt8" key={i} style={{ padding: '16px 18px' }}>
                      <div className="row">
                        <div style={{ fontWeight: 700 }}>
                          {n.name} <span className="muted small mono">192.168.{n.octet}.0/24</span>
                        </div>
                        <span className="grow" />
                        <span className="muted small">访客模式</span>
                        <Switch on={n.guest} onChange={(v) => setVlan(i, { guest: v })} />
                      </div>
                      <div className="grid c2 mt8">
                        <Field label="WiFi 名称（SSID）">
                          <input className="input" data-testid={`net-ssid-${i}`} value={n.ssid} onChange={(e) => setVlan(i, { ssid: e.target.value })} />
                        </Field>
                        <Field label="WiFi 密码（至少 8 位，留空为开放）">
                          <input className="input" data-testid={`net-key-${i}`} type="password" value={n.key} onChange={(e) => setVlan(i, { key: e.target.value })} />
                        </Field>
                      </div>
                      <div className="row mt8">
                        <span className="muted small">隐藏 SSID</span>
                        <Switch on={n.hidden} onChange={(v) => setVlan(i, { hidden: v })} />
                        <span className="grow" />
                        <span className="muted small mono">DHCP 192.168.{n.octet}.{n.dhcpStart} 起 · {n.dhcpLimit} 个</span>
                      </div>
                      {n.guest && (
                        <div className="mt8" style={{ paddingLeft: 12, borderLeft: '2px solid var(--glass-border)' }}>
                          <div className="grid c2">
                            <Field label="访客 WiFi 名称">
                              <input className="input" value={n.guestSsid} onChange={(e) => setVlan(i, { guestSsid: e.target.value })} />
                            </Field>
                            <Field label="访客 WiFi 密码（至少 8 位，留空为开放）">
                              <input className="input" type="password" value={n.guestKey} onChange={(e) => setVlan(i, { guestKey: e.target.value })} />
                            </Field>
                          </div>
                          <div className="muted small mt8">该网段的访客走隔离网段 192.168.30.0/24，仅可上外网。</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="row mt24">
                <div style={{ fontWeight: 700 }}>逐 AP 设置（{apCfgs.length} 个）</div>
                <span className="grow" />
                <span className="muted small">默认跟随上级设置，可单独精调</span>
                <button className="btn small" data-testid="wz-add-ap" onClick={addAp} disabled={apCfgs.length >= 8}>＋ 添加 AP</button>
              </div>
              {apCfgs.length === 0 && <Empty text="暂无 AP，点击右上角添加" />}
              {apCfgs.map((a, i) => (
                <div className="card mt12" key={i} data-testid={`ap-card-${i}`} style={{ padding: '16px 18px', opacity: a.enabled ? 1 : 0.55 }}>
                  <div className="row">
                    <input className="input" data-testid={`ap-name-${i}`} style={{ width: 160, fontWeight: 700 }} value={a.name}
                      onChange={(e) => setAp(i, { name: e.target.value })} placeholder={`AP-${i + 1}`} />
                    {a.radio && <Badge kind="mute">{a.radio}</Badge>}
                    <Badge kind="mute">{apBindLabel(a)}</Badge>
                    <span className="grow" />
                    <span className="muted small">启用</span>
                    <span data-testid={`ap-enabled-${i}`}><Switch on={a.enabled} onChange={(v) => setAp(i, { enabled: v })} /></span>
                    <button className="btn small ghost" data-testid={`ap-del-${i}`} onClick={() => delAp(i)} disabled={apCfgs.length <= 1}>删除</button>
                  </div>

                  <div className="grid c3 mt12">
                    <Field label="信道">
                      <select className="input" value={a.channel} onChange={(e) => setAp(i, { channel: e.target.value })}>
                        {CHANNELS_24.map((c) => <option key={`24-${c}`} value={c}>{c === 'auto' ? '自动' : `2.4G · ${c}`}</option>)}
                        {CHANNELS_5.filter((c) => c !== 'auto').map((c) => <option key={`5-${c}`} value={c}>5G · {c}</option>)}
                      </select>
                    </Field>
                    <Field label="频宽">
                      <select className="input" value={a.width} onChange={(e) => setAp(i, { width: e.target.value })}>
                        {WIDTHS.map((w) => <option key={w.v} value={w.v}>{w.t}</option>)}
                      </select>
                    </Field>
                    <Field label="发射功率">
                      <select className="input" value={a.power} onChange={(e) => setAp(i, { power: e.target.value })}>
                        {POWERS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div className="row mt8">
                    <span className="muted small">跟随上级设置（关闭后为该 AP 单独指定 WiFi）</span>
                    <span data-testid={`ap-follow-${i}`}><Switch on={a.follow} onChange={(v) => setAp(i, { follow: v })} /></span>
                    <span className="grow" />
                    <span className="muted small">客户端隔离（连此 AP 的设备互不相通）</span>
                    <span data-testid={`ap-isolate-${i}`}><Switch on={a.isolate} onChange={(v) => setAp(i, { isolate: v })} /></span>
                  </div>

                  {!a.follow ? (
                    <div className="mt8" style={{ paddingLeft: 12, borderLeft: '2px solid var(--glass-border)' }}>
                      <div className="grid c2">
                        <Field label="该 AP 独立 WiFi 名称">
                          <input className="input" data-testid={`ap-ssid-${i}`} value={a.ssid} onChange={(e) => setAp(i, { ssid: e.target.value })} />
                        </Field>
                        <Field label="该 AP 独立密码（至少 8 位，留空为开放）">
                          <input className="input" data-testid={`ap-key-${i}`} type="password" value={a.key} onChange={(e) => setAp(i, { key: e.target.value })} />
                        </Field>
                      </div>
                      <div className="row mt8">
                        <span className="muted small">隐藏 SSID</span>
                        <Switch on={a.hidden} onChange={(v) => setAp(i, { hidden: v })} />
                      </div>
                    </div>
                  ) : (
                    <div className="muted small mt8">
                      当前跟随：{netMode === 'vlan'
                        ? (() => { const n = vlanNets.find((x) => `lan${x.octet}` === a.net) || vlanNets[0]; return n ? `${n.ssid} / ${n.key ? '已设密码' : '开放'}` : '—' })()
                        : `${mainSsid} / ${mainKey ? '已设密码' : '开放'}`}
                    </div>
                  )}

                  {netMode === 'vlan' && (
                    <div className="row mt8">
                      <span className="muted small">绑定网段</span>
                      <select className="input" style={{ width: 220 }} value={a.net} onChange={(e) => setAp(i, { net: e.target.value })}>
                        <option value="">（按顺序自动分配）</option>
                        {vlanNets.map((n) => <option key={n.octet} value={`lan${n.octet}`}>{n.name} · 192.168.{n.octet}.0/24</option>)}
                      </select>
                    </div>
                  )}

                  <div className="row mt8">
                    <span className="muted small">该 AP 广播访客 WiFi</span>
                    <span data-testid={`ap-guest-${i}`}><Switch on={a.guestOn} onChange={(v) => setAp(i, { guestOn: v })} /></span>
                    {a.guestOn && (
                      <>
                        <input className="input" style={{ width: 200 }} data-testid={`ap-guestssid-${i}`} value={a.guestSsid}
                          onChange={(e) => setAp(i, { guestSsid: e.target.value })} placeholder="访客 WiFi 名称" />
                        <input className="input" style={{ width: 200 }} data-testid={`ap-guestkey-${i}`} type="password" value={a.guestKey}
                          onChange={(e) => setAp(i, { guestKey: e.target.value })} placeholder="访客密码（≥8 位或留空）" />
                      </>
                    )}
                  </div>
                  {a.guestOn && (
                    <div className="muted small mt8">访客走隔离网段 192.168.30.0/24，仅可上外网，访客之间也不互通。</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
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
              {pw1 && (
                <div className="muted small mt8">
                  密码强度：{pw1.length >= 12 ? '强' : pw1.length >= 8 ? '中' : '弱'}
                  （建议 8 位以上，混合大小写与数字）
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="wz-summary">
              <h3>配置摘要</h3>
              <div className="kv"><span className="k">网络角色</span><span>{isMain ? '主路由（NAT / DHCP）' : '二级路由（关闭本机 DHCP）'}</span></div>
              <div className="kv"><span className="k">上联方式</span><span>{uplinkMode === 'wired' ? '网线 DHCP' : `WISP 中继 ${selAp?.ssid || ''}`}</span></div>
              <div className="kv"><span className="k">组网方式</span><span>{netLabel()}</span></div>
              {netMode === 'vlan' ? (
                <>
                  {vlanNets.map((n, i) => (
                    <div className="kv" key={i}>
                      <span className="k">{n.name}（192.168.{n.octet}.0/24）</span>
                      <span>
                        {n.ssid} / {n.key ? '已设密码' : '开放'}
                        {n.hidden ? ' · 隐藏' : ''}
                        {n.guest ? ` · 访客 ${n.guestSsid}` : ''}
                        {` · DHCP ${n.dhcpStart}-${n.dhcpStart + n.dhcpLimit - 1}`}
                      </span>
                    </div>
                  ))}
                  <div className="kv"><span className="k">网段互访</span><span>{allowLan ? '允许' : '隔离（默认）'}</span></div>
                </>
              ) : (
                <div className="kv"><span className="k">主 WiFi</span><span>{mainSsid} / {mainKey ? '已设密码' : '开放'}{mainHidden ? ' · 隐藏' : ''}</span></div>
              )}
              {guestOn && netMode !== 'vlan' && (
                <div className="kv"><span className="k">访客 WiFi</span><span>{guestSsid}（192.168.30.0/24 隔离）</span></div>
              )}
              {apCfgs.map((a, i) => (
                <div className="kv" key={i}>
                  <span className="k">{a.name}{a.radio ? `（${a.radio}）` : ''}</span>
                  <span>
                    {a.enabled
                      ? `${apBindLabel(a)} · ${a.follow ? '跟随上级' : `独立 ${a.ssid}`} · 信道 ${a.channel} · ${a.width === 'auto' ? '自动频宽' : `${a.width}MHz`} · ${a.power === 'auto' ? '自动功率' : `${a.power}dBm`}${a.isolate ? ' · 客户端隔离' : ''}${a.guestOn ? ` · 访客 ${a.guestSsid}` : ''}`
                      : '未启用'}
                  </span>
                </div>
              ))}
              <div className="kv"><span className="k">管理密码</span><span>{pw1 ? '已修改' : '保持默认'}</span></div>
              <div className="kv"><span className="k">管理地址</span><span className="mono">{status?.lan_ip || '192.168.21.1'}</span></div>
              <div className="muted small mt16">点击“完成”保存配置并进入控制台首页。</div>
            </div>
          )}
        </div>

        <div className="row mt24" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" data-testid="wz-prev" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>← 上一步</button>
          <button className="btn primary" data-testid="wz-next" disabled={busy} onClick={next}>
            {busy ? '处理中…' : step === 5 ? '完成 ✓' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
