import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import type { TranslationResult } from '@/modules/libras/types/libras.types'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { api } from '@/services/api'
import type { OverlayCommand, SignCacheStats } from '@/types/ipc'
import { useSettingsStore } from '@/stores/settings.store'
import { VLibrasPlayer, type PlayerEvent } from '../engine/VLibrasPlayer'
import { signsBaseUrl } from '../types/avatar.types'

/**
 * - `checking`: looking for the player files.
 * - `unavailable`: the player was not downloaded (`npm run player:fetch`).
 * - `loading`: the player page is starting (takes a few seconds).
 * - `ready`: it accepts commands.
 * - `error`: it did not start.
 */
export type AvatarStatus = 'checking' | 'unavailable' | 'loading' | 'ready' | 'error'

/** Where the avatar is drawn on screen, in window pixels, plus the area it may not leave. */
export interface LayerRect {
  x: number
  y: number
  width: number
  height: number
  /** The visible window of the scrolling area that holds the stage. */
  clip: { x: number; y: number; width: number; height: number }
}

/** The player takes a few seconds; after this long without finishing, something is wrong. */
const LOAD_TIMEOUT_MS = 45_000

/**
 * How long a slide waits for its signs to be downloaded before the avatar starts anyway. A
 * negative `interpretDelay` ("adiantar") shortens this; it mirrors `INTERPRET_DELAY_RANGE.min`
 * in settings.ts, since going more negative than that would not shorten it any further.
 */
const SIGNS_WAIT_MS = 2_500

/** How far the signs of the slide on the air are: none needed yet, downloading, all there, some missing. */
export type SignsState = 'idle' | 'loading' | 'ready' | 'partial'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface PrefetchOutcome {
  cached: number
  downloaded: number
  failed: number
}

/** The result of `work`, or `null` if it takes longer than `ms`. */
function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    void work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

export const useAvatarStore = defineStore('avatar', () => {
  const settingsStore = useSettingsStore()
  const { settings } = storeToRefs(settingsStore)

  const status = ref<AvatarStatus>('checking')
  const progress = ref(0)
  const playing = ref(false)
  const paused = ref(false)
  const counter = ref({ count: 0, max: 0 })
  const gloss = ref<string | null>(null)
  const layerRect = ref<LayerRect | null>(null)
  /** Changes when the player page must be loaded again (retry). */
  const reloadKey = ref(0)
  const cacheStats = ref<SignCacheStats>({ files: 0, bytes: 0 })
  const signsState = ref<SignsState>('idle')
  /** When the avatar will start signing the slide it is waiting for (the delay setting), if any. */
  const startsAt = ref<number | null>(null)

  let player: VLibrasPlayer | null = null
  let detachListeners: (() => void) | null = null
  let loadTimer: ReturnType<typeof setTimeout> | null = null
  let appliedAvatar: string = 'icaro'
  const prefetched = new Map<string, Promise<PrefetchOutcome | null>>()

  const ready = computed(() => status.value === 'ready')

  // --- availability and lifecycle ---

  async function checkAvailability(): Promise<void> {
    try {
      const response = await fetch('/vlibras/unity/playerweb.json')
      // The dev server answers a missing file with its own page, so the type must be checked too.
      const isJson = (response.headers.get('content-type') ?? '').includes('json')
      status.value = response.ok && isJson ? 'loading' : 'unavailable'
    } catch {
      status.value = 'unavailable'
    }
  }

  /** Connects the store to the player iframe once it exists. Safe to call again. */
  function attach(frame: HTMLIFrameElement): void {
    detach()
    const origin = new URL(frame.src, window.location.href).origin

    player = new VLibrasPlayer({
      post: (message) => frame.contentWindow?.postMessage(message, origin)
    })
    player.onEvent(handleEvent)

    const onMessage = (event: MessageEvent): void => {
      if (event.source === frame.contentWindow) player?.handleMessage(event.data)
    }
    window.addEventListener('message', onMessage)
    detachListeners = () => window.removeEventListener('message', onMessage)

    status.value = 'loading'
    progress.value = 0
    loadTimer = setTimeout(() => {
      if (status.value === 'loading') status.value = 'error'
    }, LOAD_TIMEOUT_MS)
  }

  function detach(): void {
    detachListeners?.()
    detachListeners = null
    if (loadTimer) clearTimeout(loadTimer)
    loadTimer = null
    player = null
    playing.value = false
    paused.value = false
  }

  function retry(): void {
    status.value = 'checking'
    reloadKey.value += 1
    void checkAvailability()
  }

  function handleEvent(event: PlayerEvent): void {
    switch (event.type) {
      case 'progress':
        progress.value = Math.round(event.value * 100)
        break
      case 'loaded':
        if (loadTimer) clearTimeout(loadTimer)
        status.value = 'ready'
        progress.value = 100
        applySettings()
        break
      case 'state':
        playing.value = event.playing
        paused.value = event.paused
        if (!event.playing && !event.loading) counter.value = { count: 0, max: 0 }
        break
      case 'count':
        counter.value = { count: event.count, max: event.max }
        break
      case 'avatar':
        appliedAvatar = event.avatar
        break
      case 'error':
        status.value = 'error'
        break
    }
  }

  /** Pushes what the settings say to the player (it forgets everything when it restarts). */
  function applySettings(): void {
    if (!player || status.value !== 'ready') return
    const current = settings.value
    player.setBaseUrl(signsBaseUrl(current.signRegion))
    if (current.avatar !== appliedAvatar) {
      player.setAvatar(current.avatar)
      appliedAvatar = current.avatar
    }
    player.setSpeed(current.avatarSpeed)
    player.hideCaptions()
  }

  // --- commands ---

  function play(text: string): boolean {
    if (!player || !ready.value || !text.trim()) return false
    gloss.value = text.trim()
    player.play(text)
    return true
  }

  function repeat(): boolean {
    return gloss.value ? play(gloss.value) : false
  }

  function stop(): void {
    player?.stop()
  }

  function togglePause(): void {
    if (!player) return
    if (paused.value) player.resume()
    else player.pause()
  }

  function setLayerRect(rect: LayerRect | null): void {
    layerRect.value = rect
  }

  // --- signs kept on this computer ---

  async function refreshCacheStats(): Promise<void> {
    cacheStats.value = await api().avatar.getCacheStats()
  }

  async function clearCache(): Promise<void> {
    cacheStats.value = await api().avatar.clearCache()
    prefetched.clear()
  }

  /**
   * Downloads the signs a translation needs, so they play at once (and work offline later).
   * Resolves when they are all there (`null` when there was nothing to do or it did not work).
   */
  function prefetchSigns(translation: TranslationResult): Promise<PrefetchOutcome | null> {
    if (status.value === 'unavailable' || status.value === 'checking') return Promise.resolve(null)
    const key = `${settings.value.signRegion}|${translation.gloss}`
    if (!translation.gloss) return Promise.resolve(null)
    const known = prefetched.get(key)
    if (known) return known

    const names = new Set<string>()
    for (const token of translation.tokens) {
      if (token.availability === 'sign') names.add(token.text)
      // A word without a sign is fingerspelled, so its letters are needed.
      if (token.availability === 'spelled') {
        for (const letter of token.text.normalize('NFD').replace(/[̀-ͯ]/g, '')) names.add(letter)
      }
    }
    const work: Promise<PrefetchOutcome | null> =
      names.size > 0
        ? api()
            .avatar.prefetch(settings.value.signRegion, [...names])
            .catch(() => null)
        : Promise.resolve(null)
    prefetched.set(key, work)
    return work
  }

  /** Does what the projection page asks of the overlay window (see OverlayCommand). */
  function applyCommand(command: OverlayCommand): void {
    switch (command.type) {
      case 'play':
        play(command.gloss)
        break
      case 'repeat':
        repeat()
        break
      case 'stop':
        stop()
        break
      case 'pause':
        if (!paused.value) togglePause()
        break
      case 'resume':
        if (paused.value) togglePause()
        break
    }
  }

  /**
   * Keeps the avatar in step with the presentation: applies the settings, signs each slide that
   * arrives (when automatic interpretation is on) and gets the next slide's signs ready.
   */
  async function init(): Promise<void> {
    await checkAvailability()

    watch(
      () => [settings.value.avatar, settings.value.avatarSpeed, settings.value.signRegion],
      applySettings
    )

    const louvorja = useLouvorJAStore()
    const libras = useLibrasStore()
    const current = computed(() => {
      // The last slide is remembered after the presentation ends; it is no longer on the air.
      const slide = louvorja.presentation ? louvorja.currentSlide : null
      const translation = slide ? libras.get(slide.text) : null
      return slide && translation?.gloss
        ? { id: slide.id, translation, receivedAt: Date.parse(slide.receivedAt) }
        : null
    })
    const next = computed(() => {
      const text = louvorja.currentSlide?.nextText
      return text ? libras.get(text) : null
    })

    watch(next, (translation) => translation && prefetchSigns(translation), { immediate: true })

    // Slide -> translation -> signs -> avatar, in that order, and always for the slide on the air:
    // if another one arrives while this waits, this one is dropped.
    let lastSigned: string | null = null
    watch(
      [current, status, () => settings.value.autoInterpret],
      async ([slide, state, auto]) => {
        if (!slide) {
          // The slide is gone (presentation over, blank slide): the avatar must not keep signing it.
          if (lastSigned !== null && (louvorja.currentSlide === null || !louvorja.presentation)) {
            lastSigned = null
            startsAt.value = null
            signsState.value = 'idle'
            if (auto && (playing.value || paused.value)) stop()
          }
          return
        }
        const signs = prefetchSigns(slide.translation)
        if (!auto || state !== 'ready') return

        const key = `${slide.id}|${slide.translation.gloss}`
        if (key === lastSigned) return
        lastSigned = key

        // A negative delay ("adiantar") shortens how long the avatar is willing to wait for the
        // signs here, down to not waiting at all - it starts with whatever is ready by then.
        signsState.value = 'loading'
        const signsWaitMs = Math.max(
          0,
          SIGNS_WAIT_MS + Math.min(0, settings.value.interpretDelay) * 1000
        )
        const outcome = await within(signs, signsWaitMs)
        if (lastSigned !== key) return // a newer slide took over while the signs came
        signsState.value = outcome && outcome.failed > 0 ? 'partial' : 'ready'

        // A positive delay ("atraso") is the opposite: once the signs are ready, it is a
        // deliberate pause, counted from the moment the slide came on the air (so the time
        // already spent translating and downloading signs is part of it, not added on top).
        const arrived = Number.isFinite(slide.receivedAt) ? slide.receivedAt : Date.now()
        const wait = Math.max(0, settings.value.interpretDelay) * 1000 - (Date.now() - arrived)
        if (wait > 0) {
          startsAt.value = Date.now() + wait
          await sleep(wait)
          if (lastSigned !== key) return // dropped while waiting: another slide, or the end
          startsAt.value = null
        }
        play(slide.translation.gloss)
      },
      { immediate: true }
    )
  }

  return {
    status,
    progress,
    playing,
    paused,
    counter,
    gloss,
    layerRect,
    reloadKey,
    cacheStats,
    signsState,
    startsAt,
    ready,
    init,
    checkAvailability,
    prefetchSigns,
    applyCommand,
    attach,
    detach,
    retry,
    play,
    repeat,
    stop,
    togglePause,
    setLayerRect,
    refreshCacheStats,
    clearCache,
    applySettings
  }
})
