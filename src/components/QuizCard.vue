<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  selectedIndex: { type: Number, default: -1 },
})

const emit = defineEmits(['answer', 'dont-know'])

const modeLabel = computed(() => {
  switch (props.card.mode) {
    case 'zh-to-en': return '看中文，选英文'
    case 'en-to-zh': return '看英文，选中文'
    case 'en-to-synonym': return '看英文，选近义词'
    case 'en-explanation-to-en': return '看英文解释，选英文'
    default: return ''
  }
})

const isDesktop = ref(window.innerWidth >= 768)

function onResize() {
  isDesktop.value = window.innerWidth >= 768
}

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

function shouldShowOption(index, opt) {
  if (isDesktop.value) return true
  if (props.selectedIndex === -1 && !props.disabled) return true
  return opt.isCorrect || index === props.selectedIndex
}

function optionClass(opt, index) {
  if (props.selectedIndex === -1 && !props.disabled) return 'option-btn'
  const classes = ['option-btn', 'option-btn--disabled']
  if (index === props.selectedIndex && !opt.isCorrect) {
    classes.push('option-btn--wrong')
  }
  if (opt.isCorrect) {
    classes.push('option-btn--correct')
  }
  return classes.join(' ')
}

function handleSelect(index) {
  if (!props.disabled) {
    emit('answer', index)
  }
}
</script>

<template>
  <div class="quiz-card">
    <span class="mode-label">{{ modeLabel }}</span>
    <p class="prompt">{{ card.prompt }}</p>
    <div class="options">
      <button
        v-for="(opt, index) in card.options"
        v-if="shouldShowOption(index, opt)"
        :key="index"
        :class="optionClass(opt, index)"
        @click="handleSelect(index)"
      >
        <span v-if="isDesktop && selectedIndex === -1" class="key-hint">{{ index + 1 }}</span>
        <span v-if="selectedIndex !== -1 && opt.isCorrect" class="icon icon-correct">&#10003;</span>
        <span v-if="selectedIndex === index && !opt.isCorrect" class="icon icon-wrong">&#10007;</span>
        <span v-if="selectedIndex === -1 && disabled && opt.isCorrect" class="icon icon-correct">&#10003;</span>
        {{ opt.label }}
      </button>
      <button
        v-if="(selectedIndex === -1 && !disabled) || isDesktop"
        :class="['option-btn', disabled && selectedIndex === -1 ? 'option-btn--unknown' : 'option-btn--dont-know']"
        :disabled="disabled"
        @click="emit('dont-know')"
      >
        <span v-if="isDesktop && selectedIndex === -1" class="key-hint key-hint--wide">任意键</span>
        <span v-if="disabled && selectedIndex === -1" class="icon icon-unknown">&#33;</span>
        不知道
      </button>
    </div>
  </div>
</template>

<style scoped>
.quiz-card {
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mode-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.prompt {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  text-align: center;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-btn {
  width: 100%;
  text-align: left;
  padding: 14px 18px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  font-size: 16px;
  color: var(--color-text);
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-btn:hover:not(.option-btn--disabled):not(.option-btn--dont-know) {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.option-btn--disabled {
  pointer-events: none;
}

.option-btn--correct {
  border-color: var(--color-success);
  background: var(--color-success-light);
  color: var(--color-success);
  font-weight: 600;
}

.option-btn--wrong {
  border-color: var(--color-danger);
  background: var(--color-danger-light);
  color: var(--color-danger);
  font-weight: 600;
}

.key-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.key-hint--wide {
  width: auto;
  padding: 0 8px;
}

.option-btn--dont-know {
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
  border-style: dashed;
  margin-top: 6px;
}

.option-btn--dont-know:hover:not(:disabled) {
  border-color: var(--color-text-secondary);
  background: #f5f5f5;
}

.option-btn--dont-know:disabled {
  pointer-events: none;
  opacity: 0.5;
}

.option-btn--unknown {
  justify-content: center;
  text-align: center;
  color: #f59e0b;
  font-weight: 600;
  border-color: #f59e0b;
  background: #fff8e1;
  pointer-events: none;
  margin-top: 6px;
}

.icon-unknown {
  color: #f59e0b;
}

.icon {
  font-weight: 700;
  font-size: 16px;
}

.icon-correct {
  color: var(--color-success);
}

.icon-wrong {
  color: var(--color-danger);
}
</style>