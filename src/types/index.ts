/** Raw word from user JSON input */
export interface RawWord {
  word: string[]
  english_synonyms: string[]
  english_explanations: string[]
  chinese_explanations: string[]
  example_sentences: string
}

/** Merged and normalized word */
export interface ProcessedWord {
  id: number
  word: string[]
  english_synonyms: string[]
  english_explanations: string[]
  chinese_explanations: string[]
  example_sentences: string
}

/** Quiz card modes */
export type CardMode = 'zh-to-en' | 'en-to-zh' | 'en-to-synonym' | 'en-explanation-to-en'

/** One option displayed to the user */
export interface CardOption {
  label: string
  isCorrect: boolean
}

/** A fully generated quiz card */
export interface QuizCard {
  wordId: number
  mode: CardMode
  prompt: string
  options: CardOption[]
  correctAnswer: string
}

/** Per-word progress tracking */
export interface WordProgress {
  wordId: number
  appearances: number
  correctCount: number
  history: boolean[]  // true = correct, false = wrong
}

/** Result of a user's answer */
export interface AnswerResult {
  card: QuizCard
  isCorrect: boolean
  selectedIndex: number
  correctIndex: number
}

/** Row in the end-of-quiz summary */
export interface SummaryRow {
  word: string[]
  chinese_explanations: string[]
  english_explanations: string[]
  appearances: number
  accuracy: number
  history: boolean[]
}

/** Top-level screen phase */
export type ScreenPhase = 'input' | 'quiz' | 'summary'
