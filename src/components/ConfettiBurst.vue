<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  origin: { type: String, default: 'center' },
  count: { type: Number, default: 24 },
})

const emit = defineEmits(['done'])

const colors = ['#4361ee', '#2dc653', '#e63946', '#f59e0b', '#7209b7']

const originMap = {
  center: '50%',
  left: '20%',
  right: '80%',
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const particles = ref([])

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    emit('done')
    return
  }

  for (let i = 0; i < props.count; i++) {
    particles.value.push({
      dx: `${rand(-140, 140)}px`,
      dy: `${rand(-160, 40)}px`,
      rot: `${rand(-360, 360)}deg`,
      dur: `${rand(800, 1100)}ms`,
      color: colors[rand(0, colors.length - 1)],
    })
  }

  setTimeout(() => emit('done'), 1200)
})
</script>

<template>
  <div
    class="confetti-burst"
    :style="{ left: originMap[origin] || '50%' }"
  >
    <span
      v-for="(p, i) in particles"
      :key="i"
      class="confetti-particle"
      :style="{
        '--dx': p.dx,
        '--dy': p.dy,
        '--rot': p.rot,
        'animation-duration': p.dur,
        background: p.color,
      }"
    />
  </div>
</template>

<style scoped>
.confetti-burst {
  position: fixed;
  top: 35%;
  pointer-events: none;
  z-index: 1000;
  transform: translateX(-50%);
}

.confetti-particle {
  display: inline-block;
  width: 10px;
  height: 6px;
  border-radius: 2px;
  animation: confetti-fly var(--dur, 900ms) ease-out forwards;
}

@keyframes confetti-fly {
  0% {
    transform: translate(0, 0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot));
    opacity: 0;
  }
}
</style>