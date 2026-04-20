<script setup>
import SparklineChart from './SparklineChart.vue'

defineProps({
  rows: { type: Array, required: true },
  extraColumns: { type: Boolean, default: false },
  showReset: { type: Boolean, default: false },
})

const emit = defineEmits(['row-click', 'reset'])
</script>

<template>
  <table class="word-table">
    <thead>
      <tr>
        <th>单词</th>
        <th>中文释义</th>
        <th>英文释义</th>
        <th>正确率</th>
        <th v-if="extraColumns">进度</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.word.join(',')" @click="$emit('row-click', row)">
        <td class="cell-word">{{ row.word.join(' / ') }}</td>
        <td class="cell-explanations">{{ row.chineseTranslations.join('、') }}</td>
        <td class="cell-explanations">{{ row.englishExplanations.join('; ') }}</td>
        <td class="cell-chart">
          <SparklineChart :points="row.points" />
        </td>
        <td v-if="extraColumns" :class="['cell-status', row.statusClass]">
          <span>{{ row.statusText }}</span>
          <button v-if="showReset && row.canReset" class="reset-btn" @click.stop="emit('reset', row.id)" title="重置">&#8634;</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.word-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.word-table th {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--color-primary);
}

.word-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.word-table tr:last-child td {
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

.cell-chart {
  text-align: center;
  width: 90px;
}

.cell-status {
  font-weight: 600;
  text-align: center;
  min-width: 60px;
}

.reset-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-left: 6px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
  vertical-align: middle;
}

.reset-btn:hover {
  color: var(--color-danger);
  background: var(--color-danger-light);
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
</style>
