import type { ProcessedWord, WordProgress } from '../types'
import { getWordProgress, createEmptyProgress } from './quizEngine'
import { hashString } from '../utils/hash'
import { sparklinePoints } from '../utils/sparkline'

const STORAGE_PREFIX = 'word-exam-rush:'
const MAP_PREFIX = STORAGE_PREFIX + 'map:'
const SESSION_KEY = STORAGE_PREFIX + 'session'

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

/** Compute hash of raw JSON text, clean up stale data if hash changed */
export function resolveFileHash(folder: string, fileName: string, rawJson: string): string {
  const newHash = hashString(rawJson)
  const mapKey = getMapKey(folder, fileName)
  const oldHash = localStorage.getItem(mapKey)

  if (oldHash && oldHash !== newHash) {
    localStorage.removeItem(STORAGE_PREFIX + oldHash)
  }
  localStorage.setItem(mapKey, newHash)
  return newHash
}

/** Read saved progress for a single file by hash */
export function loadFileProgress(hash: string): { words: ProcessedWord[]; progress: [number, WordProgress][] } | null {
  const saved = localStorage.getItem(getProgressKey(hash))
  if (!saved) return null
  try {
    const data = JSON.parse(saved)
    if (data.words && data.progress) return data
  } catch { /* ignore */ }
  return null
}

/** Save progress for a single file session */
export function saveFileProgress(hash: string, words: ProcessedWord[], progressMap: Map<number, WordProgress>): void {
  localStorage.setItem(
    getProgressKey(hash),
    JSON.stringify({ words, progress: [...progressMap.entries()] })
  )
}

/** Save folder session progress back to individual files */
export function saveFolderProgress(
  words: ProcessedWord[],
  progressMap: Map<number, WordProgress>,
  wordSources: string[]
): void {
  const fileUpdates: Record<string, { wordKey: string; progress: WordProgress }[]> = {}

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
    const pm = new Map(fileData.progress as [number, WordProgress][])

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
export function ensureFileEntry(hash: string, processed: ProcessedWord[]): { words: ProcessedWord[]; progress: [number, WordProgress][] } {
  const saved = loadFileProgress(hash)
  if (saved) return saved

  const initial = {
    words: processed,
    progress: processed.map((_: ProcessedWord, i: number) => [i, createEmptyProgress(i)] as [number, WordProgress])
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

  // Flatten all words' histories into one sequence
  const allHistory: boolean[] = []
  for (const [, p] of data.progress) {
    allHistory.push(...p.history)
  }

  return sparklinePoints(allHistory)
}

/** Calculate completion percentage for a single file */
export function calcFilePercent(folder: string, fileName: string): number {
  const data = getFileData(folder, fileName)
  if (!data) return 0
  const map = new Map(data.progress)
  let totalProgress = 0
  for (const p of map.values()) {
    totalProgress += getWordProgress(p)
  }
  return data.words.length ? Math.round((totalProgress / data.words.length) * 100) : 0
}
