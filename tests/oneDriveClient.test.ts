import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MSAL mock：工厂内不能引用外部 let 变量，用 vi.hoisted 共享 vi.fn 句柄
const h = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  getAllAccounts: vi.fn<() => unknown[]>(),
  acquireTokenSilent: vi.fn<(req: unknown) => Promise<{ accessToken: string }>>(),
  acquireTokenPopup: vi.fn<(req: unknown) => Promise<{ accessToken: string }>>(),
  loginPopup: vi.fn<(req: unknown) => Promise<unknown>>(),
  logoutPopup: vi.fn<(req?: unknown) => Promise<void>>(),
}))

// 配置路径测试：clientId 视为已配置；未配置测试（最后一个 describe）用 doUnmock 还原真实 syncConfig
vi.mock('../src/business/syncConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/business/syncConfig')>()
  return { ...actual, MSAL_CLIENT_ID: 'test-client-id' }
})

vi.mock('@azure/msal-browser', () => {
  class InteractionRequiredAuthError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'InteractionRequiredAuthError'
    }
  }
  class PublicClientApplication {
    initialize = h.initialize
    getAllAccounts = h.getAllAccounts
    acquireTokenSilent = h.acquireTokenSilent
    acquireTokenPopup = h.acquireTokenPopup
    loginPopup = h.loginPopup
    logoutPopup = h.logoutPopup
  }
  return { PublicClientApplication, InteractionRequiredAuthError }
})

const FILE_URL = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/wordexamrush.json:/content'
const APPROOT_URL = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

const ACCOUNT = { homeAccountId: 'home', localAccountId: 'local', username: 'tester' }
const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>()

/** 构造 MSAL 交互类错误（name 与真实 InteractionRequiredAuthError 一致） */
function interactionError(): Error {
  const err = new Error('Interaction required')
  err.name = 'InteractionRequiredAuthError'
  return err
}

async function loadClient() {
  return await import('../src/business/oneDriveClient')
}

beforeEach(async () => {
  // 单例缓存跨测试必须清空（MSAL 实例持有内部状态，无法复用）
  const client = await loadClient()
  client._resetMsalForTests()
  h.initialize.mockResolvedValue(undefined)
  h.getAllAccounts.mockReturnValue([ACCOUNT])
  h.acquireTokenSilent.mockResolvedValue({ accessToken: 'tok-silent' })
  h.acquireTokenPopup.mockResolvedValue({ accessToken: 'tok-popup' })
  h.loginPopup.mockResolvedValue({})
  h.logoutPopup.mockResolvedValue(undefined)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getToken', () => {
  it('静默失败（interaction_required）后回退弹窗并成功', async () => {
    h.acquireTokenSilent.mockRejectedValue(interactionError())
    const client = await loadClient()
    await expect(client.getToken()).resolves.toBe('tok-popup')
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(1)
    expect(h.acquireTokenPopup).toHaveBeenCalledTimes(1)
  })

  it('silentOnly 时交互错误立即抛 auth，绝不弹窗', async () => {
    h.acquireTokenSilent.mockRejectedValue(interactionError())
    const client = await loadClient()
    await expect(client.getToken({ silentOnly: true })).rejects.toMatchObject({ code: 'auth' })
    expect(h.acquireTokenPopup).not.toHaveBeenCalled()
    expect(h.loginPopup).not.toHaveBeenCalled()
  })

  it('无账号或 login_required 同样走弹窗回退', async () => {
    h.getAllAccounts.mockReturnValue([])
    const err = new Error('login_required')
    err.name = 'ServerError'
    h.acquireTokenSilent.mockRejectedValue(err)
    const client = await loadClient()
    await expect(client.getToken()).resolves.toBe('tok-popup')
  })
})

describe('fetchSyncFile', () => {
  it('404 返回 null', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }))
    const client = await loadClient()
    await expect(client.fetchSyncFile()).resolves.toBeNull()
  })

  it('带 Bearer 头请求 approot 文件 URL；401 抛 http', async () => {
    fetchMock.mockResolvedValue(new Response('denied', { status: 401 }))
    const client = await loadClient()
    await expect(client.fetchSyncFile()).rejects.toMatchObject({ code: 'http' })
    expect(fetchMock.mock.calls[0][0]).toBe(FILE_URL)
    const init = fetchMock.mock.calls[0][1]!
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-silent')
  })

  it('网络 TypeError 归一为 network 错误（而非裸 TypeError）', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    const client = await loadClient()
    await expect(client.fetchSyncFile()).rejects.toMatchObject({ code: 'network' })
  })
})

describe('putSyncFile', () => {
  it('首次 PUT 404 → GET approot 建目录 → 重试 PUT 成功', async () => {
    let puts = 0
    fetchMock.mockImplementation(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts++
        return new Response('', { status: puts === 1 ? 404 : 200 })
      }
      return new Response('{}', { status: 200 })
    })
    const client = await loadClient()
    await expect(client.putSyncFile('{"k":1}')).resolves.toBeUndefined()

    const methods = fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')
    expect(methods).toEqual(['PUT', 'GET', 'PUT'])
    const [firstPut, getApproot, secondPut] = fetchMock.mock.invocationCallOrder
    expect(firstPut).toBeLessThan(getApproot)
    expect(getApproot).toBeLessThan(secondPut)

    expect(fetchMock.mock.calls[1][0]).toBe(APPROOT_URL)
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"k":1}')
    expect(fetchMock.mock.calls[2][1]?.body).toBe('{"k":1}')
  })

  it('重试仍失败抛 http', async () => {
    let puts = 0
    fetchMock.mockImplementation(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('', { status: ++puts === 1 ? 404 : 500 })
      return new Response('{}', { status: 200 })
    })
    const client = await loadClient()
    await expect(client.putSyncFile('x')).rejects.toMatchObject({ code: 'http' })
    expect(fetchMock.mock.calls).toHaveLength(3)
  })

  it('普通非 2xx 抛 http；显式传入 bearerToken 时不走 getToken', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }))
    const client = await loadClient()
    await expect(client.putSyncFile('x', 'explicit-token')).rejects.toMatchObject({ code: 'http' })
    expect(h.acquireTokenSilent).not.toHaveBeenCalled()
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer explicit-token')
  })

  it('网络 TypeError 抛 network', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    const client = await loadClient()
    await expect(client.putSyncFile('x')).rejects.toMatchObject({ code: 'network' })
  })
})

describe('signIn / signOut', () => {
  it('signIn 调用 loginPopup 并携带配置的 scopes', async () => {
    const client = await loadClient()
    expect(client.isConfigured()).toBe(true)
    await client.signIn()
    expect(h.loginPopup).toHaveBeenCalledWith({ scopes: ['Files.ReadWrite.AppFolder', 'User.Read'] })
  })

  it('弹窗被拦截映射为 auth 错误，提示允许弹窗后重试', async () => {
    const err = new Error('Popup window closed')
    err.name = 'popup_window_error'
    h.loginPopup.mockRejectedValue(err)
    const client = await loadClient()
    const caught = await client.signIn().catch(e => e)
    expect(caught).toBeInstanceOf(client.SyncError)
    expect(caught.code).toBe('auth')
    expect(caught.message).toContain('允许弹窗')
  })

  it('signOut 调用 logoutPopup', async () => {
    const client = await loadClient()
    await client.signOut()
    expect(h.logoutPopup).toHaveBeenCalledTimes(1)
  })
})

// 放在最后：doUnmock 会影响本文件后续的模块解析
describe('未配置（真实 syncConfig：clientId 为空）', () => {
  it('每个入口都抛 not-configured，且不触发 MSAL', async () => {
    vi.doUnmock('../src/business/syncConfig')
    vi.resetModules()
    const client = await import('../src/business/oneDriveClient')

    expect(client.isConfigured()).toBe(false)
    await expect(client.getMsal()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.signIn()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.signOut()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.getToken()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.getToken({ silentOnly: true })).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.fetchSyncFile()).rejects.toMatchObject({ code: 'not-configured' })
    await expect(client.putSyncFile('{}')).rejects.toMatchObject({ code: 'not-configured' })
    expect(h.getAllAccounts).not.toHaveBeenCalled()
  })
})
