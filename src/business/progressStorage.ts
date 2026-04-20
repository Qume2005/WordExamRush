import type { ProcessedWord, WordProgress } from '../types'
import { isWordComplete } from './quizEngine'
import { hashString } from '../utils/hash'

const STORAGE_PREFIX = 'word-exam-rush:'
const MAP_PREFIX = STORAGE_PREFIX + 'map:'

export function getProgressKey(hash: string): string {
  return STORAGE_PREFIX + hash
}

export function getMapKey(folder: string, fileName: string): string {
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
    const p = progressMap.get(i)
    if (!p) continue
    if (!fileUpdates[src]) fileUpdates[src] = []
    fileUpdates[src].push({ wordKey: words[i].word.join(','), progress: p })
  }

  for (const [src, updates] of Object.entries(fileUpdates)) {
    const saved = localStorage.getItem(getProgressKey(src))
    if (!saved) continue
    const fileData = JSON.parse(saved)
    const pm = new Map(fileData.progress as [number, WordProgress][])

    for (const { wordKey, progress } of updates) {
      for (const [id, w] of fileData.words.entries()) {
        if (w.word.join(',') === wordKey) {
          pm.set(id, { ...progress, wordId: id })
          break
        }
      }
    }

    fileData.progress = [...pm]
    localStorage.setItem(getProgressKey(src), JSON.stringify(fileData))
  }
}

/** Reset progress for all files in a folder session */
export function resetFolderProgress(wordSources: string[]): void {
  const fileKeys = new Set(wordSources.filter(Boolean))
  for (const key of fileKeys) {
    const saved = localStorage.getItem(getProgressKey(key))
    if (!saved) continue
    const fileData = JSON.parse(saved)
    fileData.progress = fileData.words.map((_: unknown, i: number) =>
      [i, { wordId: i, appearances: 0, correctCount: 0, history: [] }]
    )
    localStorage.setItem(getProgressKey(key), JSON.stringify(fileData))
  }
}

/** Remove progress for a single file */
export function removeFileProgress(hash: string): void {
  localStorage.removeItem(getProgressKey(hash))
}

/** Ensure a file has an initial localStorage entry, return existing or new data */
export function ensureFileEntry(hash: string, processed: ProcessedWord[]): { words: ProcessedWord[]; progress: [number, WordProgress][] } {
  const saved = loadFileProgress(hash)
  if (saved) return saved

  const initial = {
    words: processed,
    progress: processed.map((_: ProcessedWord, i: number) => [i, { wordId: i, appearances: 0, correctCount: 0, history: [] }] as [number, WordProgress])
  }
  localStorage.setItem(getProgressKey(hash), JSON.stringify(initial))
  return initial
}

/** Calculate completion percentage for a single file */
export function calcFilePercent(folder: string, fileName: string): number {
  const mapKey = getMapKey(folder, fileName)
  const hash = localStorage.getItem(mapKey)
  if (!hash) return 0
  const data = loadFileProgress(hash)
  if (!data) return 0
  const map = new Map(data.progress)
  let completed = 0
  for (const p of map.values()) {
    if (isWordComplete(p)) completed++
  }
  return data.words.length ? Math.round((completed / data.words.length) * 100) : 0
}

/** Calculate average completion percentage for a folder */
export function calcFolderPercent(folder: string, files: string[]): number {
  if (!files.length) return 0
  let total = 0
  for (const f of files) {
    total += calcFilePercent(folder, f)
  }
  return Math.round(total / files.length)
}
