import { MSAL_CLIENT_ID, MSAL_SCOPES, SYNC_FILE_NAME } from './syncConfig'

/** 云同步统一错误：code 用于 UI 分流，message 面向用户（中文） */
export class SyncError extends Error {
  readonly code: 'not-configured' | 'auth' | 'network' | 'http'

  constructor(code: SyncError['code'], message: string) {
    super(message)
    this.code = code
  }
}

type MsalInstance = {
  initialize: () => Promise<void>
  getAllAccounts: () => { homeAccountId?: string; localAccountId: string; username?: string }[]
  acquireTokenSilent: (req: { scopes: string[]; account: unknown }) => Promise<{ accessToken: string }>
  acquireTokenPopup: (req: { scopes: string[] }) => Promise<{ accessToken: string }>
  loginPopup: (req: { scopes: string[] }) => Promise<unknown>
  logoutPopup: (req?: unknown) => Promise<void>
}

// 模块级缓存的是 promise（而非实例），并发调用共享同一次初始化
let msalPromise: Promise<MsalInstance> | null = null

/** 判断 MSAL 错误是否需要交互（弹窗登录） */
function isInteractionRequired(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? ''
  return name.includes('InteractionRequired') || name === 'interaction_required' || message.includes('interaction_required') || message.includes('login_required')
}

function errText(err: unknown): string {
  return `${(err as { name?: string })?.name ?? ''} ${(err as { message?: string })?.message ?? ''}`
}

/** 懒加载 MSAL 单例：首次调用时动态 import 并 initialize，之后共享同一 promise */
export async function getMsal(): Promise<MsalInstance> {
  if (!isConfigured()) throw new SyncError('not-configured', '云同步未配置：缺少 Azure 应用 Client ID')
  if (!msalPromise) {
    msalPromise = (async () => {
      const mod = await import('@azure/msal-browser')
      const instance = new mod.PublicClientApplication({
        auth: {
          clientId: MSAL_CLIENT_ID,
          authority: 'https://login.microsoftonline.com/consumers',
          redirectUri: location.origin + '/',
        },
        cache: { cacheLocation: 'sessionStorage' },
      })
      // MSAL v3+ 必须先 initialize 才能调用 getAllAccounts/acquireTokenSilent
      await instance.initialize()
      return instance as unknown as MsalInstance
    })()
  }
  return msalPromise
}

/** 测试专用：清空单例缓存（MSAL 实例无法跨测试复用） */
export function _resetMsalForTests(): void {
  msalPromise = null
}

export function isConfigured(): boolean {
  return MSAL_CLIENT_ID.length > 0
}

/** 弹窗登录 */
export async function signIn(): Promise<void> {
  const msal = await getMsal()
  try {
    await msal.loginPopup({ scopes: MSAL_SCOPES })
  } catch (err) {
    // 弹窗被浏览器拦截时给出可操作的提示
    const text = errText(err)
    if (text.includes('popup_window_error') || (text.includes('ServerError') && text.includes('popup'))) {
      throw new SyncError('auth', '弹窗被浏览器拦截，请允许弹窗后重试')
    }
    throw new SyncError('auth', '登录失败：' + text.trim())
  }
}

/** 弹窗登出 */
export async function signOut(): Promise<void> {
  const msal = await getMsal()
  try {
    await msal.logoutPopup()
  } catch (err) {
    throw new SyncError('auth', '登出失败：' + errText(err).trim())
  }
}

/**
 * 获取 Graph 访问令牌。默认静默失败后回退弹窗；
 * opts.silentOnly = true 时静默失败直接抛错，绝不弹窗（用于后台自动同步）。
 */
export async function getToken(opts?: { silentOnly?: boolean }): Promise<string> {
  const msal = await getMsal()
  const account = msal.getAllAccounts()[0]
  try {
    const res = await msal.acquireTokenSilent({ scopes: MSAL_SCOPES, account })
    return res.accessToken
  } catch (err) {
    // 无账号或需要交互都归入此类
    if (!account || isInteractionRequired(err)) {
      if (opts?.silentOnly) throw new SyncError('auth', '尚未登录或登录已过期')
      const res = await msal.acquireTokenPopup({ scopes: MSAL_SCOPES })
      return res.accessToken
    }
    throw new SyncError('auth', '获取令牌失败：' + errText(err).trim())
  }
}

function fileUrl(): string {
  return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}:/content`
}

async function graphFetch(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    // fetch 网络失败表现为 TypeError
    if (err instanceof TypeError) throw new SyncError('network', '网络错误，请检查网络连接')
    throw err
  }
  return res
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) throw new SyncError('http', `${action}失败：HTTP ${res.status}`)
}

/** 读取 approot 同步文件内容；404（云端还没有文件）返回 null */
export async function fetchSyncFile(): Promise<string | null> {
  const token = await getToken({ silentOnly: true })
  const res = await graphFetch(fileUrl(), { headers: { Authorization: 'Bearer ' + token } })
  if (res.status === 404) return null
  await assertOk(res, '读取云端进度')
  return res.text()
}

/** 上传文本到 approot 同步文件；首次使用时 approot 可能不存在，404 后建目录重试一次 */
export async function putSyncFile(
  text: string,
  bearerToken?: string,
  opts?: { keepalive?: boolean }
): Promise<void> {
  const token = bearerToken ?? (await getToken({ silentOnly: true }))
  const doPut = () =>
    graphFetch(fileUrl(), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: text,
      keepalive: opts?.keepalive,
    })

  let res = await doPut()
  if (res.status === 404) {
    // GET approot 会触发 OneDrive 创建应用专用文件夹，然后重试一次
    const probe = await graphFetch('https://graph.microsoft.com/v1.0/me/drive/special/approot', {
      headers: { Authorization: 'Bearer ' + token },
    })
    await assertOk(probe, '创建云端文件夹')
    res = await doPut()
    await assertOk(res, '上传云端进度')
    return
  }
  await assertOk(res, '上传云端进度')
}
