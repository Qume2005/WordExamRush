/** Morpheme breakdown entry (prefix/root/suffix) shown on the answer card */
export interface RootInfo {
  root: string
  meaning: string
}

/** 释义条目：词性 + 释义 + 该条英英释义 + 该条专属例句 */
export interface SenseEntry {
  pos: string
  meaning: string
  english: string
  example: string
}

/** Raw word from user JSON input */
export interface RawWord {
  word: string[]
  phonetic?: string
  english_synonyms: string[]
  english_explanations: string[]
  chinese_translations: SenseEntry[]
  roots?: RootInfo[]
}

/** Merged and normalized word */
export interface ProcessedWord {
  id: number
  word: string[]
  phonetic: string
  english_synonyms: string[]
  english_explanations: string[]
  chinese_translations: SenseEntry[]
  roots: RootInfo[]
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

/** 每个单词的进度容器：各题型各自独立记忆 */
export interface WordModeProgress {
  wordId: number
  modes: Partial<Record<CardMode, WordProgress>>
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
  chinese_translations: SenseEntry[]
  english_explanations: string[]
  appearances: number
  accuracy: number
  history: boolean[]
}

