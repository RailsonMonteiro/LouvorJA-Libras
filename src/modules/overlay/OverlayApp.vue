<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import AvatarLayer from '@/modules/avatar/components/AvatarLayer.vue'
import { avatarBox } from '@/modules/avatar/composables/placement'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { api } from '@/services/api'
import { useSettingsStore } from '@/stores/settings.store'
import { useOverlayVisibility } from './composables/useOverlayVisibility'

/**
 * The page of the overlay window: nothing but the avatar, on a transparent background, standing
 * on the bottom of the whole screen. The projection preview is a miniature of this: the same
 * position, size and opacity settings apply.
 */
const avatar = useAvatarStore()
const { settings } = storeToRefs(useSettingsStore())
let stopCommands: (() => void) | undefined

// The window stays open; the avatar is only seen during the presentation (when the setting asks
// for it): from the first text on the air until the last one is done. Between slides it stays.
const louvorja = useLouvorJAStore()
// (After the presentation ends LouvorJA's last slide is still remembered, so the presentation
// itself has to be open too.)
const presenting = computed(
  () =>
    (louvorja.presentation !== null && louvorja.currentSlide !== null) ||
    // Still finishing the last text, or a test made on the projection page.
    avatar.playing ||
    avatar.paused
)
const visible = useOverlayVisibility(
  presenting,
  computed(() => settings.value.overlayOnlyDuringPresentation)
)

function place(): void {
  const screen = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  avatar.setLayerRect({
    ...avatarBox(screen, settings.value.avatarScale, settings.value.avatarPosition),
    clip: { x: 0, y: 0, width: screen.width, height: screen.height }
  })
}

onMounted(() => {
  // What the system shows for this window (the task list, capture programs such as OBS).
  document.title = 'LouvorJA Libras - Overlay'
  place()
  window.addEventListener('resize', place)
  // The projection page can test the avatar: what it plays there plays here too.
  stopCommands = api().overlay.onCommand((command) => avatar.applyCommand(command))
})
watch(() => [settings.value.avatarPosition, settings.value.avatarScale], place)

onBeforeUnmount(() => {
  window.removeEventListener('resize', place)
  stopCommands?.()
})
</script>

<template>
  <div
    class="overlay-root"
    :class="{ hidden: !visible }"
    data-testid="overlay-root"
    :data-visible="visible"
  >
    <AvatarLayer />
  </div>
</template>

<style>
/* The window is transparent: nothing may paint a background. */
html,
body {
  margin: 0;
  overflow: hidden;
  background: transparent !important;
}
</style>

<style scoped>
.overlay-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  transition: opacity 0.4s ease;
}

/* The player keeps running underneath: only what is painted changes. */
.overlay-root.hidden {
  opacity: 0;
}
</style>
