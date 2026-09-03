import type { SenseEntry } from '../types'

/** 将单个释义条目格式化为 "词性 释义" */
export function formatSense(s: SenseEntry): string {
  return `${s.pos} ${s.meaning}`
}

/** 将释义条目列表格式化为分隔符连接的字符串 */
export function formatSenses(list: SenseEntry[], sep: string): string {
  return list.map(formatSense).join(sep)
}

/** 释义组：相邻且 pos/english/example 完全相同的条目归并，中文释义聚合展示（纯展示层概念，数据仍为扁平 SenseEntry[]） */
export interface SenseGroup {
  pos: string
  english: string
  example: string
  meanings: string[]
}

/** 按存储顺序做连续归并：仅相邻条目 pos/english/example 完全相等才入同组，非相邻的相同条目保持独立 */
export function groupSenses(list: SenseEntry[]): SenseGroup[] {
  const groups: SenseGroup[] = []
  for (const s of list) {
    const cur = groups[groups.length - 1]
    if (cur && cur.pos === s.pos && cur.english === s.english && cur.example === s.example) {
      cur.meanings.push(s.meaning)
    } else {
      groups.push({ pos: s.pos, english: s.english, example: s.example, meanings: [s.meaning] })
    }
  }
  return groups
}

/** 表格单元格用：每组渲染为 "词性 释义1／释义2"，组间以 sep 连接 */
export function formatSenseGroups(groups: SenseGroup[], sep: string): string {
  return groups.map((g) => `${g.pos} ${g.meanings.join('／')}`).join(sep)
}
