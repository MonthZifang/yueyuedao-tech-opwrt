// 统一 API 客户端 (/cgi-bin/yueyue)
import { getSid, clearSession } from './ubus'
import type {
  Sysinfo, TrafficData, Flow, PerfSample, Personalization,
  TopologyData, ProcessRow, ServiceRow, WifiAp,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T = any>(
  action: string,
  opts: { params?: Record<string, string | number | undefined>; body?: unknown; raw?: BodyInit; method?: string } = {},
): Promise<T> {
  const qs = new URLSearchParams({ action })
  const sid = getSid()
  if (sid) qs.set('auth', sid)
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  const init: RequestInit = { method: opts.method || (opts.body || opts.raw ? 'POST' : 'GET') }
  if (opts.raw) {
    init.body = opts.raw
  } else if (opts.body) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  }
  const res = await fetch(`/cgi-bin/yueyue?${qs}`, init)
  if (res.status === 401) {
    clearSession()
    throw new ApiError(401, '登录已过期，请重新登录')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.msg || `请求失败 (${res.status})`)
  }
  return data as T
}

export const api = {
  // 基础
  publicInfo: () => call('public_info'),
  sysinfo: () => call<Sysinfo & { ok: boolean }>('sysinfo'),

  // 流量
  traffic: (month?: string) => call<TrafficData & { ok: boolean }>('traffic', { params: { month } }),
  flows: (ip?: string, limit = 200) =>
    call<{ flows: Flow[]; count: number; hosts: Record<string, string> }>('flows', { params: { ip, limit } }),

  // 性能历史  sample: [t, cpu%, mem%, load1, conn, rx_bps, tx_bps]
  perf: (limit = 2880) => call<{ samples: PerfSample[]; interval: number }>('perf', { params: { limit } }),

  // 路由可视化
  topology: () => call<TopologyData & { ok: boolean }>('topology'),
  routeSave: (route: unknown) => call<{ ok: boolean; id: string }>('route_save', { body: { route } }),
  routeDelete: (id: string) => call<{ ok: boolean }>('route_delete', { body: { id } }),
  layoutSave: (layout: unknown) => call<{ ok: boolean }>('layout_save', { body: { layout } }),
  applyRoutes: () => call<{ ok: boolean }>('apply'),

  // 向导
  wizardStatus: () =>
    call<{
      done: boolean; hostname: string; lan_ip: string; wan_proto: string; uplink: boolean;
      version: string; main_router?: boolean; mode?: string; allow_lan?: boolean;
      nets?: any[] | false; aps?: any[] | false; main?: any; guest?: any;
    }>('wizard_status'),
  wizardScan: () => call<{ aps: WifiAp[]; devices: string[] }>('wizard_scan'),
  wizardUplink: (params: Record<string, unknown>) =>
    call<{ ok: boolean; msg?: string }>('wizard_uplink', { body: params }),
  wizardMode: (params: Record<string, unknown>) =>
    call<{ ok: boolean; msg?: string }>('wizard_mode', { body: params }),
  wizardWifi: (params: Record<string, unknown>) =>
    call<{ ok: boolean; msg?: string }>('wizard_wifi', { body: params }),
  wizardPassword: (password: string) => call<{ ok: boolean }>('wizard_password', { body: { password } }),
  wizardFinish: () => call<{ ok: boolean }>('wizard_finish'),

  // 个性化
  personalization: () => call<{ personalization: Personalization }>('personalization'),
  personalizationSet: (p: Partial<Personalization>) =>
    call<{ personalization: Personalization }>('personalization', { body: p, method: 'POST' }),
  bgUpload: async (file: File) => {
    const buf = await file.arrayBuffer()
    return call<{ personalization: Personalization; file: string }>('bg_upload', { raw: buf })
  },
  bgReset: () => call<{ personalization: Personalization }>('bg_reset'),

  // 诊断 / 日志 / 进程 / 服务
  diag: (type: string, target: string) => call<{ output: string }>('diag', { params: { type, target } }),
  dhcpLeases: () => call<{ leases: { mac: string; ip: string; hostname: string; expires: number }[] }>('dhcp_leases'),
  log: (lines = 200, filter?: string) => call<{ output: string }>('log', { params: { lines, filter } }),
  processes: () => call<{ processes: ProcessRow[] }>('processes'),
  services: () => call<{ services: ServiceRow[] }>('services', { params: { op: 'list' } }),
  serviceOp: (op: string, name: string) => call<{ ok: boolean }>('services', { params: { op, name } }),

  // 软件包
  opkgList: () => call<{ packages: { name: string; version: string }[] }>('opkg', { params: { op: 'installed' } }),
  opkgSearch: (keyword: string) =>
    call<{ packages: { name: string; version: string }[] }>('opkg', { params: { op: 'search', keyword } }),
  opkgInstall: (pkg: string) => call<{ output: string }>('opkg', { params: { op: 'install', pkg } }),
  opkgRemove: (pkg: string) => call<{ output: string }>('opkg', { params: { op: 'remove', pkg } }),
  opkgUpdate: () => call<{ output: string }>('opkg', { params: { op: 'update' } }),

  // 备份 / 升级 / 重启 / 密码
  backup: () => call<{ filename: string; data: string }>('backup'),
  restore: async (file: File) =>
    call<{ ok: boolean; msg: string }>('restore', { raw: await file.arrayBuffer() }),
  upgrade: async (file: File) =>
    call<{ ok: boolean; msg: string }>('upgrade', { raw: await file.arrayBuffer() }),
  reboot: () => call<{ ok: boolean; msg: string }>('reboot'),
  password: (password: string) => call<{ ok: boolean }>('password', { body: { password } }),
}
