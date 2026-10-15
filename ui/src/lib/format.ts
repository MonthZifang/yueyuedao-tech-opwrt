// 格式化工具
export function fmtBytes(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || isNaN(n)) return '0 B'
  const neg = n < 0
  let v = Math.abs(n)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const s = i === 0 ? String(Math.round(v)) : v.toFixed(digits)
  return (neg ? '-' : '') + s + ' ' + units[i]
}

export function fmtRate(bps: number | undefined | null): string {
  return fmtBytes(bps, 1) + '/s'
}

export function fmtUptime(sec: number | undefined | null): string {
  if (!sec || sec < 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}天 ${h}小时`
  if (h > 0) return `${h}小时 ${m}分`
  return `${m}分 ${Math.floor(sec % 60)}秒`
}

export function fmtTime(ts: number | undefined | null): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtTimeShort(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m, 10)}月`
}

export function pct(a: number, b: number): number {
  if (!b) return 0
  return Math.min(100, Math.max(0, Math.round((a / b) * 100)))
}
