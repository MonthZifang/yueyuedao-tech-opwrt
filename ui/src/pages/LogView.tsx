import React, { useEffect, useState } from 'react'
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
      setOutput(d.output || '')
    } catch (e: any) {
      toast(e?.message || '获取日志失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  // 挂载即加载（原版不自动取数，打开永远显示“暂无日志”）
  useEffect(() => { load() }, [])

  useInterval(() => load(), auto ? 5000 : null)

  const lineCount = output ? output.split('\n').filter((l) => l.trim()).length : 0

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
          {lineCount > 0 && <Badge kind="mute">{lineCount} 行</Badge>}
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
          {busy && !output
            ? '正在加载日志…'
            : output || (filter ? `没有匹配“${filter}”的日志` : '当前启动以来暂无日志记录')}
        </pre>
      </Card>
    </div>
  )
}
