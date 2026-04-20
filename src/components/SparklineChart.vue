<script setup>
defineProps({
  points: { type: String, required: true },
  width: { type: Number, default: 80 },
  height: { type: Number, default: 24 },
})
</script>

<template>
  <svg v-if="points" :width="width" :height="height" class="sparkline">
    <polyline :points="points" fill="none" stroke="var(--color-primary)" stroke-width="1.5" />
  </svg>
  <span v-else class="sparkline-no-data">-</span>
</template>

<style scoped>
.sparkline {
  display: inline-block;
  vertical-align: middle;
}

.sparkline-no-data {
  color: var(--color-text-secondary);
}
</style>
