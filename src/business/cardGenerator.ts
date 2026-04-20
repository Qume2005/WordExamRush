import type { ProcessedWord, CardMode, QuizCard, CardOption } from '../types'
import { shuffle, pickRandom } from '../utils/shuffle'

/**
 * Pick distractor words whose given field doesn't overlap with the target's.
 * Falls back to all other words if too few non-overlapping ones exist.
 */
function pickWordDistractors(
  target: ProcessedWord,
  words: ProcessedWord[],
  field: 'chinese_translations' | 'english_explanations',
  count: number
): CardOption[] {
  const targetSet = new Set(target[field])
  const nonOverlapping = words.filter(
    w => w.id !== target.id && !w[field].some(e => targetSet.has(e))
  )
  const pool = nonOverlapping.length >= count ? nonOverlapping : words.filter(w => w.id !== target.id)
  return pickRandom(pool, Math.min(count, pool.length))
    .map(w => ({ label: pickRandom(w.word, 1)[0], isCorrect: false }))
}

/**
 * Pick distractors from a string field across other words.
 */
function pickFieldDistractors(
  target: ProcessedWord,
  words: ProcessedWord[],
  field: 'chinese_translations' | 'english_synonyms',
  correctValue: string,
  count: number
): CardOption[] {
  const allOther = words
    .filter(w => w.id !== target.id)
    .flatMap(w => w[field])
    .filter(v => v !== correctValue)

  const uniqueOthers = [...new Set(allOther)]
  return pickRandom(uniqueOthers, Math.min(count, uniqueOthers.length))
    .map(v => ({ label: v, isCorrect: false }))
}

/**
 * Generate a quiz card for the given word and mode.
 */
export function generateCard(
  target: ProcessedWord,
  words: ProcessedWord[],
  mode: CardMode
): QuizCard {
  switch (mode) {
    case 'zh-to-en':
      return generateZhToEn(target, words)
    case 'en-to-zh':
      return generateEnToZh(target, words)
    case 'en-to-synonym':
      return generateEnToSynonym(target, words)
    case 'en-explanation-to-en':
      return generateEnExplanationToEn(target, words)
  }
}

/**
 * Chinese → English: show a Chinese meaning, pick the correct English word.
 * Distractors are words whose Chinese explanations don't overlap with the target's.
 */
function generateZhToEn(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = pickRandom(target.chinese_translations, 1)[0]
  const pickedWord = pickRandom(target.word, 1)[0]
  const correctOption: CardOption = { label: pickedWord, isCorrect: true }

  const distractors = pickWordDistractors(target, words, 'chinese_translations', 4)

  const options = shuffle([correctOption, ...distractors])
  const correctAnswer = pickedWord

  return { wordId: target.id, mode: 'zh-to-en', prompt, options, correctAnswer }
}

/**
 * English → Chinese: show the word, pick the correct Chinese meaning.
 */
function generateEnToZh(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = pickRandom(target.word, 1)[0]
  const correctAnswer = pickRandom(target.chinese_translations, 1)[0]
  const correctOption: CardOption = { label: correctAnswer, isCorrect: true }
  const distractors = pickFieldDistractors(target, words, 'chinese_translations', correctAnswer, 4)
  const options = shuffle([correctOption, ...distractors])

  return { wordId: target.id, mode: 'en-to-zh', prompt, options, correctAnswer }
}

/**
 * English → Synonym: show the word, pick the correct synonym.
 */
function generateEnToSynonym(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = pickRandom(target.word, 1)[0]
  const correctAnswer = pickRandom(target.english_synonyms, 1)[0]
  const correctOption: CardOption = { label: correctAnswer, isCorrect: true }
  const distractors = pickFieldDistractors(target, words, 'english_synonyms', correctAnswer, 4)
  const options = shuffle([correctOption, ...distractors])

  return { wordId: target.id, mode: 'en-to-synonym', prompt, options, correctAnswer }
}

/**
 * English Explanation → English: show an English definition, pick the correct English word.
 */
function generateEnExplanationToEn(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = pickRandom(target.english_explanations, 1)[0]
  const pickedWord = pickRandom(target.word, 1)[0]
  const correctOption: CardOption = { label: pickedWord, isCorrect: true }

  const distractors = pickWordDistractors(target, words, 'english_explanations', 4)

  const options = shuffle([correctOption, ...distractors])
  const correctAnswer = pickedWord

  return { wordId: target.id, mode: 'en-explanation-to-en', prompt, options, correctAnswer }
}

/**
 * Get the list of available card modes for a word.
 * Some modes may be unavailable (e.g. no synonyms).
 */
export function getAvailableModes(word: ProcessedWord): CardMode[] {
  const modes: CardMode[] = []
  if (word.chinese_translations.length > 0) {
    modes.push('zh-to-en', 'en-to-zh')
  }
  if (word.english_synonyms.length > 0) {
    modes.push('en-to-synonym')
  }
  if (word.english_explanations.length > 0) {
    modes.push('en-explanation-to-en')
  }
  return modes
}
