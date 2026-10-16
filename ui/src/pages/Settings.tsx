import React, { useEffect, useRef, useState } from 'react'
import { Card, Field, useToast, Badge, Seg } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../App'
import type { Personalization } from '../lib/types'
import { ubusCall } from '../lib/ubus'

const PRESETS = [
  { name: '插画（默认）', url: '/luci-static/yueyue/assets/bg.jpg', mode: 'builtin' },
  { name: '深青渐变', url: '', mode: 'gradient' },
]

const ACCENTS = ['#7fe7d2', '#8ab4ff', '#ffb86b', '#ff7b9c', '#c792ea', '#a6e22e']

export default function Settings() {
  const { personalization, setPersonalization } = useApp()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pers, setPers] = useState<Personalization | null>(personalization)
  const [busy, setBusy] = useState(false)

  // 系统设置
  const [hostname, setHostname] = useState('')
  const [tz, setTz] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  useEffect(() => {
    if (personalization && !pers) setPers(personalization)
  }, [personalization, pers])

  useEffect(() => {
    ubusCall('uci', 'get', { config: 'system', section: '@system[0]' }).then((d) => {
      setHostname(d.values?.hostname || '')
      setTz(d.values?.zonename || 'Asia/Shanghai')
    }).catch(() => {})
  }, [])

  const update = (patch: Partial<Personalization>, live = true) => {
    if (!pers) return
    const next = { ...pers, ...patch }
    setPers(next)
    if (live) setPersonalization(next)
  }

  const savePers = async () => {
    if (!pers) return
    setBusy(true)
    try {
      const d = await api.personalizationSet({
        bg_mode: pers.bg_mode,
        overlay: pers.overlay,
        blur: pers.blur,
        accent: pers.accent,
        theme: pers.theme,
        radius: pers.radius,
      })
      setPersonalization(d.personalization)
      setPers(d.personalization)
      toast('个性化设置已保存', 'ok')
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const uploadBg = async (file: File) => {
    setBusy(true)
    try {
      const d = await api.bgUpload(file)
      setPersonalization(d.personalization)
      setPers(d.personalization)
      toast('背景图已上传并应用', 'ok')
    } catch (e: any) {
      toast(e?.message || '上传失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const resetBg = async () => {
    setBusy(true)
    try {
      const d = await api.bgReset()
      setPersonalization(d.personalization)
      setPers(d.personalization)
      toast('已恢复默认背景', 'ok')
    } catch (e: any) {
      toast(e?.message || '操作失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const saveSystem = async () => {
    setBusy(true)
    try {
      await ubusCall('uci', 'set', {
        config: 'system', section: '@system[0]', values: { hostname, zonename: tz, timezone: 'CST-8' },
      })
      await ubusCall('uci', 'commit', { config: 'system' })
      toast('系统设置已保存', 'ok')
    } catch (e: any) {
      toast(e?.message || '保存失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  const changePw = async () => {
    if (pw1.length < 4) return toast('密码至少 4 位', 'err')
    if (pw1 !== pw2) return toast('两次输入的密码不一致', 'err')
    setBusy(true)
    try {
      await api.password(pw1)
      toast('密码修改成功', 'ok')
      setPw1('')
      setPw2('')
    } catch (e: any) {
      toast(e?.message || '修改失败', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* 个性化 */}
      <Card
        title="个性化（背景 / 主题 / 配色）"
        right={<button className="btn primary small" disabled={busy} onClick={savePers}>保存设置</button>}
      >
        <div className="grid c2">
          <div>
            <div className="card-title">背景图</div>
            <div className="row wrap" style={{ gap: 10 }}>
              {PRESETS.map((p) => (
                <div
                  key={p.name}
                  className="card"
                  style={{
                    width: 130, padding: 8, cursor: 'pointer',
                    borderColor: pers?.bg_mode === p.mode ? 'var(--yy-accent)' : 'var(--glass-border)',
                  }}
                  onClick={() => update({ bg_mode: p.mode, bg_url: p.url || pers?.bg_url })}
                >
                  <div
                    style={{
                      height: 56, borderRadius: 10,
                      background: p.mode === 'gradient'
                        ? 'linear-gradient(135deg,#0f2027,#2c5364)'
                        : `url('/luci-static/yueyue/assets/bg.jpg') center/cover`,
                    }}
                  />
                  <div className="small center mt8">{p.name}</div>
                </div>
              ))}
              <div
                className="card"
                style={{
                  width: 130, padding: 8, cursor: 'pointer',
                  borderColor: pers?.bg_mode === 'custom' ? 'var(--yy-accent)' : 'var(--glass-border)',
                }}
                onClick={() => fileRef.current?.click()}
              >
                <div
                  style={{
                    height: 56, borderRadius: 10,
                    background: pers?.bg_url && pers.bg_mode === 'custom'
                      ? `url('${pers.bg_url}') center/cover`
                      : 'var(--yy-accent-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}
                >
                  ＋
                </div>
                <div className="small center mt8">上传图片</div>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadBg(f)
                e.target.value = ''
              }}
            />
            <div className="row mt8">
              <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>上传新背景</button>
              {pers?.bg_mode === 'custom' && (
                <button className="btn small danger" disabled={busy} onClick={resetBg}>恢复默认</button>
              )}
              <span className="muted small">支持 JPG / PNG / WebP / GIF / SVG，≤ 8MB，全局所有页面生效</span>
            </div>
          </div>

          <div>
            <div className="card-title">外观参数</div>
            <Field label={`背景遮罩强度：${pers?.overlay ?? 60}%`}>
              <input
                type="range" min={0} max={95} value={pers?.overlay ?? 60}
                style={{ width: '100%' }}
                onChange={(e) => update({ overlay: Number(e.target.value) })}
              />
            </Field>
            <Field label={`背景模糊度：${pers?.blur ?? 14}px`}>
              <input
                type="range" min={0} max={30} value={pers?.blur ?? 14}
                style={{ width: '100%' }}
                onChange={(e) => update({ blur: Number(e.target.value) })}
              />
            </Field>
            <Field label={`卡片圆角：${pers?.radius ?? 18}px`}>
              <input
                type="range" min={0} max={28} value={pers?.radius ?? 18}
                style={{ width: '100%' }}
                onChange={(e) => update({ radius: Number(e.target.value) })}
              />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted small">主题色：</span>
              {ACCENTS.map((c) => (
                <div
                  key={c}
                  onClick={() => update({ accent: c })}
                  style={{
                    width: 26, height: 26, borderRadius: 8, background: c, cursor: 'pointer',
                    border: pers?.accent === c ? '2px solid #fff' : '2px solid transparent',
                  }}
                />
              ))}
              <input
                type="color"
                value={pers?.accent || '#7fe7d2'}
                onChange={(e) => update({ accent: e.target.value })}
                style={{ width: 30, height: 28, border: 'none', background: 'none' }}
              />
            </div>
            <div className="row mt16">
              <span className="muted small">界面主题</span>
              <span className="spacer" style={{ flex: 1 }} />
              <Seg
                value={(pers?.theme === 'light' ? 'light' : 'dark') as 'dark' | 'light'}
                options={[{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }]}
                onChange={(v) => update({ theme: v })}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 系统 */}
      <Card title="系统设置" right={<button className="btn primary small" disabled={busy} onClick={saveSystem}>保存</button>}>
        <div className="grid c2">
          <Field label="主机名">
            <input className="input" value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </Field>
          <Field label="时区">
            <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
              <option value="Asia/Shanghai">Asia/Shanghai (CST-8)</option>
              <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </div>
      </Card>

      {/* 密码 */}
      <Card title="管理与密码" right={<button className="btn primary small" disabled={busy} onClick={changePw}>修改密码</button>}>
        <div className="grid c2">
          <Field label="新密码">
            <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="至少 4 位" />
          </Field>
          <Field label="确认新密码">
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再输入一次" />
          </Field>
        </div>
        <div className="muted small">
          <Badge kind="warn">提示</Badge> 修改密码后其他已登录设备需要重新登录
        </div>
      </Card>
    </div>
  )
}
