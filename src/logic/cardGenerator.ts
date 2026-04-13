import type { ProcessedWord, CardMode, QuizCard, CardOption } from '../types'
import { shuffle, pickRandom } from './shuffle'

/**
 * Generate a quiz card for the given word and mode.
 */
export function generateCard(
  wordId: number,
  words: ProcessedWord[],
  mode: CardMode
): QuizCard {
  const target = words.find(w => w.id === wordId)
  if (!target) throw new Error(`Word with id ${wordId} not found`)

  switch (mode) {
    case 'zh-to-en':
      return generateZhToEn(target, words)
    case 'en-to-zh':
      return generateEnToZh(target, words)
    case 'en-to-synonym':
      return generateEnToSynonym(target, words)
  }
}

/**
 * Chinese → English: show a Chinese meaning, pick the correct English word.
 * Distractors are words whose Chinese explanations don't overlap with the target's.
 */
function generateZhToEn(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = pickRandom(target.chinese_explanations, 1)[0]
  const correctOption: CardOption = { label: target.word, isCorrect: true }

  const targetExplanations = new Set(target.chinese_explanations)
  const nonOverlapping = words.filter(
    w => w.id !== target.id && !w.chinese_explanations.some(e => targetExplanations.has(e))
  )

  const distractorPool = nonOverlapping.length >= 4
    ? nonOverlapping
    : words.filter(w => w.id !== target.id)

  const distractors: CardOption[] = pickRandom(distractorPool, Math.min(4, distractorPool.length))
    .map(w => ({ label: w.word, isCorrect: false }))

  const options = shuffle([correctOption, ...distractors])
  const correctAnswer = target.word

  return { wordId: target.id, mode: 'zh-to-en', prompt, options, correctAnswer }
}

/**
 * English → Chinese: show the word, pick the correct Chinese meaning.
 */
function generateEnToZh(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = target.word
  const correctExplanation = pickRandom(target.chinese_explanations, 1)[0]
  const correctOption: CardOption = { label: correctExplanation, isCorrect: true }

  const allOtherExplanations = words
    .filter(w => w.id !== target.id)
    .flatMap(w => w.chinese_explanations)
    .filter(e => e !== correctExplanation)

  const uniqueOthers = [...new Set(allOtherExplanations)]
  const distractors: CardOption[] = pickRandom(uniqueOthers, Math.min(4, uniqueOthers.length))
    .map(e => ({ label: e, isCorrect: false }))

  const options = shuffle([correctOption, ...distractors])
  const correctAnswer = correctExplanation

  return { wordId: target.id, mode: 'en-to-zh', prompt, options, correctAnswer }
}

/**
 * English → Synonym: show the word, pick the correct synonym.
 */
function generateEnToSynonym(target: ProcessedWord, words: ProcessedWord[]): QuizCard {
  const prompt = target.word
  const correctSynonym = pickRandom(target.english_synonyms, 1)[0]
  const correctOption: CardOption = { label: correctSynonym, isCorrect: true }

  const allOtherSynonyms = words
    .filter(w => w.id !== target.id)
    .flatMap(w => w.english_synonyms)
    .filter(s => s !== correctSynonym)

  const uniqueOthers = [...new Set(allOtherSynonyms)]
  const distractors: CardOption[] = pickRandom(uniqueOthers, Math.min(4, uniqueOthers.length))
    .map(s => ({ label: s, isCorrect: false }))

  const options = shuffle([correctOption, ...distractors])
  const correctAnswer = correctSynonym

  return { wordId: target.id, mode: 'en-to-synonym', prompt, options, correctAnswer }
}

/**
 * Get the list of available card modes for a word.
 * Some modes may be unavailable (e.g. no synonyms).
 */
export function getAvailableModes(word: ProcessedWord): CardMode[] {
  const modes: CardMode[] = []
  if (word.chinese_explanations.length > 0) {
    modes.push('zh-to-en', 'en-to-zh')
  }
  if (word.english_synonyms.length > 0) {
    modes.push('en-to-synonym')
  }
  return modes
}
