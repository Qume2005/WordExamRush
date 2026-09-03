import type { SenseEntry } from '../types'

/** 将单个释义条目格式化为 "词性 释义" */
export function formatSense(s: SenseEntry): string {
  return `${s.pos} ${s.meaning}`
}

/** 将释义条目列表格式化为分隔符连接的字符串 */
export function formatSenses(list: SenseEntry[], sep: string): string {
  return list.map(formatSense).join(sep)
}
