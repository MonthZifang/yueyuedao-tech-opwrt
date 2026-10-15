// ubus JSON-RPC 客户端 (uhttpd-mod-ubus)
const SID_KEY = 'yy_sid'

let sid = localStorage.getItem(SID_KEY) || ''

export function getSid(): string {
  return sid
}

export function isAuthed(): boolean {
  return sid.length > 0
}

export function clearSession() {
  sid = ''
  localStorage.removeItem(SID_KEY)
  document.cookie = 'ubus_rpc_session=; path=/; max-age=0'
}

function saveSession(s: string) {
  sid = s
  localStorage.setItem(SID_KEY, s)
  // 同步 cookie，便于同源静态资源/CGI 共享会话
  document.cookie = `ubus_rpc_session=${s}; path=/; max-age=${7 * 24 * 3600}`
}

export class UbusError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

async function rpc(method: string, params: unknown[]): Promise<[number, any]> {
  const res = await fetch('/ubus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new UbusError(res.status, `ubus HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new UbusError(data.error.code || -1, data.error.message || 'rpc error')
  return data.result
}

export async function ubusCall<T = any>(object: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const [code, result] = await rpc('call', [sid || '00000000000000000000000000000000', object, method, params])
  if (code !== 0) {
    if (code === 6 || code === 5) clearSession()
    throw new UbusError(code, `ubus ${object}.${method} 失败 (code ${code})`)
  }
  return result as T
}

export async function login(username: string, password: string): Promise<string> {
  const [code, result] = await rpc('call', [
    '00000000000000000000000000000000',
    'session',
    'login',
    { username, password },
  ])
  if (code !== 0 || !result?.ubus_rpc_session) {
    throw new UbusError(code, '用户名或密码错误')
  }
  saveSession(result.ubus_rpc_session)
  return result.ubus_rpc_session
}

export async function logout() {
  try {
    if (sid) await ubusCall('session', 'destroy', { ubus_rpc_session: sid })
  } catch {
    /* ignore */
  }
  clearSession()
}

export async function sessionInfo() {
  return ubusCall<any>('session', 'get', { ubus_rpc_session: sid })
}
