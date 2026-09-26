<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSection from '@/modules/settings/SettingsSection.vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useOverlayStore } from '../stores/overlay.store'

const { t } = useI18n()
const overlay = useOverlayStore()
const { settings } = storeToRefs(useSettingsStore())
const settingsStore = useSettingsStore()

/** The screen that is selected: the one chosen, or "automatic" (null) when it is not there any more. */
const selectedId = computed(() =>
  overlay.displays.some((display) => display.id === settings.value.overlayDisplayId)
    ? settings.value.overlayDisplayId
    : null
)

const status = computed(() =>
  overlay.open
    ? t('projection.overlay.statusOpen', { screen: overlay.currentDisplay?.label ?? '' })
    : t('projection.overlay.statusClosed')
)
const singleScreen = computed(() => overlay.displays.length <= 1)
</script>

<template>
  <SettingsSection
    icon="mdi-layers-outline"
    :title="$t('projection.overlay.title')"
    :description="$t('projection.overlay.description')"
  >
    <template #actions>
      <v-chip
        :color="overlay.open ? 'success' : undefined"
        variant="tonal"
        size="small"
        label
        data-testid="overlay-status"
        :data-open="overlay.open"
      >
        <v-icon start size="10">mdi-circle</v-icon>
        {{ status }}
      </v-chip>
    </template>

    <div class="overlay-field">
      <div class="screens-header">
        <label class="overlay-label">{{ $t('projection.overlay.display') }}</label>
        <v-btn
          variant="tonal"
          size="small"
          rounded="lg"
          prepend-icon="mdi-monitor-eye"
          data-testid="overlay-identify"
          @click="overlay.identify()"
        >
          {{ $t('projection.overlay.identify') }}
        </v-btn>
      </div>

      <div class="screens" role="radiogroup" data-testid="overlay-display">
        <!-- "Automatic": the second screen if there is one, else the only one. -->
        <button
          type="button"
          role="radio"
          class="screen-tile"
          :class="{ selected: selectedId === null }"
          :aria-checked="selectedId === null"
          data-testid="overlay-display-auto"
          @click="overlay.chooseDisplay(null)"
        >
          <span class="monitor monitor-auto"><v-icon size="26">mdi-auto-fix</v-icon></span>
          <span class="tile-title">{{ $t('projection.overlay.autoShort') }}</span>
          <span class="tile-caption">{{ $t('projection.overlay.autoCaption') }}</span>
        </button>

        <button
          v-for="(display, index) in overlay.displays"
          :key="display.id"
          type="button"
          role="radio"
          class="screen-tile"
          :class="{ selected: selectedId === display.id }"
          :aria-checked="selectedId === display.id"
          :aria-label="$t('projection.overlay.screenName', { number: index + 1 })"
          :data-testid="`overlay-display-${display.id}`"
          @click="overlay.chooseDisplay(display.id)"
        >
          <span class="monitor" :style="{ aspectRatio: `${display.width} / ${display.height}` }">
            <span class="monitor-number">{{ index + 1 }}</span>
          </span>
          <span class="tile-title">{{
            $t('projection.overlay.screenName', { number: index + 1 })
          }}</span>
          <span class="tile-caption">
            {{ display.width }}×{{ display.height }}
            <template v-if="display.primary">
              · {{ $t('projection.overlay.primaryShort') }}</template
            >
          </span>
          <span
            v-if="overlay.open && overlay.state.displayId === display.id"
            class="in-use"
            :title="$t('projection.overlay.inUse')"
          />
        </button>
      </div>
    </div>

    <v-alert
      v-if="singleScreen"
      type="info"
      variant="tonal"
      density="compact"
      :text="$t('projection.overlay.singleScreen')"
    />

    <div class="option-row">
      <span class="option-label">{{ $t('projection.overlay.onlyDuringPresentation') }}</span>
      <v-switch
        :model-value="settings.overlayOnlyDuringPresentation"
        color="primary"
        inset
        hide-details
        density="compact"
        :aria-label="$t('projection.overlay.onlyDuringPresentation')"
        data-testid="overlay-only-during-presentation"
        @update:model-value="settingsStore.update('overlayOnlyDuringPresentation', Boolean($event))"
      />
    </div>

    <div class="option-row">
      <span class="option-label">{{ $t('projection.overlay.autoOpen') }}</span>
      <v-switch
        :model-value="settings.overlayAutoOpen"
        color="primary"
        inset
        hide-details
        density="compact"
        :aria-label="$t('projection.overlay.autoOpen')"
        data-testid="overlay-auto-open"
        @update:model-value="settingsStore.update('overlayAutoOpen', Boolean($event))"
      />
    </div>

    <v-btn
      v-if="!overlay.open"
      color="primary"
      size="default"
      rounded="lg"
      prepend-icon="mdi-monitor-share"
      class="overlay-action"
      data-testid="overlay-open"
      @click="overlay.show()"
    >
      {{ $t('projection.overlay.open') }}
    </v-btn>
    <v-btn
      v-else
      color="error"
      variant="tonal"
      size="default"
      rounded="lg"
      prepend-icon="mdi-monitor-off"
      class="overlay-action"
      data-testid="overlay-close"
      @click="overlay.hide()"
    >
      {{ $t('projection.overlay.close') }}
    </v-btn>
  </SettingsSection>
</template>

<style scoped>
.overlay-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--sidebar-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.screens-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.screens-header .overlay-label {
  margin: 0;
}

.screens {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* Each screen is drawn as a small monitor with the proportions of the real one. */
.screen-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 132px;
  padding: 14px 14px 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: transparent;
  color: var(--sidebar-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.screen-tile:hover {
  border-color: rgba(99, 102, 241, 0.55);
}

.screen-tile:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

.screen-tile.selected {
  border-color: var(--accent-blue);
  background: var(--sidebar-hover);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.monitor {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  min-height: 40px;
  margin-bottom: 10px;
  border: 3px solid var(--sidebar-text-secondary);
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.08);
  color: var(--sidebar-text-secondary);
}

/* The stand under the monitor. */
.monitor::after {
  position: absolute;
  bottom: -9px;
  left: 50%;
  width: 26px;
  height: 4px;
  border-radius: 2px;
  background: var(--sidebar-text-secondary);
  content: '';
  transform: translateX(-50%);
}

.screen-tile.selected .monitor {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.screen-tile.selected .monitor::after {
  background: var(--accent-blue);
}

.monitor-auto {
  aspect-ratio: 16 / 9;
}

.monitor-number {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.tile-title {
  font-size: 14px;
  font-weight: 600;
}

.tile-caption {
  color: var(--sidebar-text-secondary);
  font-size: 12px;
}

/* A green dot on the screen where the overlay is now. */
.in-use {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.25);
}

/* One option per line: what it does on the left, its switch on the right. No box around it. */
.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px;
}

.option-label {
  font-size: 14px;
}

/* A regular button, at the left, not a bar across the whole panel. */
.overlay-action {
  align-self: flex-start;
  margin-top: 4px;
  letter-spacing: 0.5px;
}
</style>
