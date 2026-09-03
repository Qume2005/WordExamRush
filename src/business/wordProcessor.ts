import type { RawWord, ProcessedWord, RootInfo, SenseEntry } from '../types'

/**
 * Validate raw input. Returns null if valid, or an error message string.
 */
function validateRawInput(data: unknown): string | null {
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
    if (!Array.isArray(item.word) || item.word.length === 0 || !item.word.every((w: unknown) => typeof w === 'string' && w.trim())) {
      return `第 ${i + 1} 项缺少 word 字段（必须是非空字符串数组）`
    }
    if (!Array.isArray(item.english_synonyms)) {
      return `第 ${i + 1} 项缺少 english_synonyms 字段`
    }
    if (item.english_explanations !== undefined && !Array.isArray(item.english_explanations)) {
      return `第 ${i + 1} 项的 english_explanations 字段格式不正确`
    }
    if (item.roots !== undefined) {
      if (!Array.isArray(item.roots)) {
        return `第 ${i + 1} 项的 roots 字段格式不正确`
      }
      for (const r of item.roots) {
        if (!r || typeof r !== 'object' || typeof r.root !== 'string' || !r.root.trim() || typeof r.meaning !== 'string' || !r.meaning.trim()) {
          return `第 ${i + 1} 项的 roots 字段格式不正确`
        }
      }
    }
    if (!Array.isArray(item.chinese_translations) || item.chinese_translations.length === 0) {
      return `第 ${i + 1} 项缺少 chinese_translations 字段（必须是非空数组）`
    }
    if (item.example_sentences !== undefined) {
      return `第 ${i + 1} 项存在已废弃字段 example_sentences：例句请写在每条释义的 example 中`
    }
    for (let j = 0; j < item.chinese_translations.length; j++) {
      const sense = item.chinese_translations[j]
      if (!sense || typeof sense !== 'object') {
        return `第 ${i + 1} 项第 ${j + 1} 条释义格式不正确`
      }
      if (typeof sense.pos !== 'string' || !sense.pos.trim()) {
        return `第 ${i + 1} 项第 ${j + 1} 条释义缺少 pos 字段`
      }
      if (typeof sense.meaning !== 'string' || !sense.meaning.trim()) {
        return `第 ${i + 1} 项第 ${j + 1} 条释义缺少 meaning 字段`
      }
      if (typeof sense.english !== 'string' || !sense.english.trim()) {
        return `第 ${i + 1} 项第 ${j + 1} 条释义缺少 english 字段`
      }
      if (typeof sense.example !== 'string' || !sense.example.trim()) {
        return `第 ${i + 1} 项第 ${j + 1} 条释义缺少 example 字段`
      }
    }
    if (item.phonetic !== undefined && typeof item.phonetic !== 'string') {
      return `第 ${i + 1} 项的 phonetic 字段格式不正确`
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
 *  - chinese_translations: union (deduplicated by pos + meaning, keep first example)
 */
function mergeWords(raw: RawWord[]): ProcessedWord[] {
  const groups = new Map<string, RawWord[]>()

  for (const item of raw) {
    const key = item.word[0].trim().toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  const result: ProcessedWord[] = []
  let id = 0

  for (const [, items] of groups) {
    const wordVariants = new Set<string>()
    const synonyms = new Set<string>()
    const engExplanations = new Set<string>()
    const rootsMap = new Map<string, RootInfo>()
    let phonetic = ''
    const senses = new Map<string, SenseEntry>()

    for (const item of items) {
      if (!phonetic && typeof item.phonetic === 'string' && item.phonetic.trim()) {
        phonetic = item.phonetic.trim()
      }
      for (const w of item.word) {
        const trimmed = w.trim()
        if (trimmed) wordVariants.add(trimmed.toLowerCase())
      }
      for (const s of item.english_synonyms) {
        const trimmed = s.trim()
        if (trimmed) synonyms.add(trimmed.toLowerCase())
      }
      if (Array.isArray(item.english_explanations)) {
        for (const e of item.english_explanations) {
          const trimmed = e.trim()
          if (trimmed) engExplanations.add(trimmed)
        }
      }
      for (const sense of item.chinese_translations) {
        const key = sense.pos.trim() + '\u0000' + sense.meaning.trim()
        if (!senses.has(key)) {
          senses.set(key, sense)
        }
      }
      if (Array.isArray(item.roots)) {
        for (const r of item.roots) {
          const key = r.root.trim().toLowerCase()
          if (!rootsMap.has(key)) rootsMap.set(key, r)
        }
      }
    }

    result.push({
      id: id++,
      word: [...wordVariants],
      phonetic,
      english_synonyms: [...synonyms],
      english_explanations: [...engExplanations],
      chinese_translations: [...senses.values()],
      roots: [...rootsMap.values()],
    })
  }

  return result
}

/**
 * Parse JSON string, validate, and merge. Returns [result, error].
 * Accepts either a JSON string or an already-parsed array.
 */
export function parseAndProcess(input: string | unknown[]): [ProcessedWord[], string | null] {
  let data: unknown
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return [[], 'JSON 格式不正确，请检查输入']
    }
  } else {
    data = input
  }

  const error = validateRawInput(data)
  if (error) {
    return [[], error]
  }

  const processed = mergeWords(data as RawWord[])
  return [processed, null]
}
