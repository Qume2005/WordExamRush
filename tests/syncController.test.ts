import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 客户端模块整体 mock（工厂内不能引用外部 let 变量，用 vi.hoisted 共享句柄）。
// syncController 走 `await import('./oneDriveClient')` 动态导入——vi.mock 同样拦截动态导入。
const h = vi.hoisted(() => ({
  getMsal: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getToken: vi.fn(),
  fetchSyncFile: vi.fn(),
  putSyncFile: vi.fn(),
}))

vi.mock('../src/business/oneDriveClient', () => ({
  getMsal: h.getMsal,
  signIn: h.signIn,
  signOut: h.signOut,
  getToken: h.getToken,
  fetchSyncFile: h.fetchSyncFile,
  putSyncFile: h.putSyncFile,
}))

// 配置视为已配置（clientId 非空），未配置路径用例单独覆盖 MSAL_CLIENT_ID
vi.mock('../src/business/syncConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/business/syncConfig')>()
  return { ...actual, MSAL_CLIENT_ID: 'test-client-id' }
})

import {
  _resetStateForTests,
  flushSync,
  init,
  signIn,
  signOut,
  syncNow,
  syncState,
} from '../src/business/syncController'
import { MSAL_CLIENT_ID } from '../src/business/syncConfig'

const MSAL_HANDLE = {
  getAllAccounts: vi.fn<() => { username?: string }[]>(() => [{ username: 'user@test.local' }]),
}

/** v4 快照原样写入 localStorage（collectProgress 仅收 version===4）；
 *  progress 条目带 modes（合并引擎在 mode 内比较 WordProgress，输出形如 {wordId, modes}） */
function progressEntry(wordId: number, appearances: number, correctCount: number, history: boolean[]) {
  return {
    wordId,
    appearances,
    correctCount,
    history,
    modes: { m1: { wordId, appearances, correctCount, history } },
  }
}

function seedSnapshot(hash: string, progress: ReturnType<typeof progressEntry>[] = []) {
  localStorage.setItem(
    `word-exam-rush:${hash}`,
    JSON.stringify({ version: 4, words: [{ word: ['w'] }], progress: progress.map((p, i) => [i, p]) })
  )
}

/** 本地进度经同步写云的期望信封形状（快照键为 hash，无 fileMap） */
function expectedEnvelopeOf(bundle: { tombstones: string[]; snapshots: Record<string, string> }) {
  return {
    schemaVersion: 1,
    exportedAt: expect.any(String),
    tombstones: bundle.tombstones,
    snapshots: bundle.snapshots,
  }
}

beforeEach(() => {
  _resetStateForTests()
  vi.clearAllMocks()
  // 逐字段重置实现（restoreAllMocks 无法恢复 vi.fn 的创建时实现，避免跨用例串味）
  MSAL_HANDLE.getAllAccounts.mockImplementation(() => [{ username: 'user@test.local' }])
  h.getMsal.mockResolvedValue(MSAL_HANDLE)
  h.getToken.mockResolvedValue('tok-1')
  h.fetchSyncFile.mockResolvedValue(null)
  h.putSyncFile.mockResolvedValue(undefined)
  h.signIn.mockResolvedValue(undefined)
  h.signOut.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('init', () => {
  it('未配置 → status idle-not-configured，客户端函数零调用（不触发动态加载副作用）', async () => {
    vi.doMock('../src/business/syncConfig', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/business/syncConfig')>()
      return { ...actual, MSAL_CLIENT_ID: '' }
    })
    // doMock 只影响之后的模块解析：重置控制器模块缓存后重新导入
    vi.resetModules()
    const ctrl = await import('../src/business/syncController')
    await ctrl.init()

    expect(ctrl.syncState.status).toBe('idle-not-configured')
    expect(h.getMsal).not.toHaveBeenCalled()
    expect(h.getToken).not.toHaveBeenCalled()
    expect(h.fetchSyncFile).not.toHaveBeenCalled()
    expect(h.putSyncFile).not.toHaveBeenCalled()
  })

  it('已配置但无账号 → status idle-signed-out，零网络请求', async () => {
    MSAL_HANDLE.getAllAccounts.mockReturnValue([])
    await init()

    expect(syncState.status).toBe('idle-signed-out')
    expect(h.fetchSyncFile).not.toHaveBeenCalled()
    expect(h.putSyncFile).not.toHaveBeenCalled()
  })
})

describe('syncNow', () => {
  it("manual + remote null → putSyncFile 收到含 schemaVersion 1 与本地快照/墓碑的信封", async () => {
    seedSnapshot('hash-1', [progressEntry(0, 2, 1, [true, false])])
    localStorage.setItem('word-exam-rush:tombstones', JSON.stringify(['dead-hash']))

    await syncNow('manual')

    expect(h.putSyncFile).toHaveBeenCalledTimes(1)
    const [text] = h.putSyncFile.mock.calls[0]
    const envelope = JSON.parse(text)
    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.tombstones).toEqual(['dead-hash'])
    expect(Object.keys(envelope.snapshots)).toEqual(['hash-1'])
    expect(syncState.status).toBe('idle')
    expect(syncState.accountEmail).toBe('user@test.local')
  })

  it('远端 schemaVersion 999 → status schema-unsupported，绝不写云', async () => {
    seedSnapshot('hash-1')
    h.fetchSyncFile.mockResolvedValue(
      JSON.stringify({ schemaVersion: 999, tombstones: [], snapshots: {} })
    )

    await syncNow('manual')

    expect(syncState.status).toBe('schema-unsupported')
    expect(h.putSyncFile).not.toHaveBeenCalled()
  })

  it("syncNow('exit') 用 getToken({ silentOnly: true })，startup 同理（静默令牌，绝不弹窗）", async () => {
    seedSnapshot('hash-1')
    await syncNow('exit')
    expect(h.getToken).toHaveBeenCalledWith({ silentOnly: true })

    h.getToken.mockClear()
    await syncNow('startup')
    expect(h.getToken).toHaveBeenCalledWith({ silentOnly: true })
  })

  it('startup 静默失败（getToken 抛 auth）→ status idle-signed-out，未调用 popup 类方法，无未处理异常', async () => {
    h.getToken.mockRejectedValue({ code: 'auth', message: '尚未登录或登录已过期' })

    await expect(init()).resolves.toBeUndefined()

    expect(syncState.status).toBe('idle-signed-out')
    // 无弹窗路径可走：mock 模块未提供弹窗方法，若被调用测试会以属性不存在报错
  })

  it('auth 失败在 manual 触发下 → status error，lastMessage 含可重试文案', async () => {
    h.getToken.mockRejectedValue({ code: 'auth', message: '登录失败：测试' })

    await syncNow('manual')

    expect(syncState.status).toBe('error')
    expect(syncState.lastMessage).toContain('登录失败')
  })

  it('远端为合法信封 → 合并回写本地后推送合并结果（信封无 fileMap，按空对象参与合并）', async () => {
    seedSnapshot('hash-1', [progressEntry(0, 5, 5, [true])])
    h.fetchSyncFile.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        tombstones: [],
        snapshots: {
          'hash-1': JSON.stringify({
            version: 4,
            words: [{ word: ['w'] }],
            progress: [[0, progressEntry(0, 1, 0, [false])]],
          }),
        },
      })
    )

    await syncNow('manual')

    // 本地 appearances 5 胜 1：合并回写后本地快照被更新
    const saved = JSON.parse(localStorage.getItem('word-exam-rush:hash-1')!)
    expect(saved.progress[0][1].modes.m1.appearances).toBe(5)
    // 上传的信封含合并后快照
    const [text] = h.putSyncFile.mock.calls[0]
    const envelope = JSON.parse(text)
    expect(JSON.parse(envelope.snapshots['hash-1']).progress[0][1].modes.m1.appearances).toBe(5)
  })
})

describe('flushSync（visibilitychange hidden 兜底）', () => {
  it('有缓存令牌 → putSyncFile 以令牌为第二参数直传且 keepalive，getToken 不再被调用', async () => {
    seedSnapshot('hash-1', [progressEntry(0, 1, 0, [false])])
    await syncNow('manual') // 预热 lastToken
    h.putSyncFile.mockClear()
    h.getToken.mockClear()

    flushSync()
    // flushSync 是 fire-and-forget：微任务链完成后断言
    await vi.waitFor(() => {
      expect(h.putSyncFile).toHaveBeenCalledTimes(1)
    })

    const [text, token, opts] = h.putSyncFile.mock.calls[0]
    expect(token).toBe('tok-1')
    expect(opts).toEqual({ keepalive: true })
    expect(JSON.parse(text).schemaVersion).toBe(1)
    expect(h.getToken).not.toHaveBeenCalled()
  })

  it('无缓存令牌（从未成功同步）→ 零网络请求', () => {
    seedSnapshot('hash-1')

    flushSync()

    expect(h.putSyncFile).not.toHaveBeenCalled()
    expect(h.getToken).not.toHaveBeenCalled()
  })
})

describe('signIn / signOut', () => {
  it('signIn 成功 → 自动触发一次手动同步', async () => {
    seedSnapshot('hash-1')

    await signIn()

    expect(h.signIn).toHaveBeenCalledTimes(1)
    expect(h.putSyncFile).toHaveBeenCalledTimes(1)
    expect(syncState.status).toBe('idle')
    expect(syncState.accountEmail).toBe('user@test.local')
  })

  it('signIn 拒绝（auth）→ status error，lastMessage 可重试', async () => {
    h.signIn.mockRejectedValue({ code: 'auth', message: '弹窗被浏览器拦截，请允许弹窗后重试' })

    await signIn()

    expect(syncState.status).toBe('error')
    expect(syncState.lastMessage).toContain('请允许弹窗')
  })

  it('signOut 成功 → 清空账号回到未登录态', async () => {
    seedSnapshot('hash-1')
    await syncNow('manual')
    expect(syncState.accountEmail).toBe('user@test.local')

    await signOut()

    expect(h.signOut).toHaveBeenCalledTimes(1)
    expect(syncState.accountEmail).toBe('')
    expect(syncState.status).toBe('idle-signed-out')
  })
})

// 防回归：常量 Mock 必须替换为非空（否则整文件用例退化走未配置分支）
describe('测试自身卫生检查', () => {
  it('syncConfig mock 后 clientId 非空', () => {
    expect(MSAL_CLIENT_ID).toBe('test-client-id')
  })
})

// 期望形状 sanity：信封 helper 与真实序列化对齐（防止 helper 漂移）
describe('信封期望 helper', () => {
  it('expectedEnvelopeOf 与控制器序列化形状一致', async () => {
    seedSnapshot('hash-1')
    await syncNow('manual')
    const [text] = h.putSyncFile.mock.calls[0]
    expect(JSON.parse(text)).toEqual(
      expectedEnvelopeOf({ tombstones: [], snapshots: { 'hash-1': localStorage.getItem('word-exam-rush:hash-1')! } })
    )
  })
})
