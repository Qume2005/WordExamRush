<script setup>
import { computed } from 'vue'
import { generateSummary } from '../business/quizEngine'
import { sparklinePoints } from '../utils/sparkline'
import WordTable from './WordTable.vue'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['back'])

const rows = computed(() => {
  const raw = generateSummary(props.progressMap, props.words)
  return raw.map(row => ({
    word: row.word,
    chineseTranslations: row.chinese_translations,
    englishExplanations: row.english_explanations,
    points: sparklinePoints(row.history),
  }))
})
</script>

<template>
  <div class="summary-screen screen-container">
    <h2 class="summary-title screen-title">抽查完成！</h2>
    <WordTable :rows="rows" />
    <button class="btn btn-primary" @click="emit('back')">返回</button>
  </div>
</template>
