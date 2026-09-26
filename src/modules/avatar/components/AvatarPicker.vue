<script setup lang="ts">
import { storeToRefs } from 'pinia'
import guga from '@/assets/images/avatars/guga.png'
import hosana from '@/assets/images/avatars/hosana.png'
import icaro from '@/assets/images/avatars/icaro.png'
import { useSettingsStore } from '@/stores/settings.store'
import { AVATARS, AVATAR_NAMES, type AvatarId } from '../types/avatar.types'

/** Lets the user choose which VLibras avatar signs. The change shows on the stage at once. */
const store = useSettingsStore()
const { settings } = storeToRefs(store)

/** A portrait of each avatar, taken from the player itself (npm run brand:avatars). */
const portraits: Record<AvatarId, string> = { icaro, guga, hosana }

function choose(avatar: AvatarId): void {
  if (avatar !== settings.value.avatar) void store.update('avatar', avatar)
}
</script>

<template>
  <div class="avatar-picker d-flex flex-wrap ga-6" role="radiogroup" data-testid="avatar-picker">
    <button
      v-for="id in AVATARS"
      :key="id"
      type="button"
      role="radio"
      class="avatar-option"
      :class="{ selected: settings.avatar === id }"
      :aria-checked="settings.avatar === id"
      :data-testid="`avatar-${id}`"
      @click="choose(id)"
    >
      <span class="portrait">
        <img :src="portraits[id]" :alt="AVATAR_NAMES[id]" draggable="false" />
        <v-icon v-if="settings.avatar === id" size="20" class="check">mdi-check-circle</v-icon>
      </span>
      <span class="name">{{ AVATAR_NAMES[id] }}</span>
    </button>
  </div>
</template>

<style scoped>
/* No box around each choice: only the round portrait, with a ring on the chosen one. */
.avatar-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sidebar-text-secondary);
  font: inherit;
  cursor: pointer;
  transition: var(--transition);
}

.avatar-option:focus-visible {
  outline: none;
}

.portrait {
  position: relative;
  display: block;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  /* The avatar's own background is transparent: a soft tint behind it fills the circle. */
  background: linear-gradient(160deg, rgba(99, 102, 241, 0.22) 0%, rgba(20, 184, 166, 0.22) 100%);
  box-shadow: 0 0 0 2px transparent;
  transition: var(--transition);
}

.portrait img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-option:hover .portrait,
.avatar-option:focus-visible .portrait {
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.5);
}

.avatar-option.selected .portrait {
  box-shadow:
    0 0 0 3px var(--card-bg),
    0 0 0 5px var(--accent-blue);
}

.name {
  font-weight: 600;
}

.avatar-option.selected .name {
  color: var(--accent-blue);
}

/* A small tick on the lower right of the chosen portrait. */
.check {
  position: absolute;
  right: -2px;
  bottom: -2px;
  border-radius: 50%;
  background: var(--card-bg);
  color: var(--accent-blue);
}
</style>
