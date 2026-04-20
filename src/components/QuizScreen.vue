<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  selectNextWord,
  createNextCard,
  recordAnswer,
  isQuizComplete,
  calcProgressPercent,
} from '../business/quizEngine'
import QuizCard from './QuizCard.vue'
import ResultReveal from './ResultReveal.vue'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['finish-quiz', 'back', 'reset-progress', 'save-progress'])

const currentCard = ref(null)
const answerResult = ref(null)
const isRevealing = ref(false)
const selectedIndex = ref(-1)

const wordMap = computed(() => {
  const m = new Map()
  for (const w of props.words) m.set(w.id, w)
  return m
})

const progressPercent = computed(() => calcProgressPercent(props.progressMap, props.words))

const progressText = computed(() => progressPercent.value + '%')

const targetWord = computed(() => {
  if (!currentCard.value) return null
  return wordMap.value.get(currentCard.value.wordId)
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

function recordResult(isCorrect, optionIndex) {
  if (isRevealing.value || !currentCard.value) return

  const card = currentCard.value
  const correctIndex = card.options.findIndex(o => o.isCorrect)
  const selectedOpt = optionIndex >= 0 ? card.options[optionIndex] : null

  const result = {
    card,
    isCorrect: selectedOpt ? selectedOpt.isCorrect : false,
    selectedIndex: optionIndex,
    correctIndex,
  }

  recordAnswer(props.progressMap, result)
  answerResult.value = result
  isRevealing.value = true
  selectedIndex.value = optionIndex
  emit('save-progress')
}

function onAnswer(index) {
  recordResult(false, index)
}

function onDontKnow() {
  recordResult(false, -1)
}

function onNext() {
  loadNextCard()
}

function isModifierKey(e) {
  return e.ctrlKey || e.altKey || e.shiftKey || e.metaKey
    || ['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Tab', 'Fn', 'Win', 'OS'].includes(e.key)
}

function onKeydown(e) {
  if (!currentCard.value || isModifierKey(e)) return

  if (isRevealing.value) {
    e.preventDefault()
    onNext()
    return
  }

  const num = parseInt(e.key)
  if (num >= 1 && num <= currentCard.value.options.length) {
    e.preventDefault()
    onAnswer(num - 1)
  } else {
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
    <div class="top-bar">
      <div class="progress-bar-wrapper">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-bar-text">{{ progressText }}</span>
      </div>
      <div class="top-actions">
        <button class="action-btn" @click="emit('back')" title="返回选择">&#8592; 返回</button>
        <button class="action-btn action-btn--danger" @click="emit('reset-progress')" title="重置进度">重置进度</button>
      </div>
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

.top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.progress-bar-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
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

.top-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.action-btn--danger:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-light);
}
</style>