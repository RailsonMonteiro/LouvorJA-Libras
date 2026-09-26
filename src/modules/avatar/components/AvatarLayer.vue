<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAvatarStore } from '../stores/avatar.store'

/**
 * The avatar player lives here, once for the whole app, so it keeps its state (and is not
 * reloaded, which takes seconds) when the user moves between pages. Pages that want to show it
 * tell the store where, and this layer follows.
 */
const avatar = useAvatarStore()
const frame = ref<HTMLIFrameElement | null>(null)

const showPlayer = computed(() => avatar.status !== 'unavailable' && avatar.status !== 'checking')
const src = computed(() => `/vlibras/unity/index.html?retry=${avatar.reloadKey}`)

// The iframe is recreated on retry, so follow the element rather than the mounting.
watch(frame, (element) => element && avatar.attach(element), { flush: 'post' })

const style = computed(() => {
  const rect = avatar.layerRect
  if (!rect) return {}

  const { clip } = rect
  const inset = {
    top: Math.max(0, clip.y - rect.y),
    right: Math.max(0, rect.x + rect.width - (clip.x + clip.width)),
    bottom: Math.max(0, rect.y + rect.height - (clip.y + clip.height)),
    left: Math.max(0, clip.x - rect.x)
  }
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    clipPath: `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px)`
  }
})
</script>

<template>
  <div
    v-if="showPlayer"
    class="avatar-layer"
    :class="{ parked: !avatar.layerRect }"
    :style="style"
    data-testid="avatar-layer"
    aria-hidden="true"
  >
    <iframe
      :key="avatar.reloadKey"
      ref="frame"
      :src="src"
      title="Avatar"
      tabindex="-1"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      data-testid="avatar-frame"
    />
  </div>
</template>

<style scoped>
.avatar-layer {
  position: fixed;
  z-index: 5;
  pointer-events: none;
}

/* Not shown on this page: keep it alive and rendering, just out of sight. */
.avatar-layer.parked {
  left: -10000px;
  top: 0;
  width: 360px;
  height: 480px;
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  /* The player page has no colour scheme of its own: matching it keeps the canvas transparent
     in the dark theme too (a mismatch makes the browser paint an opaque backdrop). */
  color-scheme: normal;
}
</style>
