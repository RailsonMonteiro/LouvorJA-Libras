<script setup lang="ts">
// The avatar position buttons use two icons from Flaticon's UIcons (see NOTICE.md for the
// required credit): "regular straight" for the align-left glyph (mirrored for "right" too) and
// "solid straight" for the center one.
import '@flaticon/flaticon-uicons/css/regular/straight.css'
import '@flaticon/flaticon-uicons/css/solid/straight.css'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ModuleHeader from '@/components/ModuleHeader.vue'
import AvatarPicker from '@/modules/avatar/components/AvatarPicker.vue'
import SignProgress from '@/modules/avatar/components/SignProgress.vue'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import {
  AVATAR_POSITIONS,
  AVATAR_SPEEDS,
  REGION_CODES,
  REGION_NAMES,
  type AvatarPosition
} from '@/modules/avatar/types/avatar.types'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useOverlayStore } from '@/modules/overlay/stores/overlay.store'
import { useSettingsStore } from '@/stores/settings.store'
import { AVATAR_SCALE_RANGE, INTERPRET_DELAY_RANGE, type AppSettings } from '@/types/settings'
import ProjectionStage from './components/ProjectionStage.vue'
import SyncStatus from './components/SyncStatus.vue'

const { t } = useI18n()
const avatar = useAvatarStore()
const libras = useLibrasStore()
const louvorja = useLouvorJAStore()
const overlay = useOverlayStore()
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

/** What the avatar would sign for the slide on screen. */
const translation = computed(() =>
  louvorja.currentSlide ? libras.get(louvorja.currentSlide.text) : null
)

/** Used by "Test" while no slide has arrived, so a new avatar can be seen in action. */
const SAMPLE_GLOSS = 'DEUS AMOR'

/** "Right" reuses the "left" glyph, flipped in CSS (.position-icon-flip): there is no mirror icon.
 *  "fi-ss-center" (as asked) does not exist in this icon pack; "align-center" is the closest real
 *  icon in the same "align-*" family as "align-left". */
const POSITION_ICON: Record<AvatarPosition, string> = {
  left: 'fi fi-rs-align-left',
  center: 'fi fi-ss-align-center',
  right: 'fi fi-rs-align-left'
}

/** Where the sliding highlight in the speed picker sits, so it can move to it instead of jumping. */
const selectedSpeedIndex = computed(() => AVATAR_SPEEDS.indexOf(settings.value.avatarSpeed))

const statusText = computed(() => {
  if (avatar.status === 'ready') {
    if (avatar.paused) return t('projection.status.paused')
    if (avatar.playing && avatar.counter.max > 0) {
      return t('projection.status.playing', {
        count: avatar.counter.count,
        max: avatar.counter.max
      })
    }
    return t('projection.status.ready')
  }
  return t(`projection.status.${avatar.status}`, { progress: avatar.progress })
})

const statusColor = computed(
  () =>
    ({
      checking: 'grey',
      unavailable: 'error',
      loading: 'warning',
      ready: avatar.playing ? 'primary' : 'success',
      error: 'error'
    })[avatar.status]
)

function change<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  void settingsStore.update(key, value)
}

// The sliders move the avatar on the stage while they are dragged, but only the value they stop
// on is saved (a short pause after the last movement).
const scale = ref(settings.value.avatarScale)
const delay = ref(settings.value.interpretDelay)
watch(
  () => settings.value.interpretDelay,
  (value) => (delay.value = value)
)
watch(
  () => settings.value.avatarScale,
  (value) => (scale.value = value)
)

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function saveSoon<K extends 'avatarScale' | 'interpretDelay'>(key: K, value: number): void {
  clearTimeout(saveTimers.get(key))
  saveTimers.set(
    key,
    setTimeout(() => change(key, value), 200)
  )
}
watch(scale, (value) => saveSoon('avatarScale', value))
watch(delay, (value) => saveSoon('interpretDelay', value))

// What is done here is done in the overlay window too, when it is open.
function play(): void {
  const gloss = translation.value?.gloss || SAMPLE_GLOSS
  avatar.play(gloss)
  overlay.mirror({ type: 'play', gloss })
}

function stop(): void {
  avatar.stop()
  overlay.mirror({ type: 'stop' })
}

function repeat(): void {
  avatar.repeat()
  overlay.mirror({ type: 'repeat' })
}

function togglePause(): void {
  const pausing = !avatar.paused
  avatar.togglePause()
  overlay.mirror({ type: pausing ? 'pause' : 'resume' })
}
</script>

<template>
  <div class="page-container">
    <ModuleHeader
      :title="$t('projection.title')"
      icon="mdi-projector-screen"
      test-id="projection-title"
    />

    <v-row>
      <v-col cols="12" lg="8">
        <v-card :title="$t('projection.stage')" prepend-icon="mdi-monitor-eye">
          <template #append>
            <v-chip
              :color="statusColor"
              size="small"
              label
              data-testid="avatar-status"
              :data-status="avatar.status"
            >
              <v-icon v-if="avatar.status === 'loading'" start class="mdi-spin" size="small">
                mdi-loading
              </v-icon>
              {{ statusText }}
            </v-chip>
          </template>
          <v-card-text>
            <ProjectionStage />

            <v-alert
              v-if="avatar.status === 'unavailable'"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-4"
              data-testid="avatar-unavailable"
              :text="$t('projection.unavailableHint')"
            />
            <v-alert
              v-else-if="avatar.status === 'error'"
              type="error"
              variant="tonal"
              density="compact"
              class="mt-4"
              data-testid="avatar-error"
              :text="$t('projection.errorHint')"
            >
              <template #append>
                <v-btn
                  size="small"
                  variant="text"
                  data-testid="avatar-retry"
                  @click="avatar.retry()"
                >
                  {{ $t('projection.retry') }}
                </v-btn>
              </template>
            </v-alert>

            <div class="mt-4">
              <div class="text-subtitle-2 mb-2">{{ $t('projection.position') }}</div>
              <div class="position-picker" role="radiogroup" data-testid="avatar-position">
                <button
                  v-for="side in AVATAR_POSITIONS"
                  :key="side"
                  type="button"
                  role="radio"
                  class="position-option"
                  :class="{ selected: settings.avatarPosition === side }"
                  :aria-checked="settings.avatarPosition === side"
                  :aria-label="$t(`projection.positions.${side}`)"
                  @click="change('avatarPosition', side)"
                >
                  <span class="position-tile">
                    <i
                      class="position-icon"
                      :class="[POSITION_ICON[side], { 'position-icon-flip': side === 'right' }]"
                    />
                    <v-icon
                      v-if="settings.avatarPosition === side"
                      size="15"
                      class="position-check"
                    >
                      mdi-check-circle
                    </v-icon>
                  </span>
                </button>
              </div>
            </div>

            <div class="mt-4">
              <h3 class="text-subtitle-1 font-weight-medium mb-2">
                {{ $t('projection.sync.title') }}
              </h3>
              <SyncStatus />
            </div>

            <div class="mt-4">
              <h3 class="text-subtitle-1 font-weight-medium mb-2">{{ $t('projection.signs') }}</h3>
              <SignProgress v-if="translation?.tokens.length" :tokens="translation.tokens" />
              <p v-else class="text-medium-emphasis">{{ $t('projection.noGloss') }}</p>
            </div>
          </v-card-text>
          <v-card-actions class="px-4 pb-4 ga-2">
            <v-btn
              color="primary"
              prepend-icon="mdi-play"
              :disabled="!avatar.ready"
              data-testid="avatar-play"
              @click="play"
            >
              {{ translation ? $t('projection.play') : $t('projection.test') }}
            </v-btn>
            <v-btn
              variant="tonal"
              :prepend-icon="avatar.paused ? 'mdi-play-pause' : 'mdi-pause'"
              :disabled="!avatar.ready || !avatar.playing"
              data-testid="avatar-pause"
              @click="togglePause()"
            >
              {{ avatar.paused ? $t('projection.resume') : $t('projection.pause') }}
            </v-btn>
            <v-btn
              variant="tonal"
              prepend-icon="mdi-stop"
              :disabled="!avatar.ready"
              data-testid="avatar-stop"
              @click="stop()"
            >
              {{ $t('projection.stop') }}
            </v-btn>
            <v-btn
              variant="tonal"
              prepend-icon="mdi-repeat"
              :disabled="!avatar.ready || !avatar.gloss"
              data-testid="avatar-repeat"
              @click="repeat()"
            >
              {{ $t('projection.repeat') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4">
        <v-card :title="$t('projection.avatar')" prepend-icon="mdi-account-voice">
          <v-card-text>
            <AvatarPicker class="mb-5" />

            <div class="text-subtitle-2 mb-1">{{ $t('projection.speed') }}</div>
            <div class="speed-picker mb-5" role="radiogroup" data-testid="avatar-speed">
              <div
                class="speed-thumb"
                :style="{ transform: `translateX(calc(${selectedSpeedIndex} * (44px + 8px)))` }"
              />
              <button
                v-for="speed in AVATAR_SPEEDS"
                :key="speed"
                type="button"
                role="radio"
                class="speed-option"
                :class="{ selected: settings.avatarSpeed === speed }"
                :aria-checked="settings.avatarSpeed === speed"
                @click="change('avatarSpeed', speed)"
              >
                {{ speed }}×
              </button>
            </div>

            <v-autocomplete
              :model-value="settings.signRegion"
              :label="$t('projection.region')"
              :items="REGION_CODES.map((code) => ({ value: code, title: REGION_NAMES[code] }))"
              variant="outlined"
              density="comfortable"
              data-testid="avatar-region"
              @update:model-value="change('signRegion', $event)"
            />

            <v-switch
              :model-value="settings.autoInterpret"
              :label="$t('projection.autoInterpret')"
              color="primary"
              hide-details
              density="comfortable"
              data-testid="avatar-auto"
              @update:model-value="change('autoInterpret', Boolean($event))"
            />
            <div class="text-subtitle-2 mt-3">
              {{ delay < 0 ? $t('projection.advance') : $t('projection.delay') }}:
              {{
                delay === 0
                  ? $t('projection.delayNone')
                  : $t('projection.delayValue', { seconds: Math.abs(delay) })
              }}
            </div>
            <v-slider
              v-model="delay"
              :min="INTERPRET_DELAY_RANGE.min"
              :max="INTERPRET_DELAY_RANGE.max"
              :step="INTERPRET_DELAY_RANGE.step"
              color="primary"
              hide-details
              class="mb-1"
              data-testid="interpret-delay"
            />
            <p class="text-caption text-medium-emphasis mb-3">{{ $t('projection.delayHint') }}</p>

            <v-switch
              :model-value="settings.stageShowSlide"
              :label="$t('projection.showSlide')"
              color="primary"
              hide-details
              density="comfortable"
              class="mb-4"
              data-testid="stage-show-slide"
              @update:model-value="change('stageShowSlide', Boolean($event))"
            />

            <div class="text-subtitle-2">{{ $t('projection.size') }}: {{ scale }}%</div>
            <v-slider
              v-model="scale"
              :min="AVATAR_SCALE_RANGE.min"
              :max="AVATAR_SCALE_RANGE.max"
              :step="5"
              color="primary"
              hide-details
              class="mb-3"
              data-testid="avatar-scale"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
/* No box around the row itself: a single pill highlight (fully rounded ends, not a stretched
   rectangle) slides to whichever speed is chosen, instead of jumping. Fixed-size options (44px
   + 8px gap, matching the thumb's own size and the translateX step in the template) rather than
   grid columns stretched to the container's width - the highlight stays exactly the size of one
   option instead of a share of whatever room is left over. */
.speed-picker {
  position: relative;
  display: flex;
  gap: 8px;
}

.speed-thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 44px;
  height: 36px;
  border-radius: 18px;
  background: var(--sidebar-hover);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.speed-option {
  position: relative;
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  justify-content: center;
  height: 36px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--sidebar-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease;
}

.speed-option:hover {
  color: var(--sidebar-text);
}

.speed-option:focus-visible {
  outline: none;
}

.speed-option.selected {
  color: var(--accent-blue);
  font-weight: 700;
}

/* Close to the avatar picker's portraits, but square (rounded corners, not a full circle): a
   tile, a ring and a check badge on the chosen one. No label next to it (the "Posição do avatar"
   heading above already says what the row is; aria-label on each button covers screen readers). */
.position-picker {
  display: flex;
  gap: 14px;
}

.position-option {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.position-option:focus-visible {
  outline: none;
}

.position-tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--border-radius);
  background: rgba(127, 127, 127, 0.08);
  color: var(--sidebar-text-secondary);
  transition: var(--transition);
}

.position-option:hover .position-tile,
.position-option:focus-visible .position-tile {
  background: var(--sidebar-hover);
  color: var(--sidebar-text);
}

.position-option.selected .position-tile {
  background: var(--sidebar-hover);
  color: var(--accent-blue);
  box-shadow:
    0 0 0 2px var(--card-bg),
    0 0 0 4px var(--accent-blue);
}

.position-icon {
  font-size: 18px;
}

/* There is no mirrored "align-right" glyph in this icon set: flip the "left" one instead. */
.position-icon-flip {
  display: inline-block;
  transform: scaleX(-1);
}

/* A small tick on the lower right of the chosen circle, same recipe as AvatarPicker's. */
.position-check {
  position: absolute;
  right: -2px;
  bottom: -2px;
  border-radius: 50%;
  background: var(--card-bg);
  color: var(--accent-blue);
}
</style>
