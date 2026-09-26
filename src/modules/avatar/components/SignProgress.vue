<script setup lang="ts">
import { computed } from 'vue'
import type { GlossToken } from '@/modules/libras/types/libras.types'
import { useAvatarStore } from '../stores/avatar.store'

/** The signs of the gloss being made, with the one the avatar is signing right now lit up. */
const props = defineProps<{ tokens: GlossToken[] }>()
const avatar = useAvatarStore()

// The player counts signs from 1. Only trust it when it counts the same signs we show.
const activeIndex = computed(() => {
  const { count, max } = avatar.counter
  return avatar.playing && max === props.tokens.length && count > 0 ? count - 1 : -1
})
</script>

<template>
  <div class="d-flex flex-wrap ga-2" data-testid="sign-progress">
    <v-chip
      v-for="(token, index) in tokens"
      :key="`${index}-${token.text}`"
      :color="index === activeIndex ? 'primary' : undefined"
      :variant="index === activeIndex ? 'flat' : 'tonal'"
      label
      data-testid="sign-chip"
      :data-active="index === activeIndex"
    >
      {{ token.text }}
    </v-chip>
  </div>
</template>
