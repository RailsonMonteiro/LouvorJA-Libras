<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import SlidePreview from '@/components/SlidePreview.vue'
import { AVATAR_ASPECT, useAvatarPlacement } from '@/modules/avatar/composables/useAvatarPlacement'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useSettingsStore } from '@/stores/settings.store'

/**
 * A 16:9 preview of what the audience sees: the slide, with the avatar standing on top of it,
 * placed and sized as in the settings. (The avatar itself is drawn by the global avatar layer,
 * which is told where this stage is.)
 */
const louvorja = useLouvorJAStore()
const { settings } = storeToRefs(useSettingsStore())
const stage = ref<HTMLElement | null>(null)

useAvatarPlacement(stage)

// Keep the slide text away from the avatar: reserve the width the avatar takes on its side.
const style = computed(() => {
  const side = settings.value.avatarPosition
  if (side === 'center') return {}
  const reserved = AVATAR_ASPECT * (9 / 16) * settings.value.avatarScale + 4
  return { [side === 'left' ? 'paddingLeft' : 'paddingRight']: `${reserved}%` }
})
</script>

<template>
  <div ref="stage" class="stage" data-testid="stage">
    <SlidePreview
      :slide="settings.stageShowSlide ? louvorja.currentSlide : null"
      :style="style"
      test-id="stage-slide"
    />
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--border-radius);
  background: #000;
}
</style>
