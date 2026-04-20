<script setup>
import { computed } from 'vue'
import { isWordComplete, getAccuracy } from '../business/quizEngine'

const props = defineProps({
  title: { type: String, default: '' },
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['start-quiz', 'back'])

const rows = computed(() =>
  props.words.map((w, i) => {
    const p = props.progressMap.get(w.id)
    const appearances = p?.appearances || 0
    const accuracy = p ? getAccuracy(p) : 0
    const complete = appearances > 0 && p ? isWordComplete(p) : false
    let status = 'unlearned'
    if (complete) {
      status = 'done'
    } else if (appearances > 0) {
      status = 'learning'
    }
    return { word: w, appearances, accuracy, status }
  })
)

function statusText(row) {
  if (row.status === 'done') return '已完成'
  if (row.status === 'learning') return '学习中'
  return '未学习'
}

function statusClass(row) {
  if (row.status === 'done') return 'status--done'
  if (row.status === 'learning') return 'status--learning'
  return 'status--unlearned'
}

function accuracyText(row) {
  if (row.appearances === 0) return '-'
  return (row.accuracy * 100).toFixed(0) + '%'
}
</script>

<template>
  <div class="detail-screen">
    <h2 class="detail-title">{{ title }}</h2>
    <table class="detail-table">
      <thead>
        <tr>
          <th>单词</th>
          <th>中文释义</th>
          <th>英文释义</th>
          <th>状态</th>
          <th>出现次数</th>
          <th>准确率</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.word.word.join(',')">
          <td class="cell-word">{{ row.word.word.join(' / ') }}</td>
          <td class="cell-explanations">{{ row.word.chinese_explanations.join('、') }}</td>
          <td class="cell-explanations">{{ row.word.english_explanations.join('; ') }}</td>
          <td :class="['cell-status', statusClass(row)]">{{ statusText(row) }}</td>
          <td class="cell-count">{{ row.appearances || '-' }}</td>
          <td class="cell-accuracy">{{ accuracyText(row) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="detail-actions">
      <button class="btn btn-back" @click="emit('back')">返回</button>
      <button class="btn btn-start" @click="emit('start-quiz')">开始测试</button>
    </div>
  </div>
</template>

<style scoped>
.detail-screen {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 0;
  align-items: center;
}

.detail-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.detail-table th {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--color-primary);
}

.detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.detail-table tr:last-child td {
  border-bottom: none;
}

.cell-word {
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
}

.cell-explanations {
  color: var(--color-text);
  max-width: 200px;
}

.cell-status {
  font-weight: 600;
  text-align: center;
}

.status--done {
  color: var(--color-success);
}

.status--learning {
  color: var(--color-primary);
}

.status--unlearned {
  color: var(--color-text-secondary);
}

.cell-count {
  text-align: center;
  font-weight: 600;
}

.cell-accuracy {
  text-align: center;
  font-weight: 600;
}

.detail-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.btn:active {
  transform: scale(0.97);
}

.btn-back {
  background: var(--color-border);
  color: var(--color-text);
}

.btn-back:hover {
  background: #cdd1d6;
}

.btn-start {
  background: var(--color-primary);
  color: #fff;
}

.btn-start:hover {
  background: #3651d4;
}
</style>
