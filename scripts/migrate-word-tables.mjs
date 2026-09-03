#!/usr/bin/env node
/**
 * 词典富化迁移脚本：把 17 张旧格式词表（chinese_translations: string[] + example_sentences）
 * 迁移为新 schema（chinese_translations: {pos, meaning, example}[]，删除 example_sentences）。
 *
 * 用法：
 *   node scripts/migrate-word-tables.mjs --dict "<mdx路径>"              # dry-run：只写报告 + preview，不碰 public/
 *   node scripts/migrate-word-tables.mjs --dict "<mdx路径>" --apply      # 落盘：改写 public/ 下的词表 JSON
 *   node scripts/migrate-word-tables.mjs --dict "<mdx路径>" --probe <词>  # 探查模式：打印词典原始 HTML
 *
 * 词典路径只通过 --dict 传入，绝不硬编码、绝不复制进仓库。
 *
 * =====================================================================
 * 词典 HTML 解析规则（由 --probe 实测牛津高阶第9版 MDX 后固化）：
 * =====================================================================
 * 1. lookup 返回 { keyText, definition }；definition 为空字符串 = 未命中。
 * 2. definition 以 "@@@LINK=" 开头 = 跳转词条。链接词可能带占位槽
 *    （"turn to sb/sth"、"pay sth↔off"、"saddle sb/yourself with sth"），
 *    ↔ 是反向可交换标记。策略：对子集逐个尝试（保持原顺序、长度优先、剔除
 *    sb/sth/yourself 等占位词），第一个有正文（非 @@@LINK、非空）的候选生效；
 *    "turn to" 这类整词本身就是合法键，子集法天然覆盖。
 * 3. 词条结构：顶层 `<div class="cixing_part">` 按词性分区（verb/noun…），
 *    每区 subentry-g > top-g 内有唯一的 `<pos-g><pos>…</pos></pos-g>`；
 *    义项在 `<sn-gs>`（含 `<sn-g>`）内，另有 idm-gs-blk（习语）、pv-gs-blk
 *    （短语动词）两个特殊块，其内 sn-g 结构一致。因此"每个 sn-g 的词性 =
 *    所在 cixing_part 的 top-g > pos-g"——不在 sn-g 内重复查询。
 * 4. `<pos>` 文本是全称（verb/noun/adjective/adverb/preposition/conjunction/
 *    pronoun/determiner/exclamation），需映射为牛津缩写（n./v./adj./adv./
 *    prep./conj./pron./det./excl.）。复合词性 "linking verb"/"modal verb"/
 *    "auxiliary verb"/"infinitive marker" 处理为 Oxford 官方缩写 "modal v." /
 *    "auxiliary v." / "link v." / "infinitive marker"，其余非常见词性（如
 *    "definite article"/"number"/"ordinal number"）不进核心集 → 该 sn-g 不参与
 *    词典匹配（防垃圾词性）。
 * 5. 中文释义 = `<def>` 内嵌的 `<chn>`（def 全文含英文释义 + 中文释义）。
 * 6. 例句 = 义项内所有 `<x>` 节点。双解例句结构：英文部分 + 可选 `<chn>` 子节点
 *    （中文翻译）+ 常见双空格分隔。剥除 chn 子节点、剔除首部短语型示例
 *    （x 内不含 a/chn 子元素且 def 含 chn 时，x 是英文释义搭配展示），
 *    之后必须含拉丁字母才可用。
 * =====================================================================
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as cheerio from 'cheerio'

const require = createRequire(import.meta.url)
const { MDX } = require('js-mdict')

// ---------- CLI ----------
const args = process.argv.slice(2)
function getFlag(name) {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? '')
}
const DICT_PATH = getFlag('--dict')
const APPLY = args.includes('--apply')
const PROBE = getFlag('--probe')

const WORD_TABLE_DIR = path.resolve('public/word_table')
const EVIDENCE_DIR = path.resolve('.omo/evidence')
const PREVIEW_DIR = path.join(EVIDENCE_DIR, 'preview')
const REPORT_PATH = path.join(EVIDENCE_DIR, 'migration-report.md')

// ---------- 词典访问 ----------
let dict = null
function openDict() {
  if (!DICT_PATH) {
    console.error('缺少 --dict <mdx路径>')
    process.exit(2)
  }
  if (!fs.existsSync(DICT_PATH)) {
    console.error(`词典文件不存在: ${DICT_PATH}`)
    process.exit(2)
  }
  try {
    // js-mdict 是 CJS 包，必须走 createRequire 默认导出互操作
    dict = new MDX(DICT_PATH)
  } catch (e) {
    console.error(`词典加载失败（MDX 可能加密/损坏）：${e.message}`)
    process.exit(3)
  }
  if (!dict || typeof dict.lookup !== 'function') {
    console.error('词典加载结果异常（MDX 可能加密/损坏），已停止。')
    process.exit(3)
  }
}

const lookupCache = new Map()
function rawLookup(word) {
  if (lookupCache.has(word)) return lookupCache.get(word)
  let def = ''
  try {
    const r = dict.lookup(word)
    def = r && typeof r === 'object' && r.definition ? String(r.definition) : ''
  } catch {
    def = ''
  }
  lookupCache.set(word, def)
  return def
}

/** @@@LINK 链接词归一化：子集枚举（保序、剔占位词、长优先），首个有正文的候选生效 */
const LINK_SLOT_RE = /^(sb|sth|sb's|sth's|yourself|oneself|himself|herself|itself|themselves|each|other|one|another|wh-)$/i
function resolveEntry(word, depth = 0) {
  if (depth > 2) return ''
  let def = rawLookup(word)
  if (!def.startsWith('@@@LINK=')) return def
  const target = def
    .slice(8)
    .replace(/[\r\n\u0000]/g, '')
    .trim()
    .replace(/↔/g, ' ')
  const toks = target.split(/\s+/).filter(Boolean)
  const cands = []
  for (let mask = 1; mask < (1 << toks.length); mask++) {
    const joined = toks
      .filter((_, i) => mask & (1 << i))
      .filter((w) => !LINK_SLOT_RE.test(w))
      .join(' ')
      .trim()
    if (joined) cands.push(joined)
  }
  cands.sort((a, b) => b.split(' ').length - a.split(' ').length)
  for (const c of cands) {
    const d2 = rawLookup(c)
    if (d2 && !d2.startsWith('@@@LINK=')) return d2
    if (d2.startsWith('@@@LINK=') && depth < 2) {
      const d3 = resolveEntry(c, depth + 1)
      if (d3) return d3
    }
  }
  return ''
}

// ---------- 词性体系 ----------
const POS_MAP = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  preposition: 'prep.',
  conjunction: 'conj.',
  pronoun: 'pron.',
  determiner: 'det.',
  exclamation: 'excl.',
  'modal verb': 'modal v.',
  'auxiliary verb': 'auxiliary v.',
  'linking verb': 'link v.',
}
const CORE_POS = new Set(['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'det.', 'excl.'])
// 允许写入的完整白名单：核心集 + 复合词性的官方缩写
const ALLOWED_POS = new Set([...CORE_POS, 'modal v.', 'auxiliary v.', 'link v.'])
// 双词性同义项（如 "adj. & adv."）——按牛津排版拆开时取第一个可用的
// 校验用：^[a-z]+\. 前缀体系，允许空格复合形（n. / modal v. / link v. / auxiliary v.）
// 真正的门禁是随后的 ALLOWED_POS 白名单，此正则只挡非牛津缩写形状。
const POS_WHOLE_RE = /^([a-z]+ )*[a-z]+\.$/
function toOxfordAbbr(posText) {
  const t = posText.trim().toLowerCase()
  const direct = POS_MAP[t]
  if (direct) return direct
  // "adjective & adverb" 之类：切分后再映射
  const parts = t.split(/\s*(?:&|,|\/)\s*/)
  if (parts.length > 1) {
    const mapped = parts.map((p) => POS_MAP[p.trim()]).filter(Boolean)
    if (mapped.length) return mapped[0]
  }
  return null // 非白名单词性 → 回退，绝不原样写入
}

// ---------- 词条解析 ----------
function textOf($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim()
}

/** 英文例句提取：剥除 chn（中文翻译）子节点；剔除无英文的短语型 x */
function extractEnglishExample($, xEl) {
  const html = $(xEl).html()
  if (!html) return ''
  const $2 = cheerio.load(html)
  $2('chn').remove()
  const t = $2.root().text().replace(/\s+/g, ' ').trim()
  if (!/[a-zA-Z]/.test(t)) return ''
  return t
}

/** 解析一个词条 HTML → [{pos, chinese, examples}]；解析失败返回 [] */
function parseEntryHTML(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  $('head').remove()
  // pos 解析：sn-g 自身 direct pos-g（go 的 linking verb 义项）→ 否则向上逐层找
  // ① 层级节点 direct pos-g；② 层级节点 direct top-g（entail 的 pos-g 藏在
  // top-g > pron 里；abandon 的在 top-g > pos-g）。到 body 即止，防止串到
  // 其他词条区块。
  const posOfSg = (sg) => {
    // sg 可能是 cheerio 包装对象（.parent 是函数）或原始 DOM 节点（.parent 是属性）。
    // 必须先解包成原始节点，保证 .parent 走属性语义，否则祖先链遍历失效，
    // 所有非自带 pos-g 的义项都会拿空词性（0 命中根因）。
    const node = sg.tagName ? sg : sg.get(0)
    if (!node) return ''
    const own = $(node).children('pos-g').first().text().trim()
    if (own) return own
    let cur = node.parent
    while (cur && cur.type === 'tag' && cur.tagName !== 'body') {
      const directPos = $(cur).children('pos-g').first().text().trim()
      if (directPos) return directPos
      // 层级节点 direct top-g（entail 的 pos-g 藏在 top-g > pron 里）
      const topGs = $(cur).children('top-g').toArray()
      for (const tg of topGs) {
        const t = $(tg).find('pos').first().text().trim()
        if (t) return t
      }
      cur = cur.parent
    }
    return ''
  }
  const senses = []
  $('sn-g').each((_, sg) => {
    const posAbbr = toOxfordAbbr(posOfSg($(sg)))
    const defEl = $(sg).find('def').first()
    if (!defEl.length) return
    const defText = textOf($, defEl)
    const chnInsideDef = $(sg).find('def > chn').first().text().trim()
    // 中文释义：优先 def > chn；否则 def 全文中的 CJK 连续段
    let chinese = chnInsideDef || ''
    if (!chinese) {
      const m = defText.match(/[\u4e00-\u9fff][^a-zA-Z]*$/)
      chinese = m ? m[0].trim() : ''
    }
    const examples = []
    $(sg)
      .find('x')
      .each((___, xEl) => {
        const e = extractEnglishExample($, xEl)
        if (e) examples.push(e)
      })
    senses.push({ pos: posAbbr, chinese, examples })
  })
  return senses.filter((s) => s.chinese) // 无中文释义的义项不参与匹配
}

// ---------- 回退推断 ----------
function inferPosFromEnglish(englishExplanations, wordText) {
  const ee = (englishExplanations || []).map((e) => String(e).toLowerCase())
  const text = ee.join(' ')
  const first = (ee[0] || '').trim()
  if (/^(to|used to)\b/.test(first)) return 'v.'
  if (/^(a|an|the)\b/.test(first)) return 'n.'
  if (/^(relating to|connected with|having the quality of|full of|of or relating)/.test(first)) return 'adj.'
  if (/^in a .* way/.test(first)) return 'adv.'
  // 复用 english_explanations 之外的辅助信号：词本身
  if (/ing$/.test(wordText) && /used to describe|describing/.test(text)) return 'adj.'
  if (/ly$/.test(wordText)) return 'adv.'
  if (/^(be|being)\b/.test(first)) return 'v.'
  return 'n.'
}

// ---------- 富化核心 ----------
const CJK_RE = /[\u4e00-\u9fff]/
const LATIN_RE = /[a-zA-Z]/

function isSenseMatch(dictSense, meaning) {
  const m = meaning.replace(/\s+/g, '')
  const d = dictSense.chinese.replace(/\s+/g, '')
  if (!m || !d) return false
  return d.includes(m) || m.includes(d)
}

/**
 * 对单个词项做富化。
 * 返回 { source: 'oxford'|'fallback', senses: [{pos, meaning, example, senseSource}] }
 */
function enrichWordItem(item) {
  const headword = item.word[0] || ''
  // 数据里存在前后带空格的释义（如 " prestigious"）；trim 是健全性断言的前提
  // 个别词条的某条释义本身就是英文词（如 prestigious 表里的 "prestigious"），
  // 富化语义要求词典匹配按中文进行——该条与任何词典中文释义都无法包含匹配，
  // 走回退推断；若回退推断也救不了（意义非空即通过），meaning 仍无 CJK →
  // 健全性断言会中止。此处把这些纯英文释义条目直接剔除（等价于无此条）。
  const meanings = (item.chinese_translations || [])
    .map((m) => String(m).trim())
    .filter((m) => m && CJK_RE.test(m))
  const oldExample = (item.example_sentences || '').trim()

  let senses = null
  let source = 'fallback'
  if (headword && dict) {
    const html = resolveEntry(headword)
    const dictSenses = parseEntryHTML(html)
    if (dictSenses.length) {
      const out = []
      for (const meaning of meanings) {
        const matched = dictSenses.find((s) => isSenseMatch(s, meaning))
        if (matched && matched.pos && matched.examples.length) {
          out.push({ pos: matched.pos, meaning, example: matched.examples[0], senseSource: 'oxford' })
        } else if (matched && matched.pos) {
          out.push({ pos: matched.pos, meaning, example: oldExample, senseSource: 'oxford' })
        } else if (matched) {
          out.push({ pos: inferPosFromEnglish(item.english_explanations, headword), meaning, example: oldExample, senseSource: 'fallback' })
        } else {
          out.push({
            pos: inferPosFromEnglish(item.english_explanations, headword),
            meaning,
            example: oldExample,
            senseSource: 'fallback',
          })
        }
      }
      senses = out
      source = out.some((s) => s.senseSource === 'oxford') ? 'oxford' : 'fallback'
    }
  }

  // 整词零命中 / 零匹配 → 全量回退。注意：词典命中但所有义项都无例句（x 元素
  // 缺失，牛津条目对部分专业词只给释义不给例句）不算零匹配——pos 已来自词典，
  // 例句复用旧 example_sentences 即可，词性统计上仍计入 oxford。
  if (!senses) {
    const pos = inferPosFromEnglish(item.english_explanations, headword)
    senses = meanings.map((meaning) => ({ pos, meaning, example: oldExample, senseSource: 'fallback' }))
    source = 'fallback'
  }

  // (pos+meaning) 去重，保首条
  const seen = new Set()
  const deduped = []
  for (const s of senses) {
    const key = `${s.pos}\u0000${s.meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ pos: s.pos, meaning: s.meaning, example: s.example })
  }
  return { source, senses: deduped }
}

// ---------- 健全性断言 ----------
function assertSenseOk(item, sense) {
  const label = `${item.word.join('/')}`
  if (!CJK_RE.test(sense.meaning)) throw new Error(`健全性断言失败（meaning 无中文）: ${label} → ${JSON.stringify(sense)}`)
  if (!LATIN_RE.test(sense.example)) throw new Error(`健全性断言失败（example 无英文）: ${label} → ${JSON.stringify(sense)}`)
  if (!POS_WHOLE_RE.test(sense.pos)) throw new Error(`健全性断言失败（pos 格式非法）: ${label} → ${JSON.stringify(sense)}`)
  if (!ALLOWED_POS.has(sense.pos)) throw new Error(`健全性断言失败（pos 不在白名单）: ${label} → ${JSON.stringify(sense)}`)
}

// ---------- 文件遍历 ----------
function listWordTableFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.json') && e.name !== 'manifest.json') out.push(p)
    }
  }
  walk(WORD_TABLE_DIR)
  return out.sort()
}

// ---------- 幂等保护 ----------
function isAlreadyMigrated(data) {
  return Array.isArray(data) && data.length > 0 && data.every((it) => it && typeof it === 'object' && it.example_sentences === undefined)
}

// ---------- probe 模式 ----------
function runProbe(word) {
  openDict()
  console.log(`### probe: ${word}`)
  const raw = rawLookup(word)
  if (!raw) {
    console.log('（未命中）')
    return
  }
  if (raw.startsWith('@@@LINK=')) {
    const target = raw.slice(8).replace(/[\r\n\u0000]/g, '').trim()
    console.log(`@@@LINK -> ${target}`)
    const resolved = resolveEntry(word)
    console.log(`（跟随链接${resolved ? '成功' : '失败'}）`)
    console.log(resolved || '（链接目标也无正文）')
    return
  }
  console.log(raw)
}

// ---------- 主流程 ----------
function migrateData(data) {
  const perWord = []
  let oxfordCount = 0
  for (const item of data) {
    const { source, senses } = enrichWordItem(item)
    for (const s of senses) assertSenseOk(item, s)
    const newItem = {
      word: item.word,
      ...(item.phonetic !== undefined ? { phonetic: item.phonetic } : {}),
      english_synonyms: item.english_synonyms,
      english_explanations: item.english_explanations,
      chinese_translations: senses,
      ...(item.roots !== undefined ? { roots: item.roots } : {}),
    }
    perWord.push({
      word: item.word.join('/'),
      source,
      senses: senses.map((s) => ({ pos: s.pos, meaning: s.meaning })),
      count: senses.length,
    })
    if (source === 'oxford') oxfordCount++
    item.__migrated = newItem
  }
  return { perWord, oxfordCount }
}

async function main() {
  if (PROBE) {
    runProbe(PROBE)
    return
  }
  openDict()

  const files = listWordTableFiles()
  if (!files.length) {
    console.error('未找到任何词表 JSON')
    process.exit(1)
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  if (!APPLY) fs.mkdirSync(PREVIEW_DIR, { recursive: true })

  const report = []
  const fileStats = []
  let totalWords = 0
  let totalOxford = 0

  for (const filePath of files) {
    const rel = path.relative(WORD_TABLE_DIR, filePath)
    const content = await fsp.readFile(filePath, 'utf-8')
    let data
    try {
      data = JSON.parse(content)
    } catch {
      throw new Error(`JSON 解析失败: ${rel}`)
    }
    if (APPLY && isAlreadyMigrated(data)) {
      console.error(`幂等保护：${rel} 已是新格式（不含 example_sentences），--apply 拒绝运行`)
      process.exit(4)
    }

    const { perWord, oxfordCount } = migrateData(data)
    totalWords += perWord.length
    totalOxford += oxfordCount

    // pos 分布统计
    const posDist = {}
    for (const w of perWord) for (const s of w.senses) posDist[s.pos] = (posDist[s.pos] || 0) + 1

    const outData = data.map((it) => it.__migrated)
    for (const it of data) delete it.__migrated

    if (APPLY) {
      await fsp.writeFile(filePath, JSON.stringify(outData, null, 2) + '\n', 'utf-8')
    } else {
      const previewPath = path.join(PREVIEW_DIR, rel)
      fs.mkdirSync(path.dirname(previewPath), { recursive: true })
      await fsp.writeFile(previewPath, JSON.stringify(outData, null, 2) + '\n', 'utf-8')
    }

    fileStats.push({ rel, words: perWord.length, oxford: oxfordCount, posDist })
    report.push({ rel, perWord })
    console.log(`  ${rel}: ${perWord.length} 词，oxford 命中 ${oxfordCount}`)
  }

  // ---------- 报告 ----------
  const posDistTotal = {}
  for (const f of fileStats) for (const [k, v] of Object.entries(f.posDist)) posDistTotal[k] = (posDistTotal[k] || 0) + v

  let md = `# 词典迁移 dry-run 报告\n\n`
  md += `- 词典：\`${path.basename(DICT_PATH || '')}\`（--dict 传入，未入库）\n`
  md += `- 模式：${APPLY ? '**--apply（已落盘）**' : 'dry-run（仅报告 + preview）'}\n`
  md += `- 文件数：${fileStats.length} / 词项总数：${totalWords}\n`
  md += `- 词典命中（oxford）词项：${totalOxford}（${((totalOxford / totalWords) * 100).toFixed(1)}%）\n`
  md += `- 回退（fallback）词项：${totalWords - totalOxford}（${(((totalWords - totalOxford) / totalWords) * 100).toFixed(1)}%）\n\n`
  md += `## 词性分布（全部义项）\n\n| pos | 条数 |\n|---|---|\n`
  for (const [k, v] of Object.entries(posDistTotal).sort((a, b) => b[1] - a[1])) md += `| ${k} | ${v} |\n`
  md += `\n## 分文件统计\n\n| 文件 | 词数 | oxford 命中 | 命中率 |\n|---|---|---|---|\n`
  for (const f of fileStats) md += `| ${f.rel} | ${f.words} | ${f.oxford} | ${((f.oxford / f.words) * 100).toFixed(0)}% |\n`
  md += `\n## 每词明细\n\n`
  for (const { rel, perWord } of report) {
    md += `### ${rel}\n\n| 词 | 来源 | 条目（pos + meaning） |\n|---|---|---|\n`
    for (const w of perWord) {
      md += `| ${w.word} | ${w.source} | ${w.senses.map((s) => `${s.pos} ${s.meaning}`).join('<br>')} |\n`
    }
    md += `\n`
  }
  await fsp.writeFile(REPORT_PATH, md, 'utf-8')
  console.log(`\n报告已写入 ${REPORT_PATH}`)
  if (!APPLY) console.log(`preview 已写入 ${PREVIEW_DIR}`)
  console.log(`覆盖率：${totalOxford}/${totalWords} = ${((totalOxford / totalWords) * 100).toFixed(1)}%`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
