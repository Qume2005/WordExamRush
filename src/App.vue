<script setup>
import { ref } from 'vue'
import { createProgressMap } from './business/quizEngine'
import { saveFileProgress, saveFolderProgress, resetFolderProgress, removeFileProgress } from './business/progressStorage'
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

function clearProgress() {
  if (wordSources.value) {
    resetFolderProgress(wordSources.value)
  } else if (currentFileKey.value) {
    removeFileProgress(currentFileKey.value)
  }
}

function onStartQuiz({ words: processedWords, fileKey, wordSources: sources }) {
  words.value = processedWords
  progressMap.value = createProgressMap(processedWords)
  currentFileKey.value = fileKey
  wordSources.value = sources || null
  saveProgress()
  phase.value = 'quiz'
}

function onResumeQuiz({ words: savedWords, progress, fileKey, wordSources: sources }) {
  words.value = savedWords
  progressMap.value = progress
  currentFileKey.value = fileKey
  wordSources.value = sources || null
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
  phase.value = 'summary'
}

function onBack() {
  phase.value = 'input'
}

function onResetProgress() {
  progressMap.value = createProgressMap(words.value)
  saveProgress()
}

function onRestart() {
  clearProgress()
  phase.value = 'input'
  words.value = []
  progressMap.value = new Map()
  currentFileKey.value = ''
  wordSources.value = null
}
</script>

<template>
  <InputScreen
    v-if="phase === 'input'"
    @start-quiz="onStartQuiz"
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
    @restart="onRestart"
  />
</template>
