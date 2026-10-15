import React, { useState } from 'react'
import { Card, Loading, useAsync, useToast, Badge, Empty } from '../components/ui'
import { api } from '../lib/api'

export default function Packages() {
  const [tab, setTab] = useState<'installed' | 'search'>('installed')
  const [keyword, setKeyword] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const list = useAsync(() => api.opkgList(), [])
  const [results, setResults] = useState<{ name: string; version: string }[] | null>(null)

  const search = async () => {
    if (!keyword.trim()) return toast('请输入关键词', 'err')
    setBusy(true)
    try {
      const d = await api.opkgSearch(keyword.trim())
      setResults(d.packages)
      setTab('search')
    } catch (e: any) {
      toast(e?.message || '搜索失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const runOp = async (fn: () => Promise<{ output: string }>, label: string) => {
    setBusy(true)
    setOut(`${label} …`)
    try {
      const d = await fn()
      setOut(d.output || '(完成)')
      toast(`${label} 完成`, 'ok')
      list.reload()
    } catch (e: any) {
      setOut(e?.message || '失败')
      toast(e?.message || `${label} 失败`, 'err')
    } finally {
      setBusy(false)
    }
  }

  const rows = tab === 'search' ? results || [] : list.data?.packages || []

  return (
    <div>
      <Card
        title="软件包管理 (opkg)"
        right={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" disabled={busy} onClick={() => runOp(() => api.opkgUpdate(), '更新软件源')}>
              更新软件源
            </button>
            <button className="btn small" onClick={() => list.reload()}>刷新列表</button>
          </div>
        }
      >
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="搜索软件包（例如 luci-app-）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button className="btn primary" disabled={busy} onClick={search}>搜索</button>
          {tab === 'search' && (
            <button className="btn" onClick={() => setTab('installed')}>← 返回已安装</button>
          )}
        </div>
      </Card>

      <Card title={tab === 'search' ? `搜索结果（${rows.length}）` : `已安装软件包（${rows.length}）`}>
        {busy && !rows.length ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text="无匹配软件包" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table className="yy">
              <thead>
                <tr><th>软件包</th><th>版本</th><th>操作</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.name}>
                    <td className="mono" style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="muted">{p.version}</td>
                    <td>
                      {tab === 'search' ? (
                        <button className="btn small primary" disabled={busy} onClick={() => runOp(() => api.opkgInstall(p.name), `安装 ${p.name}`)}>
                          安装
                        </button>
                      ) : (
                        <button className="btn small danger" disabled={busy} onClick={() => runOp(() => api.opkgRemove(p.name), `卸载 ${p.name}`)}>
                          卸载
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {out && (
        <Card title="命令输出">
          <pre
            className="mono"
            style={{
              margin: 0, padding: 14, borderRadius: 12, maxHeight: 300, overflow: 'auto',
              background: 'color-mix(in srgb, var(--bg-0) 55%, transparent)',
              border: '1px solid var(--glass-border)', whiteSpace: 'pre-wrap',
            }}
          >
            {out}
          </pre>
        </Card>
      )}
    </div>
  )
}
