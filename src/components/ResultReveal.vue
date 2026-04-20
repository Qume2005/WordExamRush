<script setup>
import { computed } from 'vue'
import { shuffle } from '../logic/shuffle'

const props = defineProps({
  result: { type: Object, required: true },
  targetWord: { type: Object, required: true },
})

const emit = defineEmits(['next'])

const shuffledExplanations = computed(() => shuffle(props.targetWord.chinese_explanations))
const shuffledSynonyms = computed(() => shuffle(props.targetWord.english_synonyms))
const shuffledEnglishExplanations = computed(() => shuffle(props.targetWord.english_explanations || []))
</script>

<template>
  <div class="result-reveal">
    <div :class="['banner', result.isCorrect ? 'banner--correct' : result.selectedIndex === -1 ? 'banner--unknown' : 'banner--wrong']">
      <span class="banner-icon">{{ result.isCorrect ? '&#10003;' : result.selectedIndex === -1 ? '&#33;' : '&#10007;' }}</span>
      <span>{{ result.isCorrect ? '回答正确！' : result.selectedIndex === -1 ? '不知道' : '回答错误' }}</span>
    </div>
    <div class="word-detail">
      <h3 class="word-title">{{ targetWord.word.join(' / ') }}</h3>
      <div class="detail-section">
        <span class="detail-label">中文释义：</span>
        <span class="detail-value">{{ shuffledExplanations.join('、') }}</span>
      </div>
      <div v-if="shuffledEnglishExplanations.length > 0" class="detail-section">
        <span class="detail-label">英文释义：</span>
        <span class="detail-value">{{ shuffledEnglishExplanations.join('; ') }}</span>
      </div>
      <div v-if="shuffledSynonyms.length > 0" class="detail-section">
        <span class="detail-label">近义词：</span>
        <span class="detail-value">{{ shuffledSynonyms.join(', ') }}</span>
      </div>
      <div class="detail-section">
        <span class="detail-label">例句：</span>
        <span class="detail-value detail-sentence">{{ targetWord.example_sentences }}</span>
      </div>
    </div>
    <button class="btn btn-next" @click="emit('next')">下一题 <span class="key-tip">按任意键继续</span></button>
  </div>
</template>

<style scoped>
.result-reveal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
}

.banner--correct {
  background: var(--color-success-light);
  color: var(--color-success);
}

.banner--wrong {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

.banner--unknown {
  background: #fff8e1;
  color: #f59e0b;
}

.banner-icon {
  font-size: 20px;
}

.word-detail {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.word-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.detail-section {
  font-size: 14px;
  line-height: 1.6;
}

.detail-label {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.detail-value {
  color: var(--color-text);
}

.detail-sentence {
  font-style: italic;
}

.btn-next {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-primary);
  color: #fff;
  transition: background 0.2s, transform 0.1s;
  align-self: center;
}

.btn-next:hover {
  background: #3651d4;
}

.btn-next:active {
  transform: scale(0.97);
}

.key-tip {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.7;
  margin-left: 8px;
}

@media (max-width: 767px) {
  .key-tip {
    display: none;
  }
}
</style>
