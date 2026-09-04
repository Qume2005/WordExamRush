import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyProgress, collectProgress, getTombstones, resolveFileHash } from '../src/business/progressStorage'
import { hashString } from '../src/utils/hash'

/** 构造一份合法的 v4 快照 localStorage 原始字符串 */
function v4Snapshot(tag: string): string {
  return JSON.stringify({
    version: 4,
    words: [{ id: 0, word: [tag], phonetic: '', english_synonyms: [], english_explanations: [], chinese_translations: [], roots: [] }],
    progress: []
  })
}

const FOLDER = 'CET4'
const FILE = 'list1.json'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('collectProgress', () => {
  it('收集 v4 快照与 map 键，跳过无关键、坏 JSON 与保留键', () => {
    localStorage.setItem('word-exam-rush:hashA', v4Snapshot('a'))
    localStorage.setItem('word-exam-rush:hashB', v4Snapshot('b'))
    localStorage.setItem('word-exam-rush:map:CET4/list1.json', 'hashA')
    localStorage.setItem('word-exam-rush:tombstones', JSON.stringify(['deadbeef0001']))
    localStorage.setItem('word-exam-rush:map', '{"evil":true}')
    localStorage.setItem('word-exam-rush:session', '{"x":1}')
    localStorage.setItem('unrelated-key', v4Snapshot('u'))
    localStorage.setItem('word-exam-rush:badjson', '{not json')

    const bundle = collectProgress()

    // 原始字符串原样打包，不重新序列化
    expect(bundle.snapshots).toEqual({ hashA: v4Snapshot('a'), hashB: v4Snapshot('b') })
    expect(bundle.fileMap).toEqual({ 'CET4/list1.json': 'hashA' })
    expect(bundle.tombstones).toEqual(['deadbeef0001'])
    // 保留键（map/session/tombstones）、无关键、坏 JSON 一律不收
  })

  it('version 3 的旧快照不收集（Oracle #2）', () => {
    localStorage.setItem('word-exam-rush:oldhash', JSON.stringify({ version: 3, words: [], progress: [] }))
    localStorage.setItem('word-exam-rush:newhash', v4Snapshot('n'))

    const bundle = collectProgress()

    expect(bundle.snapshots).toEqual({ newhash: v4Snapshot('n') })
  })

  it('空 localStorage 返回空 bundle，不含 tombstones 键位污染', () => {
    const bundle = collectProgress()
    expect(bundle).toEqual({ tombstones: [], snapshots: {}, fileMap: {} })
  })
})

describe('applyProgress', () => {
  it('写回 bundle 所有键且不删除 bundle 之外的本地键', () => {
    localStorage.setItem('word-exam-rush:localKeep', v4Snapshot('keep'))
    const bundle = collectProgress()
    bundle.snapshots = { cloudHash: v4Snapshot('cloud') }
    bundle.fileMap = { 'IELTS/core.json': 'cloudHash' }

    applyProgress(bundle)

    expect(localStorage.getItem('word-exam-rush:cloudHash')).toBe(v4Snapshot('cloud'))
    expect(localStorage.getItem('word-exam-rush:map:IELTS/core.json')).toBe('cloudHash')
    // bundle 之外的本地键必须原样保留
    expect(localStorage.getItem('word-exam-rush:localKeep')).toBe(v4Snapshot('keep'))
  })

  it('空 bundle 不抛错也不删除任何本地数据', () => {
    localStorage.setItem('word-exam-rush:hashA', v4Snapshot('a'))
    localStorage.setItem('word-exam-rush:map:CET4/list1.json', 'hashA')

    expect(() => applyProgress({ tombstones: [], snapshots: {}, fileMap: {} })).not.toThrow()
    expect(localStorage.getItem('word-exam-rush:hashA')).toBe(v4Snapshot('a'))
    expect(localStorage.getItem('word-exam-rush:map:CET4/list1.json')).toBe('hashA')
  })
})

describe('tombstones', () => {
  it('hash 变化时记录旧 hash 墓碑（case c）', () => {
    const oldContent = '[{"word":["abandon"]}]'
    const newContent = '[{"word":["abandon","abandon<英>"]}]'
    const oldHash = hashString(oldContent)
    const newHash = hashString(newContent)
    expect(oldHash).not.toBe(newHash)

    localStorage.setItem(`word-exam-rush:map:${FOLDER}/${FILE}`, oldHash)

    resolveFileHash(FOLDER, FILE, newContent)

    expect(getTombstones()).toContain(oldHash)
  })

  it('内容回滚到旧 hash 时墓碑被撤销（antidote, Oracle #5）', () => {
    const oldContent = '[{"word":["abandon"]}]'
    const newContent = '[{"word":["inspect"]}]'
    const oldHash = hashString(oldContent)

    localStorage.setItem(`word-exam-rush:map:${FOLDER}/${FILE}`, oldHash)
    resolveFileHash(FOLDER, FILE, newContent)
    expect(getTombstones()).toContain(oldHash)

    // 回滚：再次以旧内容调用
    resolveFileHash(FOLDER, FILE, oldContent)
    expect(getTombstones()).not.toContain(oldHash)
  })

  it('墓碑去重且上限 200、超出丢弃最旧（case d）', () => {
    // 先通过 201 次 hash 变化制造 201 个墓碑
    let content = 'seed-0'
    let current = hashString(content)
    localStorage.setItem(`word-exam-rush:map:${FOLDER}/${FILE}`, current)

    const seen = new Set<string>()
    for (let i = 1; i <= 201; i++) {
      content = `seed-${i}`
      const next = hashString(content)
      seen.add(current) // 变化前的 hash 进墓碑
      resolveFileHash(FOLDER, FILE, content)
      current = next
    }

    const tombs = getTombstones()
    expect(tombs.length).toBeLessThanOrEqual(200)
    // 去重
    expect(new Set(tombs).size).toBe(tombs.length)
    // 最旧的（最早进入墓碑的 hash）被丢弃，最新的保留
    const oldest = [...seen][0]
    expect(tombs).not.toContain(oldest)
    // 201 次变化全部是不同 hash，上限裁剪正好丢 1 个
    expect(tombs.length).toBe(200)
    const secondOldest = [...seen][1]
    expect(tombs).toContain(secondOldest)
  })

  it('墓碑数据损坏时 getTombstones 返回空数组', () => {
    localStorage.setItem('word-exam-rush:tombstones', '{broken')
    expect(getTombstones()).toEqual([])
  })

  it('墓碑数据非数组时 getTombstones 返回空数组', () => {
    localStorage.setItem('word-exam-rush:tombstones', '{"a":1}')
    expect(getTombstones()).toEqual([])
  })
})
