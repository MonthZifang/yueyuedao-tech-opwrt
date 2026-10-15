import React, { useEffect, useState } from 'react'
import { Card, Badge, Loading, useToast, Empty, Field, Modal, Switch } from '../components/ui'
import { ubusCall } from '../lib/ubus'

interface Zone { name: string; network: string[]; input: string; output: string; forward: string; masq?: boolean; section: string }
interface Forward { name: string; src: string; src_dport: string; dest: string; dest_ip: string; dest_port: string; proto: string; enabled: boolean; section: string }

export default function Firewall() {
  const toast = useToast()
  const [zones, setZones] = useState<Zone[]>([])
  const [forwards, setForwards] = useState<Forward[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<Partial<Forward> | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const cfg = await ubusCall<any>('uci', 'get', { config: 'firewall' })
      const values = cfg?.values || {}
      const zs: Zone[] = []
      const fs: Forward[] = []
      for (const [section, v] of Object.entries<any>(values)) {
        if (v['.type'] === 'zone') {
          zs.push({
            name: v.name, network: [].concat(v.network || []), input: v.input, output: v.output,
            forward: v.forward, masq: v.masq === '1', section,
          })
        }
        if (v['.type'] === 'redirect') {
          fs.push({
            name: v.name || `${v.src_dport}/${v.proto}`, src: v.src, src_dport: v.src_dport || '',
            dest: v.dest, dest_ip: v.dest_ip || '', dest_port: v.dest_port || '',
            proto: v.proto || 'tcp udp', enabled: v.enabled !== '0', section,
          })
        }
      }
      setZones(zs)
      setForwards(fs)
    } catch (e: any) {
      toast(e?.message || '获取防火墙配置失败', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = async () => {
    try {
      await ubusCall('uci', 'commit', { config: 'firewall' })
      await ubusCall('network', 'reload', {})
      toast('防火墙已重载', 'ok')
    } catch (e: any) {
      toast(e?.message || '重载失败', 'err')
    }
  }

  const saveForward = async () => {
    if (!edit?.src_dport || !edit?.dest_ip) {
      toast('请填写端口和目标 IP', 'err')
      return
    }
    try {
      if (edit.section) {
        await ubusCall('uci', 'set', {
          config: 'firewall', section: edit.section,
          values: {
            name: edit.name, src: 'wan', dest: 'lan', proto: edit.proto || 'tcp',
            src_dport: edit.src_dport, dest_ip: edit.dest_ip, dest_port: edit.dest_port || edit.src_dport,
          },
        })
      } else {
        await ubusCall('uci', 'add', {
          config: 'firewall', type: 'redirect',
          values: {
            name: edit.name || `转发${edit.src_dport}`, src: 'wan', dest: 'lan', proto: edit.proto || 'tcp',
            src_dport: edit.src_dport, dest_ip: edit.dest_ip, dest_port: edit.dest_port || edit.src_dport,
          },
        })
      }
      await apply()
      setEdit(null)
      load()
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    }
  }

  const delForward = async (section: string) => {
    if (!confirm('删除该端口转发？')) return
    try {
      await ubusCall('uci', 'delete', { config: 'firewall', section })
      await apply()
      load()
    } catch (e: any) {
      toast(e?.message || '删除失败', 'err')
    }
  }

  if (loading && zones.length === 0) return <Loading />

  return (
    <div>
      <Card title="防火墙区域" right={<button className="btn small primary" onClick={apply}>重载防火墙</button>}>
        <div className="table-wrap">
          <table className="yy">
            <thead>
              <tr><th>区域</th><th>网络</th><th>入站</th><th>出站</th><th>转发</th><th>NAT</th></tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.section}>
                  <td style={{ fontWeight: 700 }}>{z.name}</td>
                  <td>{z.network.join(', ')}</td>
                  <td><Badge kind={z.input === 'accept' ? 'ok' : z.input === 'reject' ? 'danger' : 'warn'}>{z.input}</Badge></td>
                  <td><Badge kind={z.output === 'accept' ? 'ok' : 'warn'}>{z.output}</Badge></td>
                  <td><Badge kind={z.forward === 'accept' ? 'ok' : 'danger'}>{z.forward}</Badge></td>
                  <td>{z.masq ? <Badge kind="ok">开启</Badge> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="端口转发（外网 → 内网）"
        right={<button className="btn primary small" onClick={() => setEdit({ proto: 'tcp', enabled: true })}>＋ 新增</button>}
      >
        {forwards.length === 0 ? (
          <Empty text="暂无端口转发规则" />
        ) : (
          <div className="table-wrap">
            <table className="yy">
              <thead>
                <tr><th>名称</th><th>协议</th><th>外网端口</th><th>目标 IP</th><th>目标端口</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {forwards.map((f) => (
                  <tr key={f.section}>
                    <td>{f.name}</td>
                    <td><Badge kind="mute">{f.proto}</Badge></td>
                    <td className="mono">{f.src_dport}</td>
                    <td className="mono">{f.dest_ip}</td>
                    <td className="mono">{f.dest_port}</td>
                    <td>{f.enabled ? <Badge kind="ok">启用</Badge> : <Badge kind="mute">停用</Badge>}</td>
                    <td>
                      <button className="btn small" onClick={() => setEdit({ ...f })}>编辑</button>{' '}
                      <button className="btn small danger" onClick={() => delForward(f.section)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && (
        <Modal title={edit.section ? '编辑端口转发' : '新增端口转发'} onClose={() => setEdit(null)}>
          <Field label="名称">
            <input className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="例如 Web服务" />
          </Field>
          <div className="grid c2">
            <Field label="协议">
              <select className="input" value={edit.proto || 'tcp'} onChange={(e) => setEdit({ ...edit, proto: e.target.value })}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="tcp udp">TCP+UDP</option>
              </select>
            </Field>
            <Field label="外网端口">
              <input className="input mono" value={edit.src_dport || ''} onChange={(e) => setEdit({ ...edit, src_dport: e.target.value })} placeholder="8080" />
            </Field>
            <Field label="内网目标 IP">
              <input className="input mono" value={edit.dest_ip || ''} onChange={(e) => setEdit({ ...edit, dest_ip: e.target.value })} placeholder="192.168.21.x" />
            </Field>
            <Field label="内网目标端口">
              <input className="input mono" value={edit.dest_port || ''} onChange={(e) => setEdit({ ...edit, dest_port: e.target.value })} placeholder="同外网端口" />
            </Field>
          </div>
          <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={saveForward}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
