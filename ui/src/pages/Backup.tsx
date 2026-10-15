import React, { useRef, useState } from 'react'
import { Card, useToast, Badge, Field } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../App'

export default function Backup() {
  const toast = useToast()
  const { logout } = useApp()
  const restoreRef = useRef<HTMLInputElement>(null)
  const fwRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const doBackup = async () => {
    setBusy(true)
    try {
      const d = await api.backup()
      const bin = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0))
      const blob = new Blob([bin], { type: 'application/gzip' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = d.filename
      a.click()
      URL.revokeObjectURL(a.href)
      toast('配置备份已下载', 'ok')
    } catch (e: any) {
      toast(e?.message || '备份失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async (file: File) => {
    if (!confirm('恢复配置将覆盖当前配置并重启，确认继续？')) return
    setBusy(true)
    try {
      const d = await api.restore(file)
      toast(d.msg || '已恢复，系统即将重启', 'ok')
      setTimeout(() => logout(), 3000)
    } catch (e: any) {
      toast(e?.message || '恢复失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const doUpgrade = async (file: File) => {
    if (!confirm(`确认刷写固件 ${file.name}？设备将重启，配置默认保留。`)) return
    setBusy(true)
    try {
      const d = await api.upgrade(file)
      toast(d.msg || '固件上传完成，即将刷写', 'ok')
      setTimeout(() => logout(), 5000)
    } catch (e: any) {
      toast(e?.message || '升级失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const doReboot = async () => {
    if (!confirm('确认重启设备？')) return
    setBusy(true)
    try {
      await api.reboot()
      toast('设备正在重启…', 'ok')
      setTimeout(() => logout(), 3000)
    } catch (e: any) {
      toast(e?.message || '重启失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="grid c2">
        <Card title="💾 配置备份">
          <div className="muted" style={{ lineHeight: 1.9 }}>
            备份包含所有配置文件（网络 / 防火墙 / 无线 / 个性化等），<br />
            可用于设备迁移或灾难恢复。
          </div>
          <button className="btn primary mt16" disabled={busy} onClick={doBackup}>
            {busy ? '生成中…' : '⬇ 下载配置备份'}
          </button>
        </Card>

        <Card title="📤 恢复配置">
          <div className="muted" style={{ lineHeight: 1.9 }}>
            从备份文件恢复配置。<br />
            <Badge kind="warn">注意</Badge> 恢复后设备将自动重启。
          </div>
          <button className="btn mt16" disabled={busy} onClick={() => restoreRef.current?.click()}>
            选择备份文件并恢复
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept=".tar.gz,.gz"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doRestore(f)
              e.target.value = ''
            }}
          />
        </Card>
      </div>

      <Card title="🔄 固件升级">
        <div className="muted" style={{ lineHeight: 1.9 }}>
          上传 <span className="mono">.img.gz</span> 固件镜像进行刷写升级。<br />
          <Badge kind="danger">警告</Badge> 刷写过程中请勿断电，设备将自动重启。<br />
          建议先下载配置备份，升级后可恢复。
        </div>
        <button className="btn primary mt16" disabled={busy} onClick={() => fwRef.current?.click()}>
          选择固件镜像
        </button>
        <input
          ref={fwRef}
          type="file"
          accept=".img.gz,.bin,.gz"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doUpgrade(f)
            e.target.value = ''
          }}
        />
      </Card>

      <Card title="⚡ 重启设备">
        <div className="muted" style={{ lineHeight: 1.9 }}>
          重启将短暂中断网络连接（约 1-2 分钟）。
        </div>
        <button className="btn danger mt16" disabled={busy} onClick={doReboot}>
          立即重启
        </button>
      </Card>
    </div>
  )
}
