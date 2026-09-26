<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import logoUrl from '@/assets/images/logo.svg'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app.store'
import type { WindowAction } from '@/types/ipc'

const app = useAppStore()
const isMac = app.info?.platform === 'darwin'
const isMaximized = ref(false)
const isFocused = ref(true)
let unsubscribe: (() => void) | undefined

function control(action: WindowAction): void {
  void api()
    .window.control(action)
    .then((maximized) => (isMaximized.value = maximized))
}

const onFocus = (): void => void (isFocused.value = true)
const onBlur = (): void => void (isFocused.value = false)

onMounted(async () => {
  isMaximized.value = await api().window.control('is-maximized')
  unsubscribe = api().window.onMaximizedChange((value) => (isMaximized.value = value))
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('blur', onBlur)
})
</script>

<template>
  <div class="app-titlebar d-flex align-center" data-testid="titlebar">
    <template v-if="isMac">
      <div class="mac-controls d-flex align-center h-100 pl-4" :class="{ unfocused: !isFocused }">
        <button
          class="mac-btn mac-close"
          :aria-label="$t('window.close')"
          data-testid="window-close"
          @click="control('close')"
        >
          <v-icon size="8" class="mac-icon">mdi-close</v-icon>
        </button>
        <button
          class="mac-btn mac-minimize"
          :aria-label="$t('window.minimize')"
          data-testid="window-minimize"
          @click="control('minimize')"
        >
          <v-icon size="8" class="mac-icon">mdi-minus</v-icon>
        </button>
        <button
          class="mac-btn mac-maximize"
          :aria-label="isMaximized ? $t('window.restore') : $t('window.maximize')"
          data-testid="window-maximize"
          @click="control('maximize')"
        >
          <v-icon size="8" class="mac-icon">mdi-window-maximize</v-icon>
        </button>
      </div>
      <div class="mac-title-center d-flex align-center justify-center">
        <span class="title-text">{{ $t('app.name') }}</span>
        <span class="version-text">v{{ app.info?.version }}</span>
        <span class="beta-badge">Beta</span>
      </div>
    </template>

    <template v-else>
      <div class="drag-area d-flex align-center flex-grow-1 h-100 pl-3">
        <img :src="logoUrl" height="16" class="mr-2 logo" alt="" />
        <span class="title-text">{{ $t('app.name') }}</span>
        <span class="version-text">v{{ app.info?.version }}</span>
        <span class="beta-badge">Beta</span>
      </div>

      <div class="window-controls d-flex h-100">
        <button
          class="control-btn"
          :title="$t('window.minimize')"
          :aria-label="$t('window.minimize')"
          data-testid="window-minimize"
          @click="control('minimize')"
        >
          <v-icon size="16">mdi-minus</v-icon>
        </button>
        <button
          class="control-btn"
          :title="isMaximized ? $t('window.restore') : $t('window.maximize')"
          :aria-label="isMaximized ? $t('window.restore') : $t('window.maximize')"
          data-testid="window-maximize"
          @click="control('maximize')"
        >
          <v-icon size="14">{{
            isMaximized ? 'mdi-window-restore' : 'mdi-window-maximize'
          }}</v-icon>
        </button>
        <button
          class="control-btn close-btn"
          :title="$t('window.close')"
          :aria-label="$t('window.close')"
          data-testid="window-close"
          @click="control('close')"
        >
          <v-icon size="18">mdi-close</v-icon>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.app-titlebar {
  position: relative;
  flex: 0 0 var(--titlebar-height);
  z-index: 99999;
  height: var(--titlebar-height);
  width: 100%;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  user-select: none;
  -webkit-app-region: drag;
}

.window-controls,
.mac-controls {
  -webkit-app-region: no-drag;
}

.logo {
  opacity: 0.9;
}

.title-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
  opacity: 0.9;
}

.version-text {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
  opacity: 0.4;
}

/* Same red as the close button (.close-btn:hover below) - already this titlebar's warning tone. */
.beta-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #e81123;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  line-height: 1.5;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.8;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(128, 128, 128, 0.2);
    opacity: 1;
  }
}

.close-btn:hover {
  background-color: #e81123;
  color: #fff;
}

.mac-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.mac-close {
  background-color: #ff5f56;
}

.mac-minimize {
  background-color: #ffbd2e;
}

.mac-maximize {
  background-color: #27c93f;
}

.mac-icon {
  color: rgba(0, 0, 0, 0.6) !important;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.mac-controls:hover:not(.unfocused) .mac-icon {
  opacity: 1;
}

.mac-controls.unfocused .mac-btn {
  background-color: rgba(128, 128, 128, 0.35);
}

.mac-title-center {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
