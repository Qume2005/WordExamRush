import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const WORD_TABLE_DIR = 'public/word_table'

function validateWord(word, fileLabel) {
  if (!word || typeof word !== 'object') {
    throw new Error(`${fileLabel}: 每一项必须是对象`)
  }
  if (!Array.isArray(word.word) || word.word.length === 0 || !word.word.every(w => typeof w === 'string' && w.trim())) {
    throw new Error(`${fileLabel}: word 必须是非空字符串数组`)
  }
  if (!Array.isArray(word.english_synonyms)) {
    throw new Error(`${fileLabel}: english_synonyms 必须是数组`)
  }
  if (!Array.isArray(word.chinese_explanations) || word.chinese_explanations.length === 0) {
    throw new Error(`${fileLabel}: chinese_explanations 必须是非空数组`)
  }
  if (typeof word.example_sentences !== 'string') {
    throw new Error(`${fileLabel}: example_sentences 必须是字符串`)
  }
  if (word.english_explanations !== undefined && !Array.isArray(word.english_explanations)) {
    throw new Error(`${fileLabel}: english_explanations 必须是数组`)
  }
}

function validateFile(content, filePath) {
  let data
  try {
    data = JSON.parse(content)
  } catch {
    throw new Error(`${filePath}: JSON 格式不正确`)
  }
  if (!Array.isArray(data)) {
    throw new Error(`${filePath}: 根元素必须是数组`)
  }
  if (data.length === 0) {
    throw new Error(`${filePath}: 单词表不能为空`)
  }
  data.forEach((item, i) => validateWord(item, `${filePath}[${i}]`))
}

async function generateManifest() {
  const folders = new Map()
  const errors = []

  let entries
  try {
    entries = await readdir(WORD_TABLE_DIR, { withFileTypes: true })
  } catch {
    console.log('No word_table directory found, creating empty manifest')
    await writeFile(join(WORD_TABLE_DIR, 'manifest.json'), '[]')
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const jsonFiles = (await readdir(join(WORD_TABLE_DIR, entry.name)))
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b))

    const validFiles = []
    for (const f of jsonFiles) {
      const filePath = `${entry.name}/${f}`
      try {
        const content = await readFile(join(WORD_TABLE_DIR, filePath), 'utf-8')
        validateFile(content, filePath)
        validFiles.push(f.replace('.json', ''))
      } catch (e) {
        errors.push(e.message)
      }
    }

    if (validFiles.length > 0) {
      folders.set(entry.name, validFiles)
    }
  }

  const manifest = [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, files]) => ({ folder, files }))

  await writeFile(
    join(WORD_TABLE_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )

  console.log(`Generated manifest with ${manifest.length} folders`)
  if (errors.length > 0) {
    console.error(`\n${errors.length} validation error(s):`)
    errors.forEach(e => console.error(`  - ${e}`))
    process.exit(1)
  }
}

generateManifest()
