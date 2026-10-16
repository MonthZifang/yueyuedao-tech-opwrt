import React, { useState } from 'react'
import { Card, useToast, useInterval, Badge } from '../components/ui'
import { api } from '../lib/api'

export default function LogView() {
  const [output, setOutput] = useState('')
  const [filter, setFilter] = useState('')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const load = async () => {
    setBusy(true)
    try {
      const d = await api.log(400, filter || undefined)
      setOutput(d.output || '(日志为空)')
    } catch (e: any) {
      toast(e?.message || '获取日志失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  useInterval(() => load(), auto ? 5000 : null)

  return (
    <div>
      <Card
        title="系统日志 (logread)"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn small ${auto ? 'primary' : ''}`} onClick={() => setAuto(!auto)}>
              {auto ? '停止自动刷新' : '自动刷新'}
            </button>
            <button className="btn small" onClick={load} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>
          </div>
        }
      >
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="过滤关键词（例如 dnsmasq / kernel / error）"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button className="btn" onClick={load}>搜索</button>
          {filter && <Badge kind="mute">过滤: {filter}</Badge>}
        </div>
      </Card>

      <Card>
        <pre
          className="mono"
          style={{
            margin: 0, padding: 16, borderRadius: 12, maxHeight: '62vh', overflow: 'auto',
            background: 'color-mix(in srgb, var(--bg-0) 55%, transparent)',
            border: '1px solid var(--glass-border)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
          }}
        >
          {output || '暂无日志'}
        </pre>
      </Card>
    </div>
  )
}
