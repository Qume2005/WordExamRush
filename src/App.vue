<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createProgressMap, createEmptyProgress } from './business/quizEngine'
import { saveFileProgress, saveFolderProgress, saveSession, clearSession } from './business/progressStorage'
import InputScreen from './components/InputScreen.vue'
import WordDetailScreen from './components/WordDetailScreen.vue'
import QuizScreen from './components/QuizScreen.vue'
import SummaryScreen from './components/SummaryScreen.vue'

const phase = ref('input')
const words = ref([])
const progressMap = ref(new Map())
const currentFileKey = ref('')
const wordSources = ref(null)
const detailTitle = ref('')

function saveProgress() {
  if (!currentFileKey.value) return

  if (wordSources.value) {
    saveFolderProgress(words.value, progressMap.value, wordSources.value)
  } else {
    saveFileProgress(currentFileKey.value, words.value, progressMap.value)
  }
}

function onResumeQuiz({ words: savedWords, progress, fileKey, wordSources: sources, session }) {
  words.value = savedWords
  progressMap.value = progress
  currentFileKey.value = fileKey
  wordSources.value = sources || null
  if (session) saveSession(session)
  phase.value = 'quiz'
}

function onShowDetail({ words: detailWords, progress, fileKey, wordSources: sources, title }) {
  words.value = detailWords
  progressMap.value = progress
  currentFileKey.value = fileKey
  wordSources.value = sources || null
  detailTitle.value = title
  phase.value = 'detail'
}

function onDetailStartQuiz() {
  // If progress was loaded from detail view, transition to quiz directly
  phase.value = 'quiz'
}

function onFinishQuiz() {
  clearSession()
  phase.value = 'summary'
}

function onBack() {
  saveProgress()
  clearSession()
  phase.value = 'input'
}

function onResetProgress() {
  progressMap.value = createProgressMap(words.value)
  saveProgress()
}

function onResetWord(wordId) {
  progressMap.value.set(wordId, createEmptyProgress(wordId))
  saveProgress()
}

function onGlobalKeydown(e) {
  if (e.key === 'Escape' && phase.value !== 'input') {
    e.preventDefault()
    onBack()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <InputScreen
    v-if="phase === 'input'"
    @resume-quiz="onResumeQuiz"
    @show-detail="onShowDetail"
  />
  <WordDetailScreen
    v-else-if="phase === 'detail'"
    :title="detailTitle"
    :words="words"
    :progress-map="progressMap"
    @start-quiz="onDetailStartQuiz"
    @back="onBack"
    @reset-word="onResetWord"
    @save-progress="saveProgress"
  />
  <QuizScreen
    v-else-if="phase === 'quiz'"
    :words="words"
    :progress-map="progressMap"
    @finish-quiz="onFinishQuiz"
    @back="onBack"
    @reset-progress="onResetProgress"
    @save-progress="saveProgress"
  />
  <SummaryScreen
    v-else
    :words="words"
    :progress-map="progressMap"
    @back="onBack"
  />
</template>
