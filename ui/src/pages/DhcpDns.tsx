import React, { useEffect, useState } from 'react'
import { Card, Badge, Loading, useToast, Empty, Field, Modal, useAsync } from '../components/ui'
import { ubusCall } from '../lib/ubus'

interface Lease {
  mac: string
  ip: string
  hostname: string
  expires?: number
}

export default function DhcpDns() {
  const toast = useToast()
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState(true)
  const [dns, setDns] = useState('')
  const [dnsmasqSection, setDnsmasqSection] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [host, setHost] = useState({ name: '', mac: '', ip: '' })

  const load = async () => {
    setLoading(true)
    try {
      const d = await ubusCall<any>('dhcp', 'leases', {})
      setLeases(d.leases || [])
      const cfg = await ubusCall<any>('uci', 'get', { config: 'dhcp' })
      const hit = Object.entries(cfg?.values || {}).find(([, v]: any) => v['.type'] === 'dnsmasq')
      if (hit) {
        setDnsmasqSection(hit[0] as string)
        const server = (hit[1] as any)?.server
        setDns((Array.isArray(server) ? server.join(' ') : server) || '')
      }
    } catch (e: any) {
      toast(e?.message || '获取失败', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addStatic = async () => {
    if (!host.name || !host.mac || !host.ip) {
      toast('请填写完整', 'err')
      return
    }
    try {
      await ubusCall('uci', 'add', {
        config: 'dhcp', type: 'host',
        values: { name: host.name, mac: host.mac, ip: host.ip, leasetime: 'permanent' },
      })
      await ubusCall('uci', 'commit', { config: 'dhcp' })
      await ubusCall('network', 'reload', {})
      toast('静态租约已添加', 'ok')
      setShowAdd(false)
      setHost({ name: '', mac: '', ip: '' })
    } catch (e: any) {
      toast(e?.message || '添加失败', 'err')
    }
  }

  const saveDns = async () => {
    if (!dnsmasqSection) {
      toast('未找到 dnsmasq 配置', 'err')
      return
    }
    try {
      const servers = dns.split(/[\s,]+/).filter(Boolean)
      await ubusCall('uci', 'set', {
        config: 'dhcp', section: dnsmasqSection,
        values: { server: servers.length ? servers : undefined },
      })
      await ubusCall('uci', 'commit', { config: 'dhcp' })
      await ubusCall('network', 'reload', {})
      toast('DNS 设置已保存', 'ok')
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    }
  }

  return (
    <div>
      <Card
        title="DHCP 客户端（当前租约）"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => setShowAdd(true)}>＋ 静态租约</button>
            <button className="btn small" onClick={load}>刷新</button>
          </div>
        }
      >
        {loading ? (
          <Loading />
        ) : leases.length === 0 ? (
          <Empty text="当前没有 DHCP 租约" />
        ) : (
          <div className="table-wrap">
            <table className="yy">
              <thead>
                <tr><th>主机名</th><th>IP 地址</th><th>MAC 地址</th><th>剩余租期</th></tr>
              </thead>
              <tbody>
                {leases.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.hostname || <span className="muted">—</span>}</td>
                    <td className="mono">{l.ip}</td>
                    <td className="mono">{l.mac}</td>
                    <td className="muted">{l.expires ? `${Math.round(l.expires / 60)} 分钟` : '永久'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="DNS 设置（上游解析服务器）" right={<button className="btn primary small" onClick={saveDns}>保存</button>}>
        <Field label="上游 DNS（空格分隔多个，留空使用运营商分配）">
          <input className="input mono" value={dns} onChange={(e) => setDns(e.target.value)} placeholder="例如 223.5.5.5 119.29.29.29" />
        </Field>
        <div className="muted small">修改后网络将自动重载，dnsmasq 会使用新的上游服务器。</div>
      </Card>

      {showAdd && (
        <Modal title="添加静态租约" onClose={() => setShowAdd(false)}>
          <Field label="主机名">
            <input className="input" value={host.name} onChange={(e) => setHost({ ...host, name: e.target.value })} />
          </Field>
          <Field label="MAC 地址">
            <input className="input mono" placeholder="aa:bb:cc:dd:ee:ff" value={host.mac} onChange={(e) => setHost({ ...host, mac: e.target.value })} />
          </Field>
          <Field label="IP 地址">
            <input className="input mono" placeholder="192.168.21.x" value={host.ip} onChange={(e) => setHost({ ...host, ip: e.target.value })} />
          </Field>
          <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setShowAdd(false)}>取消</button>
            <button className="btn primary" onClick={addStatic}>添加</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
