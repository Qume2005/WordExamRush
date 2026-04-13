<script setup>
import { ref } from 'vue'
import { parseAndProcess } from '../logic/wordProcessor'

const emit = defineEmits(['start-quiz'])
const jsonInput = ref('')
const errorMsg = ref('')

function handleSubmit() {
  const [processed, error] = parseAndProcess(jsonInput.value)
  if (error) {
    errorMsg.value = error
    return
  }
  errorMsg.value = ''
  emit('start-quiz', processed)
}
</script>

<template>
  <div class="input-screen">
    <h1 class="title">WordExamRush</h1>
    <p class="subtitle">粘贴 JSON 格式的单词表，开始抽查记忆</p>
    <textarea
      v-model="jsonInput"
      class="json-input"
      placeholder='[&#10;  {&#10;    "word": "abandon",&#10;    "english_synonyms": ["forsake", "desert"],&#10;    "chinese_explanations": ["放弃", "遗弃"],&#10;    "example_sentences": "He abandoned his old car."&#10;  }&#10;]'
      rows="12"
    ></textarea>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <button class="btn btn-primary" @click="handleSubmit">开始抽查</button>
  </div>
</template>

<style scoped>
.input-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  padding: 40px 0;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.subtitle {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.json-input {
  width: 100%;
  min-height: 220px;
  padding: 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.json-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.error-msg {
  color: var(--color-danger);
  font-size: 14px;
  margin: 0;
}

.btn {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.btn:active {
  transform: scale(0.97);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary:hover {
  background: #3651d4;
}
</style>
