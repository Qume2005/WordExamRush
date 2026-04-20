<script setup>
import { computed } from 'vue'
import { getWordProgress } from '../business/quizEngine'
import { sparklinePoints } from '../utils/sparkline'
import WordTable from './WordTable.vue'

const props = defineProps({
  title: { type: String, default: '' },
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['start-quiz', 'back', 'reset-word', 'save-progress'])

const rows = computed(() =>
  props.words.map((w) => {
    const p = props.progressMap.get(w.id)
    const history = p?.history || []
    const progress = p ? getWordProgress(p) : 0
    const appearances = p?.appearances || 0

    let statusClass = 'status--unlearned'
    let statusText = '未学习'
    if (progress >= 1) {
      statusClass = 'status--done'
      statusText = '已完成'
    } else if (appearances > 0) {
      statusClass = 'status--learning'
      statusText = `${Math.round(progress * 100)}%`
    }

    return {
      id: w.id,
      word: w.word,
      chineseTranslations: w.chinese_translations,
      englishExplanations: w.english_explanations,
      points: sparklinePoints(history),
      statusClass,
      statusText,
      canReset: appearances > 0,
    }
  })
)

function resetWord(wordId) {
  emit('reset-word', wordId)
}
</script>

<template>
  <div class="detail-screen screen-container">
    <h2 class="detail-title screen-title">{{ title }}</h2>
    <WordTable :rows="rows" :extra-columns="true" :show-reset="true" @reset="resetWord" />
    <div class="detail-actions">
      <button class="btn btn-back" @click="emit('back')">返回</button>
      <button class="btn btn-primary" @click="emit('start-quiz')">开始测试</button>
    </div>
  </div>
</template>

<style scoped>
.detail-screen {
  gap: 24px;
}

.btn-back {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-border);
  color: var(--color-text);
  transition: background 0.2s, transform 0.1s;
}

.btn-back:hover {
  background: #cdd1d6;
}

.btn-back:active {
  transform: scale(0.97);
}

.detail-actions {
  display: flex;
  gap: 12px;
}
</style>
