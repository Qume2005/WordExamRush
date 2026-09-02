/**
 * quizEngine 影响矩阵与按题型进度自检
 * 运行：pnpm dlx tsx scripts/quiz-engine-check.ts（任何断言失败即抛错退出非零）
 */
import {
  createProgressMap,
  createNextCard,
  recordAnswer,
  selectNextWord,
  isQuizComplete,
} from '../src/business/quizEngine'
import type { ProcessedWord, CardMode, QuizCard } from '../src/types'

function check(cond: unknown, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

function eq(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`FAIL: ${msg} (actual=${a}, expected=${e})`)
}

function fakeWord(id: number, word: string): ProcessedWord {
  return {
    id,
    word: [word],
    phonetic: '',
    english_synonyms: ['syn-' + word],
    english_explanations: ['expl of ' + word],
    chinese_translations: ['中文' + word],
    example_sentences: '',
    roots: [],
  }
}

const words = [fakeWord(0, 'apple'), fakeWord(1, 'banana'), fakeWord(2, 'cherry')]
const map = createProgressMap(words)

// 每个可用题型都有独立条目
const entry0 = map.get(0)!
eq(Object.keys(entry0.modes).sort(), [
  'en-explanation-to-en', 'en-to-synonym', 'en-to-zh', 'zh-to-en',
], 'per-mode entries created')

function answer(wordId: number, mode: CardMode, isCorrect: boolean): void {
  const card = createNextCard(wordId, words, map) as QuizCard
  card.mode = mode
  recordAnswer(map, { card, isCorrect, selectedIndex: 0, correctIndex: 0 })
}

// 答对 zh-to-en：本题型满记，其他题型按权重吃进（history 只记本题型）
answer(0, 'zh-to-en', true)
const m = map.get(0)!.modes
eq(m['zh-to-en']!.appearances, 1, 'own appearances')
eq(m['zh-to-en']!.correctCount, 1, 'own correctCount')
eq(m['zh-to-en']!.history, [true], 'own history')
eq(m['en-explanation-to-en']!.appearances, 0.8, 'recall sibling weight')
eq(m['en-explanation-to-en']!.correctCount, 0.8, 'recall sibling correct')
eq(m['en-explanation-to-en']!.history, [], 'sibling history untouched')
eq(m['en-to-zh']!.appearances, 0.5, 'recognition weight')
eq(m['en-to-synonym']!.appearances, 0.4, 'synonym weight')

// 答错 en-to-zh：只记本题型，不牵连其他题型
const recallBefore = m['en-explanation-to-en']!.appearances
answer(0, 'en-to-zh', false)
eq(m['en-to-zh']!.appearances, 1.5, 'wrong adds own appearance')
eq(m['en-to-zh']!.correctCount, 0.5, 'wrong keeps prior correct')
eq(m['en-to-zh']!.history, [false], 'wrong history')
eq(m['en-explanation-to-en']!.appearances, recallBefore, 'wrong does not spill')

// createNextCard 只出未达标题型（新词各题型并列 0 次，池含全部可用题型）
const freshCard = createNextCard(1, words, map) as QuizCard
check(['zh-to-en', 'en-to-zh', 'en-to-synonym', 'en-explanation-to-en'].includes(freshCard.mode),
  'fresh word card mode available')

// 单词所有题型达标后才算完成、不再被选中
for (const p of Object.values(map.get(2)!.modes)) { p!.appearances = 3; p!.correctCount = 3 }
check(!isQuizComplete(map), 'incomplete words remain')
const picked = selectNextWord(map, words)
check(picked === 0 || picked === 1, 'complete word not selected')

for (const p of Object.values(map.get(0)!.modes)) { p!.appearances = 3; p!.correctCount = 3 }
for (const p of Object.values(map.get(1)!.modes)) { p!.appearances = 3; p!.correctCount = 3 }
check(isQuizComplete(map), 'all complete')
eq(selectNextWord(map, words), null, 'selection exhausted')

console.log('quiz-engine-check: all assertions passed')
