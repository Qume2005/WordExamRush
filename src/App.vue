<script setup>
import { ref } from 'vue'
import { createProgressMap } from './logic/quizEngine'
import InputScreen from './components/InputScreen.vue'
import QuizScreen from './components/QuizScreen.vue'
import SummaryScreen from './components/SummaryScreen.vue'

const phase = ref('input')
const words = ref([])
const progressMap = ref(new Map())
const currentFileKey = ref('')
const wordSources = ref(null) // array of file keys per word, or null for single file

const STORAGE_PREFIX = 'word-exam-rush:'

function saveProgress() {
  if (!currentFileKey.value) return

  if (wordSources.value) {
    // Folder session: group by source file and save each
    const fileUpdates = {}
    for (let i = 0; i < words.value.length; i++) {
      const src = wordSources.value[i]
      if (!src) continue
      const p = progressMap.value.get(i)
      if (!p) continue
      if (!fileUpdates[src]) fileUpdates[src] = []
      fileUpdates[src].push({ wordKey: words.value[i].word.join(','), progress: p })
    }

    for (const [src, updates] of Object.entries(fileUpdates)) {
      const saved = localStorage.getItem(STORAGE_PREFIX + src)
      if (!saved) continue
      const fileData = JSON.parse(saved)
      const pm = new Map(fileData.progress)

      for (const { wordKey, progress } of updates) {
        for (const [id, w] of fileData.words.entries()) {
          if (w.word.join(',') === wordKey) {
            pm.set(id, { ...progress, wordId: id })
            break
          }
        }
      }

      fileData.progress = [...pm]
      localStorage.setItem(STORAGE_PREFIX + src, JSON.stringify(fileData))
    }
  } else {
    // Single file session
    localStorage.setItem(
      STORAGE_PREFIX + currentFileKey.value,
      JSON.stringify({
        words: words.value,
        progress: [...progressMap.value.entries()],
      })
    )
  }
}

function clearProgress() {
  if (wordSources.value) {
    const fileKeys = new Set(wordSources.value.filter(Boolean))
    for (const key of fileKeys) {
      const saved = localStorage.getItem(STORAGE_PREFIX + key)
      if (!saved) continue
      const fileData = JSON.parse(saved)
      fileData.progress = fileData.words.map((w, i) =>
        [i, { wordId: i, appearances: 0, correctCount: 0, history: [] }]
      )
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(fileData))
    }
  } else if (currentFileKey.value) {
    localStorage.removeItem(STORAGE_PREFIX + currentFileKey.value)
  }
}

function onStartQuiz({ words: processedWords, fileKey }) {
  words.value = processedWords
  progressMap.value = createProgressMap(processedWords)
  currentFileKey.value = fileKey
  wordSources.value = null
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

function onFinishQuiz() {
  // Progress already saved to individual files, just transition
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
