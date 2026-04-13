import type { RawWord, ProcessedWord } from '../types'

/**
 * Validate raw input. Returns null if valid, or an error message string.
 */
export function validateRawInput(data: unknown): string | null {
  if (!Array.isArray(data)) {
    return '输入必须是一个 JSON 数组'
  }
  if (data.length === 0) {
    return '单词表不能为空'
  }
  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    if (!item || typeof item !== 'object') {
      return `第 ${i + 1} 项不是有效的对象`
    }
    if (typeof item.word !== 'string' || !item.word.trim()) {
      return `第 ${i + 1} 项缺少 word 字段`
    }
    if (!Array.isArray(item.english_synonyms)) {
      return `第 ${i + 1} 项缺少 english_synonyms 字段`
    }
    if (!Array.isArray(item.chinese_explanations)) {
      return `第 ${i + 1} 项缺少 chinese_explanations 字段`
    }
    if (typeof item.example_sentences !== 'string') {
      return `第 ${i + 1} 项缺少 example_sentences 字段`
    }
  }
  return null
}

/**
 * Merge duplicate words. Two words are duplicates if their
 * word field is identical after lowercase + trim.
 *
 * Merge strategy:
 *  - english_synonyms: union (deduplicated)
 *  - chinese_explanations: union (deduplicated)
 *  - example_sentences: concatenate with " | "
 */
export function mergeWords(raw: RawWord[]): ProcessedWord[] {
  const groups = new Map<string, RawWord[]>()

  for (const item of raw) {
    const key = item.word.trim().toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  const result: ProcessedWord[] = []
  let id = 0

  for (const [, items] of groups) {
    const synonyms = new Set<string>()
    const explanations = new Set<string>()
    const sentences: string[] = []

    for (const item of items) {
      for (const s of item.english_synonyms) {
        const trimmed = s.trim()
        if (trimmed) synonyms.add(trimmed.toLowerCase())
      }
      for (const e of item.chinese_explanations) {
        const trimmed = e.trim()
        if (trimmed) explanations.add(trimmed)
      }
      const trimmed = item.example_sentences.trim()
      if (trimmed) sentences.push(trimmed)
    }

    result.push({
      id: id++,
      word: items[0].word.trim().toLowerCase(),
      english_synonyms: [...synonyms],
      chinese_explanations: [...explanations],
      example_sentences: sentences.join(' | '),
    })
  }

  return result
}

/**
 * Parse JSON string, validate, and merge. Returns [result, error].
 */
export function parseAndProcess(json: string): [ProcessedWord[], string | null] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return [[], 'JSON 格式不正确，请检查输入']
  }

  const error = validateRawInput(data)
  if (error) {
    return [[], error]
  }

  const processed = mergeWords(data as RawWord[])
  return [processed, null]
}
