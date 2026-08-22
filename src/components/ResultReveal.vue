<script setup>
import { computed } from 'vue'
import { shuffle } from '../utils/shuffle'
import { speakWord } from '../business/soundManager'

const props = defineProps({
  result: { type: Object, required: true },
  targetWord: { type: Object, required: true },
})

const emit = defineEmits(['next'])

const shuffledExplanations = computed(() => shuffle(props.targetWord.chinese_translations))
const shuffledSynonyms = computed(() => shuffle(props.targetWord.english_synonyms))
const shuffledEnglishExplanations = computed(() =>
  shuffle(props.targetWord.english_explanations || [])
)
const roots = computed(() => props.targetWord.roots || [])
</script>

<template>
  <div class="result-reveal">
    <div
      :class="[
        'banner',
        result.isCorrect
          ? 'banner--correct'
          : result.selectedIndex === -1
            ? 'banner--unknown'
            : 'banner--wrong',
      ]"
    >
      <span class="banner-icon">{{
        result.isCorrect
          ? '&#10003;'
          : result.selectedIndex === -1
            ? '&#33;'
            : '&#10007;'
      }}</span>
      <span>{{
        result.isCorrect
          ? '回答正确！'
          : result.selectedIndex === -1
            ? '不知道'
            : '回答错误'
      }}</span>
    </div>
    <div class="word-detail">
      <h3 class="word-title">
        {{ targetWord.word.join(' / ') }}
        <button
          class="speak-btn"
          title="播放读音"
          @click="speakWord(targetWord.word[0])"
        >🔊</button>
      </h3>
      <div v-if="roots.length > 0" class="detail-section detail-roots">
        <span class="detail-label">词根：</span>
        <div class="root-chips">
          <template v-for="(r, i) in roots" :key="r.root">
            <span v-if="i > 0" class="root-plus">+</span>
            <span class="root-chip">
              <span class="root-meaning">{{ r.meaning }}</span>
              <span class="root-text">{{ r.root }}</span>
            </span>
          </template>
        </div>
      </div>
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
    <button
      class="btn btn-primary btn-next"
      @click="emit('next')"
    >下一题 <span class="key-tip">按任意键继续</span></button>
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

.speak-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  padding: 3px;
  vertical-align: middle;
  opacity: 0.6;
  transition: opacity 0.15s, transform 0.15s;
}

.speak-btn:hover {
  opacity: 1;
  transform: scale(1.15);
}

.speak-btn:active {
  transform: scale(0.95);
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

.detail-roots {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.root-chips {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.root-chip {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-primary-light);
}

.root-meaning {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.root-text {
  font-weight: 700;
  color: var(--color-text);
}

.root-plus {
  align-self: center;
  color: var(--color-text-secondary);
}

.btn-next {
  align-self: center;
}

.key-tip {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.7;
  margin-left: 8px;
}

.banner {
  animation: banner-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
}

@keyframes banner-in {
  0% {
    transform: scale(0.8);
    opacity: 0
  }
  100% {
    transform: scale(1);
    opacity: 1
  }
}

.word-detail > .detail-section {
  animation: detail-in 0.3s ease-out backwards
}

.word-detail > .detail-section:nth-child(2) {
  animation-delay: 0.05s
}

.word-detail > .detail-section:nth-child(3) {
  animation-delay: 0.1s
}

.word-detail > .detail-section:nth-child(4) {
  animation-delay: 0.15s
}

.word-detail > .detail-section:nth-child(5) {
  animation-delay: 0.2s
}

.word-detail > .detail-section:nth-child(6) {
  animation-delay: 0.25s
}

@keyframes detail-in {
  from {
    opacity: 0;
    transform: translateY(6px)
  }
}

@media (max-width: 767px) {
  .key-tip {
    display: none
  }
}
</style>
