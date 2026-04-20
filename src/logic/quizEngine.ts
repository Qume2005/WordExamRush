import type { ProcessedWord, WordProgress, QuizCard, AnswerResult, SummaryRow } from '../types'
import { generateCard, getAvailableModes } from './cardGenerator'
import { pickRandom } from './shuffle'

/**
 * Create the initial progress map for all words.
 */
export function createProgressMap(words: ProcessedWord[]): Map<number, WordProgress> {
  const map = new Map<number, WordProgress>()
  for (const w of words) {
    map.set(w.id, {
      wordId: w.id,
      appearances: 0,
      correctCount: 0,
      history: [],
    })
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
 * Check if a word is complete (appeared at least 3 times with >= 90% accuracy).
 */
function isWordComplete(p: WordProgress): boolean {
  return p.appearances >= 3 && getAccuracy(p) >= 0.9
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
  // Filter to incomplete words
  const incomplete = words.filter(w => {
    const p = progressMap.get(w.id)!
    return !isWordComplete(p)
  })

  if (incomplete.length === 0) return null

  // Find minimum appearances among incomplete words
  let minAppearances = Infinity
  for (const w of incomplete) {
    const p = progressMap.get(w.id)!
    if (p.appearances < minAppearances) {
      minAppearances = p.appearances
    }
  }

  // Collect all words tied at the minimum
  const candidates = incomplete.filter(w => progressMap.get(w.id)!.appearances === minAppearances)

  // Pick randomly from tied candidates
  return pickRandom(candidates, 1)[0].id
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
  return generateCard(wordId, words, mode)
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
      chinese_explanations: w.chinese_explanations,
      english_explanations: w.english_explanations,
      appearances: p.appearances,
      accuracy: getAccuracy(p),
      history: [...p.history],
    })
  }

  rows.sort((a, b) => b.appearances - a.appearances)
  return rows
}
