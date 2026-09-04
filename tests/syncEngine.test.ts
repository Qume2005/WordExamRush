import { describe, expect, it } from 'vitest'
import { mergeBundles } from '../src/business/syncEngine'
import type { SyncBundle } from '../src/business/progressStorage'
import type { WordProgress, WordModeProgress, CardMode } from '../src/types'
import { hashString } from '../src/utils/hash'

/** 用真实 hashString 从表内容文本派生 fixture hash（与运行时同源） */
const hash = (content: string) => hashString(content)

function wp(wordId: number, appearances: number, correctCount: number, history: boolean[]): WordProgress {
  return { wordId, appearances, correctCount, history }
}

/** 构造 v4 快照原始字符串：words 两个词、progress 按传入模式条目 */
function snapshot(wordTag: string, progress: [number, WordModeProgress][]): string {
  return JSON.stringify({
    version: 4,
    words: [
      { id: 0, word: [wordTag], phonetic: '', english_synonyms: [], english_explanations: [], chinese_translations: [], roots: [] },
      { id: 1, word: [wordTag + '2'], phonetic: '', english_synonyms: [], english_explanations: [], chinese_translations: [], roots: [] },
    ],
    progress,
  })
}

function entry(wordId: number, modes: Partial<Record<CardMode, WordProgress>>): [number, WordModeProgress] {
  return [wordId, { wordId, modes }]
}

function bundle(tombstones: string[], snapshots: Record<string, string>, fileMap: Record<string, string>): SyncBundle {
  return { tombstones, snapshots, fileMap }
}

const MODE: CardMode = 'zh-to-en'

describe('mergeBundles 三键收敛', () => {
  const H = hash('file-a')

  it('(a) appearances 高者胜', () => {
    const a = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 10, 5, []) })]) }, {})
    const b = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 3, 2, []) })]) }, {})
    const m = JSON.parse(mergeBundles(a, b).snapshots[H])
    expect(m.progress[0][1].modes[MODE]).toEqual(wp(0, 10, 5, []))
  })

  it('(b) appearances 平局 → correctCount 破平', () => {
    const a = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 5, 4, []) })]) }, {})
    const b = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 5, 1, []) })]) }, {})
    const m = JSON.parse(mergeBundles(a, b).snapshots[H])
    expect(m.progress[0][1].modes[MODE]).toEqual(wp(0, 5, 4, []))
  })

  it('(c) 全平 → history 字典序破平；短前缀 "[true]" 胜长数组 "[true,false]"', () => {
    const a = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 5, 5, [true]) })]) }, {})
    const b = bundle([], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 5, 5, [true, false]) })]) }, {})
    const m = JSON.parse(mergeBundles(a, b).snapshots[H])
    // "[true]" > "[true,false]"（前缀即结尾的字符串字典序更大）
    expect(m.progress[0][1].modes[MODE]).toEqual(wp(0, 5, 5, [true]))
  })

  it('(d) 单侧独有 wordId 与 mode 原样保留', () => {
    const a = bundle([], {
      [H]: snapshot('t', [
        entry(0, { [MODE]: wp(0, 2, 1, [true]) }),
        entry(1, { 'en-to-zh': wp(1, 4, 2, [true, true]) }),
      ]),
    }, {})
    // b 只有 wordId 0，且只有另一 mode
    const b = bundle([], { [H]: snapshot('t', [entry(0, { 'en-to-synonym': wp(0, 9, 9, []) })]) }, {})
    const m = JSON.parse(mergeBundles(a, b).snapshots[H])
    const progress = new Map(m.progress as [number, WordModeProgress][])
    // wordId 0：两个 mode 各自保留
    expect(progress.get(0)!.modes[MODE]).toEqual(wp(0, 2, 1, [true]))
    expect(progress.get(0)!.modes['en-to-synonym']).toEqual(wp(0, 9, 9, []))
    // wordId 1 单侧独有：原样保留
    expect(progress.get(1)!.modes['en-to-zh']).toEqual(wp(1, 4, 2, [true, true]))
  })

  it('(e) 交换律：非对称 fixture 正反深相等，含 corrupt 全平局但 wordId 不同（Oracle #3）', () => {
    // corrupt：三键全平、history 相同、wordId 不同（0 vs 1）→ 整对象 JSON 字典序兜底
    const a = bundle(
      ['t1'],
      {
        [hash('x')]: snapshot('t', [entry(0, { [MODE]: wp(0, 5, 5, [true]) })]),
        [hash('y')]: snapshot('t', [entry(1, { [MODE]: wp(1, 5, 5, [true]) })]),
      },
      { 'F/a.json': hash('x') },
    )
    const b = bundle(
      [],
      {
        [hash('x')]: snapshot('t', [entry(1, { [MODE]: wp(1, 5, 5, [true]) })]),
        [hash('z')]: snapshot('u', [entry(0, { 'en-to-zh': wp(0, 1, 0, [false]) })]),
      },
      { 'F/a.json': hash('z'), 'F/b.json': hash('y') },
    )
    expect(mergeBundles(a, b)).toEqual(mergeBundles(b, a))
  })

  it('(f) 幂等与收敛：mergeBundles(a, merge(a,b)) === merge(a,b)', () => {
    const a = bundle(['t9'], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 7, 3, [true, true]) })]) }, { 'F/a.json': H })
    const b = bundle(['t9', 't8'], { [H]: snapshot('t', [entry(0, { [MODE]: wp(0, 7, 6, [false]) })]) }, { 'F/a.json': hash('other') })
    const ab = mergeBundles(a, b)
    expect(mergeBundles(a, ab)).toEqual(ab)
  })

  it('(g) 空 bundle：双空出空；单侧空则另一侧过 v4 门后存活', () => {
    const empty = bundle([], {}, {})
    expect(mergeBundles(empty, empty)).toEqual(bundle([], {}, {}))
    const one = bundle([], { [H]: snapshot('t', []) }, { 'F/a.json': H })
    expect(mergeBundles(one, empty)).toEqual(bundle([], { [H]: one.snapshots[H] }, { 'F/a.json': H }))
    expect(mergeBundles(empty, one)).toEqual(bundle([], { [H]: one.snapshots[H] }, { 'F/a.json': H }))
    // 非 v4 快照对空侧也按缺席丢弃
    const bad = bundle([], { [hash('bad')]: JSON.stringify({ version: 3, words: [], progress: [] }) }, {})
    expect(mergeBundles(bad, empty).snapshots).toEqual({})
  })

  it('(h) words 数组不一致 → JSON 字典序大的一侧胜（确定性）', () => {
    const wordsA = [{ id: 0, word: ['alpha'], phonetic: '', english_synonyms: [], english_explanations: [], chinese_translations: [], roots: [] }]
    const wordsB = [{ id: 0, word: ['beta'], phonetic: '', english_synonyms: [], english_explanations: [], chinese_translations: [], roots: [] }]
    const a = bundle([], { [H]: JSON.stringify({ version: 4, words: wordsA, progress: [] }) }, {})
    const b = bundle([], { [H]: JSON.stringify({ version: 4, words: wordsB, progress: [] }) }, {})
    const m = JSON.parse(mergeBundles(a, b).snapshots[H])
    // "beta" > "alpha"
    expect(m.words).toEqual(wordsB)
  })

  it('(i) 墓碑命中 hash 从两侧 snapshots 剪枝且并入结果 tombstones（复活即红——Metis #2）', () => {
    const dead = hash('deleted-table')
    // 本地已删旧表进度（记录墓碑），云端仍有旧 hash 快照
    const a = bundle([dead], {}, {})
    const b = bundle([], { [dead]: snapshot('old', []) }, {})
    const m = mergeBundles(a, b)
    expect(m.snapshots[dead]).toBeUndefined()
    expect(m.tombstones).toContain(dead)
  })

  it('(j) 墓碑只剪 snapshots 不剪 fileMap（resolveFileHash 下次打开重写指向）', () => {
    const dead = hash('dead')
    const a = bundle([dead], {}, { 'F/a.json': dead })
    const b = bundle([], { [dead]: snapshot('d', []) }, { 'F/a.json': dead })
    const m = mergeBundles(a, b)
    expect(m.snapshots[dead]).toBeUndefined()
    expect(m.fileMap['F/a.json']).toBe(dead)
  })

  it('(k) 非 v4 快照按缺席：单侧非 v4 键取另一侧；两侧均非 v4 → 该 hash 不进结果', () => {
    const v3 = JSON.stringify({ version: 3, words: [], progress: [] })
    const v4 = snapshot('t', [])
    // 单侧非 v4：另一侧存活
    const a = bundle([], { [hash('k')]: v3 }, {})
    const b = bundle([], { [hash('k')]: v4 }, {})
    expect(mergeBundles(a, b).snapshots[hash('k')]).toBe(v4)
    // 两侧均非 v4：hash 丢弃；坏 JSON 同理
    const bad1 = bundle([], { [hash('k')]: v3, [hash('j')]: '{broken' }, {})
    const bad2 = bundle([], { [hash('k')]: v3, [hash('j')]: '{broken' }, {})
    expect(mergeBundles(bad1, bad2).snapshots).toEqual({})
  })

  it('(l) fileMap 冲突：hash 存在于合并后 snapshots 的一侧胜；双存/双缺回退字典序大者', () => {
    // cyrb53 输出与源文本无字典序关系，先取真实值再按字典序指派角色
    const [hLo, hHi] = [hash('aaa'), hash('zzz')].sort()
    // 本地指向陈旧 hash（不在 snapshots），云端 hash 存活 → 云侧胜
    const a = bundle([], {}, { 'F/a.json': hash('aaa') })
    const b = bundle([], { [hash('zzz')]: snapshot('t', []) }, { 'F/a.json': hash('zzz') })
    expect(mergeBundles(a, b).fileMap['F/a.json']).toBe(hash('zzz'))
    expect(mergeBundles(b, a).fileMap['F/a.json']).toBe(hash('zzz'))
    // 双方 hash 都存在 → 字典序大者
    const bothA = bundle([], { [hash('zzz')]: snapshot('t', []) }, { 'F/c.json': hash('aaa') })
    const bothB = bundle([], { [hash('aaa')]: snapshot('t', []) }, { 'F/c.json': hash('zzz') })
    expect(mergeBundles(bothA, bothB).fileMap['F/c.json']).toBe(hHi)
    // 双方 hash 都不存在 → 字典序大者
    const noneA = bundle([], {}, { 'F/d.json': hash('aaa') })
    const noneB = bundle([], {}, { 'F/d.json': hash('zzz') })
    expect(mergeBundles(noneA, noneB).fileMap['F/d.json']).toBe(hHi)
  })
})
