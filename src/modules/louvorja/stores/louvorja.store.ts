import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LouvorJAService } from '../services/LouvorJAService'
import type {
  ConnectionHistory,
  ConnectionStatus,
  Endpoint,
  IntegrationPushEvent,
  IntegrationState,
  Presentation,
  Slide
} from '../types/louvorja.types'

const IDLE_STATUS: ConnectionStatus = {
  state: 'disconnected',
  endpoint: null,
  attempt: 0,
  lastError: null,
  retryInMs: null,
  connectedAt: null,
  server: null
}

export const useLouvorJAStore = defineStore('louvorja', () => {
  const status = ref<ConnectionStatus>({ ...IDLE_STATUS })
  const presentation = ref<Presentation | null>(null)
  const currentSlide = ref<Slide | null>(null)
  /** Oldest first, like in the main process. */
  const recentSlides = ref<Slide[]>([])
  const history = ref<ConnectionHistory>({ connections: [], events: [] })

  const isConnected = computed(() => status.value.state === 'connected')
  /** True while connected or while trying/retrying: the user can cancel. */
  const isActive = computed(() => status.value.state !== 'disconnected')

  let unsubscribe: (() => void) | null = null

  function applyState(state: IntegrationState): void {
    status.value = state.status
    presentation.value = state.presentation
    currentSlide.value = state.currentSlide
    recentSlides.value = state.recentSlides
  }

  function applyEvent(event: IntegrationPushEvent): void {
    switch (event.kind) {
      case 'status': {
        const changed = event.status.state !== status.value.state
        status.value = event.status
        if (changed) void refreshHistory()
        break
      }
      case 'presentation':
        if (event.presentation && event.presentation.id !== presentation.value?.id) {
          currentSlide.value = null
          recentSlides.value = []
        }
        presentation.value = event.presentation
        break
      case 'slide': {
        const last = recentSlides.value.at(-1)
        // The snapshot and the live events can overlap right after start-up.
        if (last?.id === event.slide.id && last.text === event.slide.text) break
        currentSlide.value = event.slide
        recentSlides.value = [...recentSlides.value, event.slide].slice(-100)
        break
      }
    }
  }

  /** Subscribes first and then loads the snapshot, so no event is lost in between. */
  async function init(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = LouvorJAService.onEvent(applyEvent)
    applyState(await LouvorJAService.getState())
    await refreshHistory()
  }

  function dispose(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  async function refreshHistory(): Promise<void> {
    history.value = await LouvorJAService.getHistory()
  }

  async function connect(endpoint: Endpoint): Promise<void> {
    await LouvorJAService.connect(endpoint)
  }

  async function disconnect(): Promise<void> {
    await LouvorJAService.disconnect()
  }

  async function removeConnection(id: number): Promise<void> {
    history.value = await LouvorJAService.removeConnection(id)
  }

  return {
    status,
    presentation,
    currentSlide,
    recentSlides,
    history,
    isConnected,
    isActive,
    init,
    dispose,
    refreshHistory,
    connect,
    disconnect,
    removeConnection
  }
})
