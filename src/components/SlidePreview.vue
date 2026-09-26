<script setup lang="ts">
import type { Slide } from '@/modules/louvorja/types/louvorja.types'

defineProps<{ slide: Slide | null; testId?: string }>()
</script>

<template>
  <div class="slide-preview" :data-testid="testId ?? 'slide-preview'">
    <template v-if="slide">
      <div v-if="slide.title" class="slide-title">{{ slide.title }}</div>
      <div class="slide-text" data-testid="slide-text">{{ slide.text }}</div>
    </template>
    <v-icon v-else size="48" class="slide-empty">mdi-presentation</v-icon>
  </div>
</template>

<style scoped>
.slide-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 24px;
  overflow: hidden;
  border-radius: var(--border-radius);
  background: #000;
  color: #fff;
  text-align: center;
}

.slide-title {
  position: absolute;
  top: 12px;
  left: 16px;
  right: 16px;
  color: var(--accent-yellow);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  opacity: 0.9;
}

.slide-text {
  font-size: clamp(1rem, 2.4vw, 2rem);
  font-weight: 700;
  line-height: 1.3;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.slide-empty {
  opacity: 0.25;
}
</style>
