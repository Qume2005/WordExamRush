import type { ProcessedWord, WordProgress, QuizCard, AnswerResult, SummaryRow } from '../types'
import { generateCard, getAvailableModes } from './cardGenerator'
import { pickRandom } from '../utils/shuffle'

/**
 * Create an empty progress entry for a word.
 */
export function createEmptyProgress(wordId: number): WordProgress {
  return { wordId, appearances: 0, correctCount: 0, history: [] }
}

/**
 * Create the initial progress map for all words.
 */
export function createProgressMap(words: ProcessedWord[]): Map<number, WordProgress> {
  const map = new Map<number, WordProgress>()
  for (const w of words) {
    map.set(w.id, createEmptyProgress(w.id))
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
 * Calculate average progress percentage (0~100) across all words.
 */
export function calcProgressPercent(progressMap: Map<number, WordProgress>, words: ProcessedWord[]): number {
  if (!words.length) return 0
  let total = 0
  for (const p of progressMap.values()) {
    total += getWordProgress(p)
  }
  return Math.round((total / words.length) * 100)
}

/**
 * Check if a word is complete (appeared at least 3 times with >= 90% accuracy).
 */
function isWordComplete(p: WordProgress): boolean {
  return p.appearances >= 3 && getAccuracy(p) >= 0.7
}

/**
 * Get progress towards mastery (0~1).
 * Combines appearance progress (max at 3) and accuracy progress (max at 0.7).
 */
export function getWordProgress(p: WordProgress): number {
  if (p.appearances === 0) return 0
  const appearanceRatio = Math.min(p.appearances / 3, 1)
  const accuracyRatio = Math.min(getAccuracy(p) / 0.7, 1)
  return appearanceRatio * accuracyRatio
}

/**
 * Select the next word to quiz.
 * Prioritizes words with the fewest appearances among incomplete words.
 * Returns null if all words are complete.
 */
export function selectNextWord(
  progressMap: Map<number, WordProgress>,
  words: ProcessedWord[]
): number | null {
  let minAppearances = Infinity
  const candidates: ProcessedWord[] = []

  for (const w of words) {
    const p = progressMap.get(w.id)
    if (!p || isWordComplete(p)) continue
    if (p.appearances < minAppearances) {
      minAppearances = p.appearances
      candidates.length = 0
      candidates.push(w)
    } else if (p.appearances === minAppearances) {
      candidates.push(w)
    }
  }

  return candidates.length ? pickRandom(candidates, 1)[0].id : null
}

/**
 * Generate the next quiz card for the selected word.
 * Randomly picks a card mode from available modes.
 */
export function createNextCard(
  wordId: number,
  words: ProcessedWord[]
): QuizCard | null {
  const word = words.find(w => w.id === wordId)
  if (!word) return null

  const availableModes = getAvailableModes(word)
  if (availableModes.length === 0) return null

  const mode = pickRandom(availableModes, 1)[0]
  return generateCard(word, words, mode)
}

/**
 * Update progress after an answer.
 */
export function recordAnswer(
  progressMap: Map<number, WordProgress>,
  result: AnswerResult
): void {
  const p = progressMap.get(result.card.wordId)
  if (!p) return

  p.appearances++
  if (result.isCorrect) {
    p.correctCount++
  }
  p.history.push(result.isCorrect)
}

/**
 * Check if the quiz is complete (all words have reached completion criteria).
 */
export function isQuizComplete(
  progressMap: Map<number, WordProgress>
): boolean {
  for (const p of progressMap.values()) {
    if (!isWordComplete(p)) return false
  }
  return true
}

/**
 * Generate summary rows, sorted by appearances descending.
 */
export function generateSummary(
  progressMap: Map<number, WordProgress>,
  words: ProcessedWord[]
): SummaryRow[] {
  const rows: SummaryRow[] = []

  for (const w of words) {
    const p = progressMap.get(w.id)!
    rows.push({
      word: w.word,
      chinese_translations: w.chinese_translations,
      english_explanations: w.english_explanations,
      appearances: p.appearances,
      accuracy: getAccuracy(p),
      history: [...p.history],
    })
  }

  rows.sort((a, b) => b.appearances - a.appearances)
  return rows
}
