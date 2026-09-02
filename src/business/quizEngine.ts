import type {
  ProcessedWord,
  WordProgress,
  WordModeProgress,
  QuizCard,
  AnswerResult,
  SummaryRow,
  CardMode,
} from '../types'
import { generateCard, getAvailableModes } from './cardGenerator'
import { pickRandom } from '../utils/shuffle'

/**
 * 跨题型影响权重表：table[from][to] = 在 from 题型答题时，计入 to 题型进度的权重。
 * 对角线是本题型本身。默认策略：答对时回忆类（中→英、释义→英）互相带动最强（0.8），
 * 识记类（看词选义/同义词）带动回忆类较弱；答错只计入本题型，不牵连其他题型。
 * 权重会以小数累加进 appearances/correctCount，history 只记本题型。
 */
export const CORRECT_INFLUENCE: Record<CardMode, Record<CardMode, number>> = {
  'zh-to-en':             { 'zh-to-en': 1, 'en-to-zh': 0.5, 'en-to-synonym': 0.4, 'en-explanation-to-en': 0.8 },
  'en-to-zh':             { 'zh-to-en': 0.4, 'en-to-zh': 1, 'en-to-synonym': 0.5, 'en-explanation-to-en': 0.3 },
  'en-to-synonym':        { 'zh-to-en': 0.4, 'en-to-zh': 0.5, 'en-to-synonym': 1, 'en-explanation-to-en': 0.3 },
  'en-explanation-to-en': { 'zh-to-en': 0.8, 'en-to-zh': 0.5, 'en-to-synonym': 0.4, 'en-explanation-to-en': 1 },
}

export const WRONG_INFLUENCE: Record<CardMode, Record<CardMode, number>> = {
  'zh-to-en':             { 'zh-to-en': 1, 'en-to-zh': 0, 'en-to-synonym': 0, 'en-explanation-to-en': 0 },
  'en-to-zh':             { 'zh-to-en': 0, 'en-to-zh': 1, 'en-to-synonym': 0, 'en-explanation-to-en': 0 },
  'en-to-synonym':        { 'zh-to-en': 0, 'en-to-zh': 0, 'en-to-synonym': 1, 'en-explanation-to-en': 0 },
  'en-explanation-to-en': { 'zh-to-en': 0, 'en-to-zh': 0, 'en-to-synonym': 0, 'en-explanation-to-en': 1 },
}

/**
 * Create an empty progress entry for one card mode.
 */
export function createModeProgress(wordId: number): WordProgress {
  return { wordId, appearances: 0, correctCount: 0, history: [] }
}

/**
 * Create an all-modes progress entry for a word (one per available mode).
 */
export function createWordProgress(word: ProcessedWord): WordModeProgress {
  const modes: WordModeProgress['modes'] = {}
  for (const m of getAvailableModes(word)) {
    modes[m] = createModeProgress(word.id)
  }
  return { wordId: word.id, modes }
}

/**
 * Create the initial progress map for all words.
 */
export function createProgressMap(words: ProcessedWord[]): Map<number, WordModeProgress> {
  const map = new Map<number, WordModeProgress>()
  for (const w of words) {
    map.set(w.id, createWordProgress(w))
  }
  return map
}

/**
 * Get accuracy for a word progress entry.
 */
function getAccuracy(p: WordProgress): number {
  if (p.appearances === 0) return 0
  return p.correctCount / p.appearances
}

/**
 * Get progress towards mastery (0~1) for a single mode.
 * Combines appearance progress (max at 3) and accuracy progress (max at 0.7).
 */
export function getWordProgress(p: WordProgress): number {
  if (p.appearances === 0) return 0
  const appearanceRatio = Math.min(p.appearances / 3, 1)
  const accuracyRatio = Math.min(getAccuracy(p) / 0.7, 1)
  return appearanceRatio * accuracyRatio
}

/**
 * Aggregate a word's per-mode entries for display: summed counters,
 * merged history, averaged mastery (0~1).
 */
export function aggregateWordProgress(entry: WordModeProgress): {
  appearances: number
  correctCount: number
  history: boolean[]
  progress: number
} {
  let appearances = 0
  let correctCount = 0
  let progress = 0
  let count = 0
  const history: boolean[] = []
  for (const p of Object.values(entry.modes)) {
    if (!p) continue
    appearances += p.appearances
    correctCount += p.correctCount
    history.push(...p.history)
    progress += getWordProgress(p)
    count++
  }
  return { appearances, correctCount, history, progress: count ? progress / count : 0 }
}

/**
 * Calculate average progress percentage (0~100) across all words.
 */
export function calcProgressPercent(progressMap: Map<number, WordModeProgress>, words: ProcessedWord[]): number {
  if (!words.length) return 0
  let total = 0
  for (const w of words) {
    const entry = progressMap.get(w.id)
    if (entry) total += aggregateWordProgress(entry).progress
  }
  return Math.round((total / words.length) * 100)
}

/**
 * Check if a single mode is complete (appeared at least 3 times with >= 70% accuracy).
 */
function isModeComplete(p: WordProgress): boolean {
  return p.appearances >= 3 && getAccuracy(p) >= 0.7
}

/**
 * Check if all of a word's modes are complete.
 */
function isEntryComplete(entry: WordModeProgress): boolean {
  for (const p of Object.values(entry.modes)) {
    if (!p || !isModeComplete(p)) return false
  }
  return true
}

/**
 * Select the next word to quiz.
 * Skips words complete in every mode; prioritizes words with the fewest total appearances.
 * Returns null if all words are complete.
 */
export function selectNextWord(
  progressMap: Map<number, WordModeProgress>,
  words: ProcessedWord[]
): number | null {
  let minAppearances = Infinity
  const candidates: ProcessedWord[] = []

  for (const w of words) {
    const entry = progressMap.get(w.id)
    if (!entry || Object.keys(entry.modes).length === 0 || isEntryComplete(entry)) continue
    const appearances = aggregateWordProgress(entry).appearances
    if (appearances < minAppearances) {
      minAppearances = appearances
      candidates.length = 0
      candidates.push(w)
    } else if (appearances === minAppearances) {
      candidates.push(w)
    }
  }

  return candidates.length ? pickRandom(candidates, 1)[0].id : null
}

/**
 * Generate the next quiz card for the selected word.
 * Prefers the word's least-practiced incomplete mode (random on ties).
 */
export function createNextCard(
  wordId: number,
  words: ProcessedWord[],
  progressMap: Map<number, WordModeProgress>
): QuizCard | null {
  const word = words.find(w => w.id === wordId)
  if (!word) return null

  const availableModes = getAvailableModes(word)
  if (availableModes.length === 0) return null

  const entry = progressMap.get(wordId)
  const incomplete = entry
    ? availableModes.filter(m => {
        const p = entry.modes[m]
        return !p || !isModeComplete(p)
      })
    : []
  const pool = incomplete.length ? incomplete : availableModes

  let minAppearances = Infinity
  let leastPracticed: CardMode[] = []
  for (const m of pool) {
    const a = entry?.modes[m]?.appearances ?? 0
    if (a < minAppearances) {
      minAppearances = a
      leastPracticed = [m]
    } else if (a === minAppearances) {
      leastPracticed.push(m)
    }
  }

  const mode = pickRandom(leastPracticed, 1)[0]
  return generateCard(word, words, mode)
}

/**
 * Update progress after an answer: full record in the answered mode,
 * cross-mode influence weights applied to the word's other modes.
 */
export function recordAnswer(
  progressMap: Map<number, WordModeProgress>,
  result: AnswerResult
): void {
  const entry = progressMap.get(result.card.wordId)
  if (!entry) return

  const from = result.card.mode
  const own = entry.modes[from]
  if (own) {
    own.appearances++
    if (result.isCorrect) {
      own.correctCount++
    }
    own.history.push(result.isCorrect)
  }

  const table = result.isCorrect ? CORRECT_INFLUENCE : WRONG_INFLUENCE
  for (const [to, p] of Object.entries(entry.modes)) {
    if (!p || to === from) continue
    const weight = table[from][to as CardMode]
    if (weight <= 0) continue
    p.appearances += weight
    if (result.isCorrect) {
      p.correctCount += weight
    }
  }
}

/**
 * Check if the quiz is complete (all words have reached completion criteria).
 */
export function isQuizComplete(
  progressMap: Map<number, WordModeProgress>
): boolean {
  for (const entry of progressMap.values()) {
    if (Object.keys(entry.modes).length === 0) continue
    if (!isEntryComplete(entry)) return false
  }
  return true
}

/**
 * Generate summary rows, sorted by appearances descending.
 */
export function generateSummary(
  progressMap: Map<number, WordModeProgress>,
  words: ProcessedWord[]
): SummaryRow[] {
  const rows: SummaryRow[] = []

  for (const w of words) {
    const entry = progressMap.get(w.id)
    if (!entry) continue
    const agg = aggregateWordProgress(entry)
    rows.push({
      word: w.word,
      chinese_translations: w.chinese_translations,
      english_explanations: w.english_explanations,
      appearances: agg.appearances,
      accuracy: agg.appearances ? agg.correctCount / agg.appearances : 0,
      history: agg.history,
    })
  }

  rows.sort((a, b) => b.appearances - a.appearances)
  return rows
}
