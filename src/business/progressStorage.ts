import type { ProcessedWord, WordModeProgress } from '../types'
import { aggregateWordProgress, createWordProgress } from './quizEngine'
import { hashString } from '../utils/hash'
import { sparklinePoints } from '../utils/sparkline'

const STORAGE_PREFIX = 'word-exam-rush:'
const MAP_PREFIX = STORAGE_PREFIX + 'map:'
const SESSION_KEY = STORAGE_PREFIX + 'session'
const TOMBSTONES_KEY = STORAGE_PREFIX + 'tombstones'
/** 墓碑数量上限，超出时丢弃最旧的记录 */
const TOMBSTONES_MAX = 200

/** Save active session info for recovery after unexpected exit */
export function saveSession(info: { folder: string; fileName?: string; files?: string[] }): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(info))
}

/** Read and clear saved session info, returns null if none */
export function consumeSession(): { folder: string; fileName?: string; files?: string[] } | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  sessionStorage.removeItem(SESSION_KEY)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Clear session without consuming (called on normal exit) */
export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

function getProgressKey(hash: string): string {
  return STORAGE_PREFIX + hash
}

function getMapKey(folder: string, fileName: string): string {
  return MAP_PREFIX + folder + '/' + fileName
}

/** 读取墓碑列表，数据缺失或损坏时返回空数组 */
export function getTombstones(): string[] {
  const raw = localStorage.getItem(TOMBSTONES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 追加墓碑（去重、上限 200 丢弃最旧） */
function addTombstone(hash: string): void {
  const list = getTombstones()
  if (list.includes(hash)) return
  list.push(hash)
  while (list.length > TOMBSTONES_MAX) list.shift()
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list))
}

/** 从墓碑列表中移除指定 hash（内容回滚后该 hash 重新合法） */
function removeTombstone(hash: string): void {
  const list = getTombstones()
  const i = list.indexOf(hash)
  if (i === -1) return
  list.splice(i, 1)
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list))
}

/** Compute hash of raw JSON text, clean up stale data if hash changed */
export function resolveFileHash(folder: string, fileName: string, rawJson: string): string {
  const newHash = hashString(rawJson)
  const mapKey = getMapKey(folder, fileName)
  const oldHash = localStorage.getItem(mapKey)

  if (oldHash && oldHash !== newHash) {
    localStorage.removeItem(STORAGE_PREFIX + oldHash)
    addTombstone(oldHash)
  }
  localStorage.setItem(mapKey, newHash)
  // 解毒：内容回滚到旧版本时，新 hash 对应的内容重新存在，墓碑应当撤销
  removeTombstone(newHash)
  return newHash
}

/** Read saved progress for a single file by hash */
export function loadFileProgress(hash: string): { words: ProcessedWord[]; progress: [number, WordModeProgress][] } | null {
  const saved = localStorage.getItem(getProgressKey(hash))
  if (!saved) return null
  try {
    const data = JSON.parse(saved)
    // v4 起释义含英英字段；旧版本快照直接视为无进度（重置）
    if (data.version === 4 && data.words && data.progress) return data
  } catch { /* ignore */ }
  return null
}

/** Save progress for a single file session */
export function saveFileProgress(hash: string, words: ProcessedWord[], progressMap: Map<number, WordModeProgress>): void {
  localStorage.setItem(
    getProgressKey(hash),
    JSON.stringify({ version: 4, words, progress: [...progressMap.entries()] })
  )
}

/** Save folder session progress back to individual files */
export function saveFolderProgress(
  words: ProcessedWord[],
  progressMap: Map<number, WordModeProgress>,
  wordSources: string[]
): void {
  const fileUpdates: Record<string, { wordKey: string; progress: WordModeProgress }[]> = {}

  for (let i = 0; i < words.length; i++) {
    const src = wordSources[i]
    if (!src) continue
    const p = progressMap.get(words[i].id)
    if (!p) continue
    if (!fileUpdates[src]) fileUpdates[src] = []
    fileUpdates[src].push({ wordKey: words[i].word.join(','), progress: p })
  }

  for (const [src, updates] of Object.entries(fileUpdates)) {
    const saved = localStorage.getItem(getProgressKey(src))
    if (!saved) continue
    const fileData = JSON.parse(saved)
    const pm = new Map(fileData.progress as [number, WordModeProgress][])

    // Build wordKey → id map for O(1) lookup
    const keyToId = new Map<string, number>()
    for (const [id, w] of fileData.words.entries()) {
      keyToId.set(w.word.join(','), id)
    }

    for (const { wordKey, progress } of updates) {
      const id = keyToId.get(wordKey)
      if (id !== undefined) {
        pm.set(id, { ...progress, wordId: id })
      }
    }

    fileData.progress = [...pm]
    localStorage.setItem(getProgressKey(src), JSON.stringify(fileData))
  }
}

/** Ensure a file has an initial localStorage entry, return existing or new data */
export function ensureFileEntry(hash: string, processed: ProcessedWord[]): { words: ProcessedWord[]; progress: [number, WordModeProgress][] } {
  const saved = loadFileProgress(hash)
  if (saved) return saved

  const initial = {
    version: 4 as const,
    words: processed,
    progress: processed.map((w: ProcessedWord, i: number) => [i, createWordProgress(w)] as [number, WordModeProgress])
  }
  localStorage.setItem(getProgressKey(hash), JSON.stringify(initial))
  return initial
}

/** Load file data by folder/name, returns parsed progress or null */
function getFileData(folder: string, fileName: string) {
  const mapKey = getMapKey(folder, fileName)
  const hash = localStorage.getItem(mapKey)
  if (!hash) return null
  return loadFileProgress(hash)
}

/** Get sparkline SVG points for a single file's aggregate accuracy trend */
export function calcFileSparkline(folder: string, fileName: string): string {
  const data = getFileData(folder, fileName)
  if (!data) return ''

  // Flatten all words' per-mode histories into one sequence
  const allHistory: boolean[] = []
  for (const [, entry] of data.progress) {
    for (const p of Object.values(entry.modes)) {
      if (p) allHistory.push(...p.history)
    }
  }

  return sparklinePoints(allHistory)
}

/** Calculate completion percentage for a single file */
export function calcFilePercent(folder: string, fileName: string): number {
  const data = getFileData(folder, fileName)
  if (!data) return 0
  let totalProgress = 0
  for (const [, entry] of data.progress) {
    totalProgress += aggregateWordProgress(entry).progress
  }
  return data.words.length ? Math.round((totalProgress / data.words.length) * 100) : 0
}

/** 云端同步用的进度打包（快照 + 文件映射 + 墓碑），值为 localStorage 原始字符串 */
export interface SyncBundle {
  tombstones: string[]
  snapshots: Record<string, string>
  fileMap: Record<string, string>
}

/** 快照键不能与保留键冲突：map、tombstones、session、map: 前缀 */
function isReservedKey(rest: string): boolean {
  return rest === 'map' || rest === 'tombstones' || rest === 'session' || rest.startsWith('map:')
}

/** Collect all local progress into a bundle for cloud sync (never deletes anything) */
export function collectProgress(): SyncBundle {
  const bundle: SyncBundle = { tombstones: getTombstones(), snapshots: {}, fileMap: {} }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue
    const rest = key.slice(STORAGE_PREFIX.length)
    const raw = localStorage.getItem(key)
    if (raw === null) continue

    if (key.startsWith(MAP_PREFIX)) {
      bundle.fileMap[rest.slice(4)] = raw
    } else if (!isReservedKey(rest)) {
      try {
        // 仅收 v4 快照，旧版本/损坏数据留给本地 loadFileProgress 按无进度处理
        if (JSON.parse(raw).version === 4) bundle.snapshots[rest] = raw
      } catch { /* skip */ }
    }
  }
  return bundle
}

/** Restore a bundle into localStorage: add/overwrite only keys present in the bundle */
export function applyProgress(bundle: SyncBundle): void {
  for (const [hash, raw] of Object.entries(bundle.snapshots)) {
    localStorage.setItem(STORAGE_PREFIX + hash, raw)
  }
  for (const [key, raw] of Object.entries(bundle.fileMap)) {
    localStorage.setItem(MAP_PREFIX + key, raw)
  }
}
