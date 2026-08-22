<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  selectNextWord,
  createNextCard,
  recordAnswer,
  isQuizComplete,
  calcProgressPercent,
} from '../business/quizEngine'
import {
  isMuted,
  toggleMuted,
  playCorrect,
  playWrong,
  playUnknown,
  playComboMilestone,
  playFinish,
} from '../business/soundManager'
import QuizCard from './QuizCard.vue'
import ResultReveal from './ResultReveal.vue'
import ConfettiBurst from './ConfettiBurst.vue'

const props = defineProps({
  words: { type: Array, required: true },
  progressMap: { type: Map, required: true },
})

const emit = defineEmits(['finish-quiz', 'back', 'reset-progress', 'save-progress'])

const currentCard = ref(null)
const answerResult = ref(null)
const isRevealing = ref(false)
const selectedIndex = ref(-1)
const streak = ref(0)
const muted = ref(isMuted())
const showConfetti = ref(false)
const questionIndex = ref(0)
const progressFillEl = ref(null)
const cardWrapEl = ref(null)

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
    if (currentCard.value) playFinish()
    emit('finish-quiz')
    return
  }

  const wordId = selectNextWord(props.progressMap, props.words)
  if (wordId === null) {
    if (currentCard.value) playFinish()
    emit('finish-quiz')
    return
  }

  currentCard.value = createNextCard(wordId, props.words)
  questionIndex.value++
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
  if (result.isCorrect) {
    streak.value++
    playCorrect(streak.value)
    flashProgress()
    if (streak.value % 5 === 0) { playComboMilestone(); showConfetti.value = true }
  } else {
    streak.value = 0
    if (result.selectedIndex >= 0) {
      playWrong()
      shakeCard()
    } else {
      playUnknown()
    }
  }
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

function flashProgress() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  progressFillEl.value?.animate(
    [{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }],
    { duration: 350, easing: 'ease-out' }
  )
}

function shakeCard() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardWrapEl.value?.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(0)' }
    ],
    { duration: 400 }
  )
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
          <div
            class="progress-bar-fill"
            ref="progressFillEl"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <span class="progress-bar-text">{{ progressText }}</span>
      </div>
      <div v-if="streak >= 2" :class="['streak-chip', { 'streak-chip--hot': streak >= 5 }]">
        <span :key="streak" class="streak-pop">🔥 ×{{ streak }}</span>
      </div>
      <div class="top-actions">
        <button class="action-btn" @click="emit('back')" title="返回选择">← 返回</button>
        <button
          class="action-btn action-btn--danger"
          @click="emit('reset-progress')"
          title="重置进度"
        >重置进度</button>
        <button
          class="action-btn"
          @click="muted = toggleMuted()"
          :title="muted ? '开启音效' : '静音'"
        >{{ muted ? '🔇' : '🔊' }}</button>
      </div>
    </div>
    <ConfettiBurst v-if="showConfetti" @done="showConfetti = false" />
    <Transition name="card" mode="out-in">
      <div v-if="currentCard" :key="questionIndex" ref="cardWrapEl" class="card-wrap">
        <QuizCard
          :card="currentCard"
          :disabled="isRevealing"
          :selected-index="selectedIndex"
          @answer="onAnswer"
          @dont-know="onDontKnow"
        />
      </div>
    </Transition>
    <Transition name="reveal">
      <ResultReveal
        v-if="isRevealing && answerResult && targetWord"
        :result="answerResult"
        :target-word="targetWord"
        @next="onNext"
      />
    </Transition>
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
  flex-wrap: wrap;
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

.streak-chip {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 700;
  font-size: 13px;
}

.streak-pop {
  display: inline-block;
  animation: streak-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes streak-pop {
  0% { transform: scale(1) }
  50% { transform: scale(1.25) }
  100% { transform: scale(1) }
}

.streak-chip--hot {
  color: #e8590c;
  background: #fff4e6;
  animation: hot-breathe 2s ease-in-out infinite alternate;
}

@keyframes hot-breathe {
  0% { box-shadow: 0 0 0 rgba(232, 89, 12, 0) }
  100% { box-shadow: 0 0 8px rgba(232, 89, 12, 0.35) }
}

.card-wrap {
  /* shake animation target wrapper */
}

.card-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.card-leave-active {
  transition: opacity 0.15s ease;
}

.card-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.card-leave-to {
  opacity: 0;
}

.reveal-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.reveal-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
