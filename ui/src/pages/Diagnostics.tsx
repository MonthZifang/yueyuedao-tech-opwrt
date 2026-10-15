import React, { useState } from 'react'
import { Card, useToast, Field, Loading } from '../components/ui'
import { api } from '../lib/api'

const TOOLS = [
  { id: 'ping', t: 'Ping', d: '测试到目标的连通性与延迟' },
  { id: 'trace', t: '路由追踪', d: '查看到目标经过的路由跳数' },
  { id: 'nslookup', t: 'DNS 解析', d: '查询域名解析结果' },
]

export default function Diagnostics() {
  const [type, setType] = useState('ping')
  const [target, setTarget] = useState('www.baidu.com')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const run = async () => {
    if (!target.trim()) return toast('请输入目标地址', 'err')
    setBusy(true)
    setOutput('执行中…')
    try {
      const d = await api.diag(type, target.trim())
      setOutput(d.output || '(无输出)')
    } catch (e: any) {
      setOutput(e?.message || '执行失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Card title="网络诊断工具">
        <div className="row wrap" style={{ gap: 10 }}>
          {TOOLS.map((t) => (
            <button key={t.id} className={`btn ${type === t.id ? 'primary' : ''}`} onClick={() => setType(t.id)}>
              {t.t}
            </button>
          ))}
        </div>
        <div className="muted small mt8">{TOOLS.find((t) => t.id === type)?.d}</div>

        <div className="row mt16" style={{ gap: 10 }}>
          <div className="grow">
            <input
              className="input mono"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="目标 IP 或域名"
              onKeyDown={(e) => e.key === 'Enter' && run()}
            />
          </div>
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? '执行中…' : '开始诊断'}
          </button>
        </div>
      </Card>

      <Card title="诊断结果">
        {busy ? (
          <Loading text="正在执行，请稍候…" />
        ) : (
          <pre
            className="mono"
            style={{
              margin: 0, padding: 16, borderRadius: 12, maxHeight: 420, overflow: 'auto',
              background: 'color-mix(in srgb, var(--bg-0) 55%, transparent)',
              border: '1px solid var(--glass-border)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}
          >
            {output || '点击"开始诊断"查看结果'}
          </pre>
        )}
      </Card>
    </div>
  )
}
