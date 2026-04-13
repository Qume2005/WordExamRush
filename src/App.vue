<script setup>
import { ref } from 'vue'
import { createProgressMap } from './logic/quizEngine'
import InputScreen from './components/InputScreen.vue'
import QuizScreen from './components/QuizScreen.vue'
import SummaryScreen from './components/SummaryScreen.vue'

const phase = ref('input')
const words = ref([])
const progressMap = ref(new Map())

function onStartQuiz(processedWords) {
  words.value = processedWords
  progressMap.value = createProgressMap(processedWords)
  phase.value = 'quiz'
}

function onFinishQuiz() {
  phase.value = 'summary'
}

function onRestart() {
  phase.value = 'input'
  words.value = []
  progressMap.value = new Map()
}
</script>

<template>
  <InputScreen v-if="phase === 'input'" @start-quiz="onStartQuiz" />
  <QuizScreen
    v-else-if="phase === 'quiz'"
    :words="words"
    :progress-map="progressMap"
    @finish-quiz="onFinishQuiz"
  />
  <SummaryScreen
    v-else
    :words="words"
    :progress-map="progressMap"
    @restart="onRestart"
  />
</template>
