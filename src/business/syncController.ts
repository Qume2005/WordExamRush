import { reactive } from 'vue'
import { applyProgress, collectProgress } from './progressStorage'
import type { SyncBundle } from './progressStorage'
import { mergeBundles } from './syncEngine'
import { MSAL_CLIENT_ID } from './syncConfig'

/**
 * UI 状态枚举。注意与 SyncError 的 code 是两回事：
 * code 'not-configured' 是客户端错误码，status 'idle-not-configured' 才是这里的 UI 状态名（Momus round-c #2）。
 */
export type SyncStatus =
  | 'idle'
  | 'idle-not-configured'
  | 'idle-signed-out'
  | 'syncing'
  | 'error'
  | 'schema-unsupported'

export const syncState = reactive({
  status: 'idle' as SyncStatus,
  lastMessage: '',
  accountEmail: '',
})

type Client = typeof import('./oneDriveClient')

// oneDriveClient 的唯一引用入口：动态 import + 模块级缓存，保证客户端整体进懒加载分片（Oracle #1）
let clientPromise: Promise<Client> | null = null

function loadClient(): Promise<Client> {
  if (!clientPromise) clientPromise = import('./oneDriveClient')
  return clientPromise
}

/** 未配置判断只读 syncConfig 常量，绝不触发客户端动态加载 */
function isConfigured(): boolean {
  return MSAL_CLIENT_ID.length > 0
}

/** 最近一次成功获取的令牌：flushSync 在页面 hidden 后不能再异步刷新令牌（Metis #11） */
let lastToken = ''

/** 测试专用：重置模块级缓存与响应式状态（单例无法跨测试复用） */
export function _resetStateForTests(): void {
  clientPromise = null
  lastToken = ''
  syncState.status = 'idle'
  syncState.lastMessage = ''
  syncState.accountEmail = ''
}

/** 信封序列化：不含 fileMap——map: 键属设备本地视图，不跨设备同步（远端合并侧按空对象参与） */
function serializeEnvelope(bundle: SyncBundle): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tombstones: bundle.tombstones,
    snapshots: bundle.snapshots,
  })
}

/**
 * 同步主流程。token 模式（Oracle round-c #1）：startup/exit 一律 getToken({ silentOnly: true })
 * ——静默失败不弹窗；仅 manual 用 silentOnly: false 允许弹窗回退。令牌由控制器先取再直传
 * putSyncFile，客户端内部不再二次取令牌。
 */
export async function syncNow(trigger: 'startup' | 'exit' | 'manual'): Promise<void> {
  if (!isConfigured()) {
    syncState.status = 'idle-not-configured'
    return
  }
  syncState.status = 'syncing'
  try {
    const client = await loadClient()
    const token = await client.getToken({ silentOnly: trigger !== 'manual' })
    lastToken = token

    const local = collectProgress()
    const remoteJson = await client.fetchSyncFile()

    let merged = local
    if (remoteJson !== null) {
      let envelope: { schemaVersion?: unknown; tombstones?: unknown; snapshots?: unknown }
      try {
        envelope = JSON.parse(remoteJson)
      } catch {
        syncState.status = 'error'
        syncState.lastMessage = '云端进度文件损坏，已跳过本次同步'
        return
      }
      if (typeof envelope !== 'object' || envelope === null || envelope.schemaVersion !== 1) {
        // 未知 schema：只读中止，绝不覆盖云端数据（Metis #7）
        syncState.status = 'schema-unsupported'
        syncState.lastMessage = '云端数据格式较新，已中止同步以保护数据，请升级后再试'
        return
      }
      merged = mergeBundles(local, {
        tombstones: Array.isArray(envelope.tombstones) ? (envelope.tombstones as string[]) : [],
        snapshots:
          envelope.snapshots && typeof envelope.snapshots === 'object'
            ? (envelope.snapshots as Record<string, string>)
            : {},
        fileMap: {},
      })
      // 远端信封无 fileMap（空对象参与合并），引擎回退分支可能选中 undefined 值，写回前清掉
      for (const key of Object.keys(merged.fileMap)) {
        if (merged.fileMap[key] === undefined) delete merged.fileMap[key]
      }
      applyProgress(merged)
    }

    await client.putSyncFile(serializeEnvelope(merged), token)
    const msal = await client.getMsal()
    syncState.accountEmail = msal.getAllAccounts()[0]?.username ?? ''
    syncState.lastMessage = `上次同步：${new Date().toLocaleTimeString()}`
    syncState.status = 'idle'
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'auth' && trigger !== 'manual') {
      // 自动触发静默失败：不打扰用户，提示可手动同步（Oracle round-b #1）
      syncState.status = 'idle-signed-out'
      syncState.lastMessage = '自动同步已跳过（未登录或登录已过期），可手动同步'
    } else {
      syncState.status = 'error'
      syncState.lastMessage = (err as Error)?.message || '同步失败，请重试'
    }
  }
}

/**
 * visibilitychange hidden 兜底：同步收集 payload 后用缓存令牌 + keepalive 直传，
 * hidden 后不做任何异步令牌刷新；无缓存令牌则整体跳过（零网络）。best-effort，绝不抛错。
 */
export function flushSync(): void {
  if (!isConfigured() || !lastToken) return
  try {
    const payload = serializeEnvelope(collectProgress())
    void loadClient()
      .then((client) => client.putSyncFile(payload, lastToken, { keepalive: true }))
      .catch(() => {
        // 切后台兜底上传失败静默忽略
      })
  } catch {
    // 同步收集阶段失败同样静默
  }
}

/** 退出 quiz/detail 屏时的 fire-and-forget 同步，不阻塞屏幕切换 */
export function syncOnExit(): void {
  void syncNow('exit').catch(() => {})
}

/** 启动初始化：未配置→指引；已配置但无账号→未登录态；有账号→静默 startup 同步（绝不弹窗） */
export async function init(): Promise<void> {
  if (!isConfigured()) {
    syncState.status = 'idle-not-configured'
    return
  }
  try {
    const client = await loadClient()
    const msal = await client.getMsal()
    const accounts = msal.getAllAccounts()
    if (accounts.length === 0) {
      syncState.status = 'idle-signed-out'
      return
    }
    syncState.accountEmail = accounts[0]?.username ?? ''
    await syncNow('startup')
  } catch (err) {
    // 启动链路任何异常一律静默降级为未登录态
    syncState.status = 'idle-signed-out'
    syncState.lastMessage = (err as Error)?.message || ''
  }
}

/** 弹窗登录；成功后自动触发一次手动同步 */
export async function signIn(): Promise<void> {
  if (!isConfigured()) {
    syncState.status = 'idle-not-configured'
    return
  }
  syncState.status = 'syncing'
  try {
    const client = await loadClient()
    await client.signIn()
    const msal = await client.getMsal()
    syncState.accountEmail = msal.getAllAccounts()[0]?.username ?? ''
    await syncNow('manual')
  } catch (err) {
    syncState.status = 'error'
    syncState.lastMessage = (err as Error)?.message || '登录失败，请重试'
  }
}

/** 弹窗登出 */
export async function signOut(): Promise<void> {
  try {
    const client = await loadClient()
    await client.signOut()
    syncState.accountEmail = ''
    syncState.status = 'idle-signed-out'
    syncState.lastMessage = ''
  } catch (err) {
    syncState.status = 'error'
    syncState.lastMessage = (err as Error)?.message || '登出失败，请重试'
  }
}
