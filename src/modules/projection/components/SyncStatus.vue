<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'

const { t } = useI18n()
const avatar = useAvatarStore()
const libras = useLibrasStore()
const louvorja = useLouvorJAStore()

type StepState = 'idle' | 'working' | 'done' | 'warning' | 'error'
interface Step {
  id: 'slide' | 'translation' | 'signs' | 'avatar'
  state: StepState
  text: string
}

// While the avatar waits for the delay to pass, the chip counts down.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
watch(
  () => avatar.startsAt,
  (at) => {
    if (ticker) clearInterval(ticker)
    ticker = null
    if (at !== null) {
      now.value = Date.now()
      ticker = setInterval(() => (now.value = Date.now()), 250)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => ticker && clearInterval(ticker))

const translation = computed(() =>
  louvorja.currentSlide ? libras.get(louvorja.currentSlide.text) : null
)

/** Slide -> translation -> signs -> avatar: where the slide on the air is in the chain. */
const steps = computed<Step[]>(() => {
  const slide = louvorja.currentSlide
  const translated = translation.value

  const signsText = t(`projection.sync.signs.${avatar.signsState}`)
  const signsState: StepState = {
    idle: 'idle',
    loading: 'working',
    ready: 'done',
    partial: 'warning'
  }[avatar.signsState] as StepState

  let avatarState: StepState = 'idle'
  let avatarText = t('projection.status.checking')
  if (avatar.status === 'ready' && avatar.startsAt !== null && !avatar.playing) {
    avatarState = 'working'
    avatarText = t('projection.sync.startsIn', {
      seconds: Math.max(1, Math.ceil((avatar.startsAt - now.value) / 1000))
    })
  } else if (avatar.status === 'ready') {
    avatarState = avatar.playing ? 'working' : 'done'
    // The player reports how many signs there are a moment after it starts.
    avatarText = !avatar.playing
      ? t('projection.status.ready')
      : avatar.counter.max > 0
        ? t('projection.status.playing', { count: avatar.counter.count, max: avatar.counter.max })
        : t('projection.status.signing')
  } else if (avatar.status === 'loading') {
    avatarState = 'working'
    avatarText = t('projection.status.loading', { progress: avatar.progress })
  } else if (avatar.status === 'unavailable' || avatar.status === 'error') {
    avatarState = 'error'
    avatarText = t(`projection.status.${avatar.status}`)
  }

  return [
    {
      id: 'slide',
      state: slide ? 'done' : 'idle',
      text: slide ? t('projection.sync.slideOn') : t('projection.sync.slideNone')
    },
    {
      id: 'translation',
      state: translated ? 'done' : slide ? 'working' : 'idle',
      text: translated ? t(`libras.sources.${translated.source}`) : '—'
    },
    { id: 'signs', state: signsState, text: signsText },
    { id: 'avatar', state: avatarState, text: avatarText }
  ]
})

const icons: Record<StepState, string> = {
  idle: 'mdi-circle-outline',
  working: 'mdi-loading',
  done: 'mdi-check-circle',
  warning: 'mdi-alert-circle',
  error: 'mdi-close-circle'
}
const colors: Record<StepState, string | undefined> = {
  idle: undefined,
  working: 'primary',
  done: 'success',
  warning: 'warning',
  error: 'error'
}
</script>

<template>
  <div class="d-flex flex-wrap align-center ga-2" data-testid="sync-status">
    <!-- The arrow and its step wrap together, so a line never ends with a lone arrow. -->
    <span v-for="(step, index) in steps" :key="step.id" class="d-inline-flex align-center ga-2">
      <v-icon v-if="index > 0" size="small" class="text-medium-emphasis">mdi-chevron-right</v-icon>
      <v-chip
        :color="colors[step.state]"
        variant="tonal"
        size="small"
        label
        :data-testid="`sync-${step.id}`"
        :data-state="step.state"
      >
        <v-icon start size="small" :class="{ 'mdi-spin': step.state === 'working' }">
          {{ icons[step.state] }}
        </v-icon>
        <strong class="mr-1">{{ $t(`projection.sync.steps.${step.id}`) }}</strong>
        {{ step.text }}
      </v-chip>
    </span>
  </div>
</template>
