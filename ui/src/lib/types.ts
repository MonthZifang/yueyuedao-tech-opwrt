// 共享类型定义
export interface Sysinfo {
  cpu: { user: number; nice: number; system: number; idle: number; iowait: number; irq: number; softirq: number; total: number }
  mem: Record<string, number>
  load: number[]
  uptime: number
  net: Record<string, { rx: number; tx: number }>
  ifaces: IfaceInfo[]
  disk: { used: number; free: number; total: number; pct: number } | null
  conn: number
  version: string
  hostname: string
  time: number
}

export interface IfaceInfo {
  name: string
  up: boolean
  proto: string
  device: string
  ipaddr: string | null
  uptime?: number
  gateway?: string | null
  netmask?: string | null
}

export interface TrafficDest {
  dst: string
  port: number
  proto: string
  bytes: number
  first: number
  last: number
}

export interface TrafficIp {
  ip: string
  up: number
  down: number
  total: number
  first: number
  last: number
  dests: TrafficDest[]
}

export interface TrafficData {
  month: string
  totals: { up: number; down: number }
  months: { ym: string; up: number; down: number }[]
  ips: TrafficIp[]
  hosts: Record<string, string>
}

export interface Flow {
  proto: string
  state: string
  src: string
  sport: number
  dst: string
  dport: number
  bytes_up: number
  bytes_down: number
  assured: boolean
}

// perf sample: [t, cpu%, mem%, load1, conn, rx_bps, tx_bps]
export type PerfSample = [number, number, number, number, number, number, number]

export interface Personalization {
  bg_mode: string
  bg_file: string
  bg_url?: string
  overlay: number
  blur: number
  accent: string
  theme: string
  radius: number
}

export interface RouteItem {
  id: string
  target: string
  gateway: string
  iface: string
  metric: number
  enabled: boolean
  source: string
  table: string
}

export interface TopologyData {
  ifaces: IfaceInfo[]
  routes: RouteItem[]
  layout: Record<string, unknown>
  pending: boolean
}

export interface ProcessRow {
  pid: number
  user: string
  stat: string
  vsz: number
  mem_pct: number
  cpu_pct: number
  cmd: string
}

export interface ServiceRow {
  name: string
  running: boolean
  enabled: boolean
}

export interface WifiAp {
  ssid: string
  bssid: string
  channel: number
  signal: number
  quality: number
  encryption: string
  device: string
}
