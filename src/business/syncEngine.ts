import type { SyncBundle } from './progressStorage'
import type { CardMode, WordProgress, WordModeProgress } from '../types'

/** 快照 JSON 形状（version:4，见 progressStorage.saveFileProgress） */
interface SnapshotData {
  version: number
  words: unknown[]
  progress: [number, WordModeProgress][]
}

/**
 * 解析快照原始字符串，非 v4 / 结构损坏返回 null（该键按缺席处理——Oracle round-b #3）。
 * 云端数据是不可信输入：畸形快照按缺席丢弃，避免合并崩溃。
 */
function parseSnapshot(raw: string | undefined): SnapshotData | null {
  if (raw === undefined) return null
  try {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && data.version === 4 && Array.isArray(data.words) && Array.isArray(data.progress)) {
      return data as SnapshotData
    }
  } catch { /* 损坏 JSON 按缺席处理 */ }
  return null
}

/** 信任边界过滤：畸形 progress 条目（缺 modes / 非二元组 / 键非数字）视为缺席 */
function toProgressMap(progress: SnapshotData['progress']): Map<number, WordModeProgress> {
  const m = new Map<number, WordModeProgress>()
  for (const e of progress) {
    if (
      Array.isArray(e) && e.length === 2 && typeof e[0] === 'number' &&
      e[1] && typeof e[1] === 'object' && e[1].modes && typeof e[1].modes === 'object'
    ) {
      m.set(e[0], e[1])
    }
  }
  return m
}

/**
 * 逐 mode 选取整条胜者 WordProgress（三键收敛，保证全序——交换律的前提）：
 * appearances 降序 → correctCount 降序 → JSON.stringify(history) 字典序大者。
 * 注意：history 字典序下短前缀数组可胜长数组（如 "[true]" > "[true,false]"）——
 * 这是确定性约定，非语义最优。
 * 仍平局（history 字符串相同但对象其余字段如 wordId 不同，属损坏输入——Oracle #3）时
 * 取整对象 JSON 字典序大者兜底保证全序；完全相同则任取（深相等）。
 * 字段缺失/类型错误（corrupt 输入）按 0 / 空串参与比较，保证比较对称（交换律不破）。
 */
function pickWinner(a: WordProgress, b: WordProgress): WordProgress {
  const aa = typeof a.appearances === 'number' ? a.appearances : 0
  const ba = typeof b.appearances === 'number' ? b.appearances : 0
  if (aa !== ba) return aa > ba ? a : b
  const ac = typeof a.correctCount === 'number' ? a.correctCount : 0
  const bc = typeof b.correctCount === 'number' ? b.correctCount : 0
  if (ac !== bc) return ac > bc ? a : b
  const ha = JSON.stringify(a.history) ?? ''
  const hb = JSON.stringify(b.history) ?? ''
  if (ha !== hb) return ha > hb ? a : b
  const sa = JSON.stringify(a)
  const sb = JSON.stringify(b)
  if (sa !== sb) return sa > sb ? a : b
  return a
}

/** 合并同一快照键下两侧的 progress（wordId 并集；整条 WordProgress 取一侧，不拼 history） */
function mergeProgress(a: SnapshotData['progress'], b: SnapshotData['progress']): SnapshotData['progress'] {
  const am = toProgressMap(a)
  const bm = toProgressMap(b)
  const out: SnapshotData['progress'] = []
  // wordId 升序输出：合并结果字节级与合并方向无关（收敛的前提）
  const wordIds = [...new Set([...am.keys(), ...bm.keys()])].sort((x, y) => x - y)
  for (const wordId of wordIds) {
    const ea = am.get(wordId)
    const eb = bm.get(wordId)
    if (!ea) { out.push([wordId, eb!]); continue }
    if (!eb) { out.push([wordId, ea]); continue }

    const modes: WordModeProgress['modes'] = {}
    const modeKeys = [...new Set([...Object.keys(ea.modes), ...Object.keys(eb.modes)])].sort() as CardMode[]
    for (const mode of modeKeys) {
      const pa = ea.modes[mode]
      const pb = eb.modes[mode]
      if (pa && pb) {
        // 规范化：胜者 wordId 统一改写为实际的 map 键 id（modes 形状保持不变）
        modes[mode] = { ...pickWinner(pa, pb), wordId }
      } else if (pa ?? pb) {
        modes[mode] = (pa ?? pb)!
      }
    }
    out.push([wordId, { wordId, modes }])
  }
  return out
}

/** 合并同一快照键下两侧数据：words 数组 JSON 字典序不一致时取大的一侧（确定性约定） */
function mergeSnapshot(a: SnapshotData, b: SnapshotData): SnapshotData {
  const aw = JSON.stringify(a.words)
  const bw = JSON.stringify(b.words)
  const words = aw === bw ? a.words : aw > bw ? a.words : b.words
  return { version: 4, words, progress: mergeProgress(a.progress, b.progress) }
}

/**
 * 纯合并引擎：交换律 / 幂等 / 收敛，无 IO、无 Date.now、无随机。
 * (0) 墓碑取两侧并集（去重、字典序输出——字节级与合并方向无关）；
 *     命中任一侧墓碑的 hash 从两侧 snapshots 剪枝（本地删表进度不被云端旧快照复活）。
 * (1) snapshots 两侧键并集，全部（含单侧独有键）过 parse + version===4 门；两侧均有效
 *     时逐 wordId / 逐 mode 三键收敛。
 * (2) fileMap 键永不剪枝（resolveFileHash 下次打开按真实文件内容重写指向——Oracle #4）；
 *     同键优先取 hash 存在于合并后 snapshots 的一侧，两侧都存在/都不存在时回退字典序大者。
 * (3) 跨 hash 永不合并单词（wordId 是同一 words 数组内的索引，跨 hash 无意义——Metis #14）。
 */
export function mergeBundles(local: SyncBundle, remote: SyncBundle): SyncBundle {
  const tombstones = [...new Set([...local.tombstones, ...remote.tombstones])].sort()
  const tombSet = new Set(tombstones)

  const snapshots: Record<string, string> = {}
  const keys = [...new Set([...Object.keys(local.snapshots), ...Object.keys(remote.snapshots)])].sort()
  for (const key of keys) {
    if (tombSet.has(key)) continue
    const a = parseSnapshot(local.snapshots[key])
    const b = parseSnapshot(remote.snapshots[key])
    if (!a && !b) continue
    if (!a) { snapshots[key] = remote.snapshots[key]; continue }
    if (!b) { snapshots[key] = local.snapshots[key]; continue }
    snapshots[key] = JSON.stringify(mergeSnapshot(a, b))
  }

  const fileMap: Record<string, string> = {}
  const snapKeys = new Set(Object.keys(snapshots))
  const mapKeys = [...new Set([...Object.keys(local.fileMap), ...Object.keys(remote.fileMap)])].sort()
  for (const key of mapKeys) {
    const lv = local.fileMap[key]
    const rv = remote.fileMap[key]
    if (lv === rv) { fileMap[key] = lv; continue }
    const lExists = snapKeys.has(lv)
    const rExists = snapKeys.has(rv)
    if (lExists !== rExists) {
      fileMap[key] = lExists ? lv : rv
    } else {
      fileMap[key] = lv > rv ? lv : rv
    }
  }

  return { tombstones, snapshots, fileMap }
}
