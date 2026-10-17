import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/* ---------------- Toast ---------------- */
type ToastItem = { id: number; text: string; kind: 'ok' | 'err' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(1)
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = idRef.current++
    setItems((s) => [...s, { id, text, kind }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/* ---------------- 基础组件 ---------------- */
export function Card({ title, right, children, style, className }: {
  title?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div className={`card ${className || ''}`} style={style}>
      {title && (
        <div className="card-title">
          {title}
          <span className="spacer" />
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({ label, value, unit, sub }: {
  label: string
  value: React.ReactNode
  unit?: string
  sub?: React.ReactNode
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Badge({ kind = 'mute', children }: {
  kind?: 'ok' | 'warn' | 'danger' | 'mute'
  children: React.ReactNode
}) {
  return <span className={`badge ${kind}`}>{children}</span>
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/* ---------------- 线性图标（无 emoji；currentColor 描边） ---------------- */
const ICON_PATHS: Record<string, React.ReactNode> = {
  route: (
    <>
      <circle cx="5" cy="6" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M6.6 7.7 10.4 16M17.4 7.7 13.6 16M7.2 6h9.6" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  gauge: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.3 18a9 9 0 1 1 17.4 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-6M4 11V3M12 21v-8M12 9V3M20 21v-4M20 13V3" />
      <path d="M1 15h6M9 9h6M17 17h6" />
    </>
  ),
}

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name] ?? null}
    </svg>
  )
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </div>
  )
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="center muted" style={{ padding: 40 }}>
      <div className="skeleton" style={{ height: 10, width: 140, margin: '0 auto 14px' }} />
      <div className="small">{text}</div>
    </div>
  )
}

export function Empty({ text = '暂无数据', icon = '' }: { text?: string; icon?: string }) {
  return (
    <div className="center muted" style={{ padding: 34 }}>
      {icon && <div style={{ fontSize: 30, opacity: 0.5, marginBottom: 8 }}>{icon}</div>}
      <div className="small">{text}</div>
    </div>
  )
}

/* ---------------- 骨架屏 ---------------- */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

/* ---------------- 分段选择器 ---------------- */
export function Seg<T extends string>({ value, options, onChange, style }: {
  value: T
  options: { value: T; label: React.ReactNode }[]
  onChange: (v: T) => void
  style?: React.CSSProperties
}) {
  return (
    <div className="seg" style={style}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg-item ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children }: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="lab">{label}</span>
      {children}
    </label>
  )
}

/* ---------------- 折线图 (SVG) ---------------- */
export interface Series {
  data: number[]
  color?: string
  fill?: boolean
}

/* 测量容器实际像素宽度：图表 1:1 渲染，避免 viewBox 非等比拉伸导致线条/文字扭曲 */
function useMeasure<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  const [w, setW] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setW(el.clientWidth || 0)
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return { ref, w }
}

function niceCeil(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * base
}

export function LineChart({ series, labels, height = 160, unit = '', max }: {
  series: Series[]
  labels?: string[]
  height?: number
  unit?: string
  max?: number
}) {
  const gid = React.useId().replace(/:/g, '')
  const { ref, w } = useMeasure<HTMLDivElement>()
  const width = Math.max(280, Math.round(w) || 640)
  const pad = { l: 42, r: 10, t: 10, b: 20 }
  const all = series.flatMap((s) => s.data).filter((v) => isFinite(v))
  const dataMax = max ?? niceCeil(Math.max(1, ...all))
  const n = Math.max(...series.map((s) => s.data.length), 1)
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => pad.t + ih - (Math.min(v, dataMax) / dataMax) * ih

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const fmtTick = (v: number) =>
    dataMax >= 100 ? String(Math.round(v)) : v.toFixed(v % 1 === 0 ? 0 : v < 10 ? 1 : 0)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`${gid}-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color ?? 'var(--yy-accent)'} stopOpacity={0.28} />
            <stop offset="100%" stopColor={s.color ?? 'var(--yy-accent)'} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      {gridLines.map((g) => (
        <g key={g}>
          <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} />
          <text x={4} y={pad.t + ih * g + 3}>
            {fmtTick((1 - g) * dataMax)}{unit}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
        const color = s.color ?? 'var(--yy-accent)'
        return (
          <g key={si}>
            {s.fill && s.data.length > 1 && (
              <polygon
                points={`${pad.l},${pad.t + ih} ${pts} ${x(s.data.length - 1)},${pad.t + ih}`}
                fill={`url(#${gid}-${si})`}
              />
            )}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="miter" strokeLinecap="butt" />
          </g>
        )
      })}
      {labels && labels.length > 0 && (
        <g>
          <text x={pad.l} y={height - 4}>{labels[0]}</text>
          <text x={width - pad.r} y={height - 4} textAnchor="end">{labels[labels.length - 1]}</text>
        </g>
      )}
      </svg>
    </div>
  )
}

/* ---------------- 图例 ---------------- */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <i className="legend-dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/* ---------------- 轮询 Hook ---------------- */
export function useInterval(fn: () => void, ms: number | null) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    if (ms === null) return
    // 后台标签页暂停轮询，回到前台立即补一拍
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      saved.current()
    }
    const t = setInterval(tick, ms)
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) saved.current()
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms])
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    setLoading(true)
    fn()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    reload()
  }, [reload])
  return { data, loading, error, reload, setData }
}
