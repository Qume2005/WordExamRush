<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  selectNextWord,
  createNextCard,
  recordAnswer,
  isQuizComplete,
} from '../logic/quizEngine'
import QuizCard from './QuizCard.vue'
import ResultReveal from './ResultReveal.vue'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['finish-quiz'])

const currentCard = ref(null)
const answerResult = ref(null)
const isRevealing = ref(false)
const selectedIndex = ref(-1)

const completedCount = computed(() => {
  let count = 0
  for (const p of props.progressMap.values()) {
    if (p.appearances >= 3 && p.correctCount / p.appearances >= 0.9) count++
  }
  return count
})

const totalCount = computed(() => props.words.length)

const progressPercent = computed(() =>
  totalCount.value ? (completedCount.value / totalCount.value) * 100 : 0
)

const targetWord = computed(() => {
  if (!currentCard.value) return null
  return props.words.find(w => w.id === currentCard.value.wordId)
})

function loadNextCard() {
  answerResult.value = null
  isRevealing.value = false
  selectedIndex.value = -1

  if (isQuizComplete(props.progressMap)) {
    emit('finish-quiz')
    return
  }

  const wordId = selectNextWord(props.progressMap, props.words)
  if (wordId === null) {
    emit('finish-quiz')
    return
  }

  currentCard.value = createNextCard(wordId, props.words)
}

function submitAnswer(index) {
  if (isRevealing.value || !currentCard.value) return

  const card = currentCard.value
  const selectedOpt = card.options[index]
  const correctIndex = card.options.findIndex(o => o.isCorrect)

  const result = {
    card,
    isCorrect: selectedOpt.isCorrect,
    selectedIndex: index,
    correctIndex,
  }

  recordAnswer(props.progressMap, result)
  answerResult.value = result
  isRevealing.value = true
  selectedIndex.value = index
}

function onAnswer(index) {
  submitAnswer(index)
}

function onDontKnow() {
  if (isRevealing.value || !currentCard.value) return

  const card = currentCard.value
  const correctIndex = card.options.findIndex(o => o.isCorrect)

  const result = {
    card,
    isCorrect: false,
    selectedIndex: -1,
    correctIndex,
  }

  recordAnswer(props.progressMap, result)
  answerResult.value = result
  isRevealing.value = true
  selectedIndex.value = -1
}

function onNext() {
  loadNextCard()
}

function onKeydown(e) {
  if (!currentCard.value) return

  if (isRevealing.value) {
    e.preventDefault()
    onNext()
    return
  }

  const num = parseInt(e.key)
  if (num >= 1 && num <= currentCard.value.options.length) {
    e.preventDefault()
    submitAnswer(num - 1)
  } else if (num === currentCard.value.options.length + 1) {
    e.preventDefault()
    onDontKnow()
  }
}

onMounted(() => {
  loadNextCard()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="quiz-screen">
    <div class="progress-bar-wrapper">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <span class="progress-bar-text">{{ completedCount }} / {{ totalCount }}</span>
    </div>
    <QuizCard
      v-if="currentCard"
      :card="currentCard"
      :disabled="isRevealing"
      :selected-index="selectedIndex"
      @answer="onAnswer"
      @dont-know="onDontKnow"
    />
    <ResultReveal
      v-if="isRevealing && answerResult && targetWord"
      :result="answerResult"
      :target-word="targetWord"
      @next="onNext"
    />
  </div>
</template>

<style scoped>
.quiz-screen {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 24px 0;
}

.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.progress-bar-track {
  flex: 1;
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
</style>