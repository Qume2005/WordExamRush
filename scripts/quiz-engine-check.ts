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
import { generateCard } from '../src/business/cardGenerator'
import { parseAndProcess } from '../src/business/wordProcessor'
import { formatSenseGroups, groupSenses } from '../src/utils/sense'
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
    chinese_translations: [{ pos: 'n.', meaning: '中文' + word, english: 'English definition of ' + word + '.', example: 'Example of ' + word + '.' }],
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

// generateCard zh-to-en prompt 以词性开头
const zhCard = generateCard(words[0], words, 'zh-to-en')
check(/^(?:n|v|adj|adv|prep|conj|pron|det|excl)\. /.test(zhCard.prompt), 'zh-to-en prompt starts with pos.')

// generateCard en-to-zh options：无重复标签，含 correctAnswer，干扰项 ≠ correctAnswer
const enCard = generateCard(words[0], words, 'en-to-zh')
const labels = enCard.options.map(o => o.label)
eq(new Set(labels).size, labels.length, 'en-to-zh options have no duplicate labels')
check(labels.includes(enCard.correctAnswer), 'en-to-zh options include correctAnswer')
for (const o of enCard.options) {
  check(o.isCorrect || o.label !== enCard.correctAnswer, 'en-to-zh distractor !== correctAnswer')
}

// parseAndProcess 接受新 schema，拒绝旧 flat 数组和废弃字段 example_sentences
const newSchemaSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: [{ pos: 'n.', meaning: '测试', english: 'a test', example: 'Example of test.' }],
  }
]
const [newOk, newErr] = parseAndProcess(newSchemaSample)
check(newErr === null, 'parseAndProcess accepts new-schema sample')
eq(newOk[0].chinese_translations[0].pos, 'n.', 'new-schema pos preserved')

const flatSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: ['放弃'],
  }
]
const [, flatErr] = parseAndProcess(flatSample)
check(flatErr !== null, 'parseAndProcess rejects flat-array sample')

const deprecatedSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: [{ pos: 'n.', meaning: '测试', example: 'Example of test.' }],
    example_sentences: 'This is a test.',
  }
]
const [, depErr] = parseAndProcess(deprecatedSample)
check(depErr !== null && depErr.includes('example_sentences'), 'parseAndProcess rejects example_sentences')

// parseAndProcess 拒绝缺少 english 字段的释义
const missingEnglishSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: [{ pos: 'n.', meaning: '测试', example: 'Example of test.' }],
  }
]
const [, missingEnglishErr] = parseAndProcess(missingEnglishSample)
check(missingEnglishErr !== null && missingEnglishErr.includes('缺少 english 字段'), 'parseAndProcess rejects missing english')

// parseAndProcess 接受包含 english 的完整 4 字段释义
const fullSenseSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: [{ pos: 'n.', meaning: '测试', english: 'a test', example: 'Example of test.' }],
  }
]
const [fullOk, fullErr] = parseAndProcess(fullSenseSample)
check(fullErr === null, 'parseAndProcess accepts full 4-field sense')
eq(fullOk[0].chinese_translations[0].english, 'a test', 'english field preserved')

// parseAndProcess 相同 headword + 相同 (pos+meaning) 但不同 example → 合并为 1 条，保留首个 example
const mergeSample = [
  {
    word: ['test'],
    english_synonyms: ['exam'],
    english_explanations: ['a trial'],
    chinese_translations: [
      { pos: 'n.', meaning: '测试', english: 'a test', example: 'First example.' },
    ],
  },
  {
    word: ['test'],
    english_synonyms: ['exam2'],
    english_explanations: ['a trial2'],
    chinese_translations: [
      { pos: 'n.', meaning: '测试', english: 'a test', example: 'Second example.' },
    ],
  },
]
const [mergeResult, mergeErr] = parseAndProcess(mergeSample)
check(mergeErr === null, 'parseAndProcess merges duplicate senses')
eq(mergeResult[0].chinese_translations.length, 1, 'merged to 1 sense')
eq(mergeResult[0].chinese_translations[0].example, 'First example.', 'first example kept')

// groupSenses：相邻且 pos/english/example 全同的释义归并为一组（thylacine 场景）
const thylacineSenses = [
  { pos: 'n.', meaning: '袋狼', english: 'EN1', example: 'EX1' },
  { pos: 'n.', meaning: '塔斯马尼亚虎', english: 'EN1', example: 'EX1' },
]
eq(groupSenses(thylacineSenses), [
  { pos: 'n.', english: 'EN1', example: 'EX1', meanings: ['袋狼', '塔斯马尼亚虎'] },
], 'groupSenses merges consecutive identical pos/english/example')

// 非相邻的相同条目不归并，保持独立两组
const nonAdjacentSenses = [
  { pos: 'n.', meaning: '甲', english: 'EN1', example: 'EX1' },
  { pos: 'n.', meaning: '乙', english: 'EN2', example: 'EX2' },
  { pos: 'n.', meaning: '丙', english: 'EN1', example: 'EX1' },
]
eq(groupSenses(nonAdjacentSenses).length, 3, 'non-adjacent identical senses stay separate')

// example 不同则拆组，即使 pos/english 相同
const differingExampleSenses = [
  { pos: 'v.', meaning: '放弃', english: 'EN1', example: 'EX1' },
  { pos: 'v.', meaning: '遗弃', english: 'EN1', example: 'EX2' },
]
eq(groupSenses(differingExampleSenses).length, 2, 'differing example splits groups')

// formatSenseGroups：组内中文释义用全角斜杠连接，组间用 sep
eq(formatSenseGroups(groupSenses(thylacineSenses), '；'), 'n. 袋狼／塔斯马尼亚虎', 'formatSenseGroups joins meanings with full-width slash')

console.log('quiz-engine-check: all assertions passed')
