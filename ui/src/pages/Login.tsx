import React, { useEffect, useState } from 'react'
import { login } from '../lib/ubus'
import { api } from '../lib/api'
import { useToast } from '../components/ui'
import { useNavigate } from 'react-router-dom'

export default function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [info, setInfo] = useState<{ hostname: string; version: string; wizard_done: boolean } | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    api.publicInfo().then(setInfo).catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    try {
      await login(username, password)
      toast('登录成功，欢迎回来', 'ok')
      onDone()
      if (info && !info.wizard_done) {
        navigate('/wizard')
      } else {
        navigate('/')
      }
    } catch (err: any) {
      toast(err?.message || '登录失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <img className="logo" src="/luci-static/yueyue/assets/logo.png" alt="logo" />
        <h1>月月岛科技</h1>
        <div className="sub">YUEYUEDAO TECH · 企业路由控制台</div>

        <label className="field">
          <span className="lab">用户名</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="root"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span className="lab">密码</span>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入管理密码"
              autoComplete="current-password"
              autoFocus
              style={{ paddingRight: 46 }}
            />
            <span
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                cursor: 'pointer', fontSize: 14, opacity: 0.65, userSelect: 'none',
              }}
              title={showPw ? '隐藏密码' : '显示密码'}
            >
              {showPw ? '🙈' : '👁️'}
            </span>
          </div>
        </label>
        <button className="btn primary" style={{ width: '100%', padding: '11px 16px' }} disabled={busy}>
          {busy ? '登录中…' : '登 录'}
        </button>

        <div className="foot">
          <span>{info?.hostname ?? '月月岛科技'}</span>
          <span>·</span>
          <span className="mono">{info?.version ?? 'OpenWrt'}</span>
        </div>
      </form>
    </div>
  )
}
