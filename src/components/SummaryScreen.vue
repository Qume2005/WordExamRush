<script setup>
import { computed } from 'vue'
import { generateSummary } from '../logic/quizEngine'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['restart'])

const summaryRows = computed(() => generateSummary(props.progressMap, props.words))

function accuracyText(row) {
  return (row.accuracy * 100).toFixed(0) + '%'
}
</script>

<template>
  <div class="summary-screen">
    <h2 class="summary-title">抽查完成！</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th>单词</th>
          <th>中文释义</th>
          <th>英文释义</th>
          <th>出现次数</th>
          <th>准确率</th>
          <th>答题记录</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summaryRows" :key="row.word.join(',')">
          <td class="cell-word">{{ row.word.join(' / ') }}</td>
          <td class="cell-explanations">{{ row.chinese_explanations.join('、') }}</td>
          <td class="cell-explanations">{{ row.english_explanations.join('; ') }}</td>
          <td class="cell-count">{{ row.appearances }}</td>
          <td class="cell-accuracy">{{ accuracyText(row) }}</td>
          <td class="cell-history">
            <span class="trend">
              <span
                v-for="(correct, i) in row.history"
                :key="i"
                class="dot"
                :class="correct ? 'dot--correct' : 'dot--wrong'"
              ></span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <button class="btn btn-restart" @click="emit('restart')">重新开始</button>
  </div>
</template>

<style scoped>
.summary-screen {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 0;
  align-items: center;
}

.summary-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.summary-table th {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--color-primary);
}

.summary-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.summary-table tr:last-child td {
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

.cell-count {
  text-align: center;
  font-weight: 600;
}

.cell-accuracy {
  text-align: center;
  font-weight: 600;
}

.trend {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  flex-wrap: wrap;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot--correct {
  background: var(--color-success);
}

.dot--wrong {
  background: var(--color-danger);
}

.btn-restart {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-primary);
  color: #fff;
  transition: background 0.2s, transform 0.1s;
}

.btn-restart:hover {
  background: #3651d4;
}

.btn-restart:active {
  transform: scale(0.97);
}
</style>
