<script setup>
import { computed, onMounted, ref } from 'vue'
import { generateSummary } from '../business/quizEngine'
import { sparklinePoints } from '../utils/sparkline'
import WordTable from './WordTable.vue'
import ConfettiBurst from './ConfettiBurst.vue'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['back'])

const burst1 = ref(false)
const burst2 = ref(false)

const rows = computed(() => {
  const raw = generateSummary(props.progressMap, props.words)
  return raw.map(row => ({
    word: row.word,
    chineseTranslations: row.chinese_translations,
    englishExplanations: row.english_explanations,
    points: sparklinePoints(row.history),
  }))
})

onMounted(() => {
  burst1.value = true
  setTimeout(() => {
    burst2.value = true
  }, 300)
})
</script>

<template>
  <div class="summary-screen screen-container">
    <h2 class="summary-title screen-title">抽查完成！</h2>
    <ConfettiBurst v-if="burst1" origin="left" @done="burst1 = false" />
    <ConfettiBurst v-if="burst2" origin="right" @done="burst2 = false" />
    <WordTable :rows="rows" />
    <button class="btn btn-primary" @click="emit('back')">返回</button>
  </div>
</template>

<style scoped>
.summary-title {
  animation: title-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), title-halo 1.2s ease-out 0.5s 2
}

@keyframes title-pop {
  0% { transform: scale(0.6); opacity: 0 }
  100% { transform: scale(1); opacity: 1 }
}

@keyframes title-halo {
  0%, 100% { text-shadow: 0 0 0 rgba(67, 97, 238, 0) }
  50% { text-shadow: 0 0 18px rgba(67, 97, 238, 0.6) }
}
</style>
