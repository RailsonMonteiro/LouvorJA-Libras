import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import type {
  ConnectionHistory,
  ConnectionStatus,
  IntegrationPushEvent,
  IntegrationState,
  Slide
} from '@/modules/louvorja/types/louvorja.types'
import type { LouvorJAApi } from '@/types/ipc'

const idle: ConnectionStatus = {
  state: 'disconnected',
  endpoint: null,
  attempt: 0,
  lastError: null,
  retryInMs: null,
  connectedAt: null,
  server: null
}
const slide = (id: string, text = id): Slide => ({
  id,
  presentationId: 'p1',
  index: null,
  total: null,
  title: null,
  text,
  nextText: null,
  kind: 'lyrics',
  receivedAt: '2026-01-01T10:00:00.000Z'
})
const emptyHistory: ConnectionHistory = { connections: [], events: [] }

function setup(state: Partial<IntegrationState> = {}) {
  let push: (event: IntegrationPushEvent) => void = () => undefined
  const unsubscribe = vi.fn()
  const integration = {
    getState: vi.fn().mockResolvedValue({
      status: idle,
      presentation: null,
      currentSlide: null,
      recentSlides: [],
      ...state
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue(emptyHistory),
    removeConnection: vi.fn().mockResolvedValue(emptyHistory),
    onEvent: vi.fn().mockImplementation((listener) => {
      push = listener
      return unsubscribe
    })
  }
  vi.stubGlobal('window', { louvorja: { integration } as unknown as LouvorJAApi })
  setActivePinia(createPinia())
  return {
    store: useLouvorJAStore(),
    integration,
    unsubscribe,
    push: (e: IntegrationPushEvent) => push(e)
  }
}

describe('louvorja store', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('subscribes before loading the snapshot and applies it', async () => {
    const order: string[] = []
    const { store, integration } = setup({
      status: { ...idle, state: 'connected' },
      currentSlide: slide('a'),
      recentSlides: [slide('a')]
    })
    integration.onEvent.mockImplementation(() => (order.push('subscribe'), () => undefined))
    integration.getState.mockImplementation(async () => {
      order.push('getState')
      return {
        status: { ...idle, state: 'connected' },
        presentation: null,
        currentSlide: slide('a'),
        recentSlides: [slide('a')]
      }
    })

    await store.init()
    expect(order).toEqual(['subscribe', 'getState'])
    expect(store.isConnected).toBe(true)
    expect(store.currentSlide?.id).toBe('a')
  })

  it('follows status, presentation and slide events', async () => {
    const { store, push } = setup()
    await store.init()

    push({ kind: 'status', status: { ...idle, state: 'reconnecting', attempt: 2 } })
    expect(store.status.state).toBe('reconnecting')
    expect(store.isActive).toBe(true)
    expect(store.isConnected).toBe(false)

    push({ kind: 'presentation', presentation: { id: 'p1', title: 'Culto', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'slide', slide: slide('b') })
    expect(store.currentSlide?.id).toBe('b')
    expect(store.recentSlides.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('ignores a slide already present (snapshot and live event overlap)', async () => {
    const { store, push } = setup({ currentSlide: slide('a'), recentSlides: [slide('a')] })
    await store.init()
    push({ kind: 'slide', slide: slide('a') })
    expect(store.recentSlides).toHaveLength(1)
  })

  it('clears the slides when a different presentation starts', async () => {
    const { store, push } = setup()
    await store.init()
    push({ kind: 'presentation', presentation: { id: 'p1', title: 'A', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'presentation', presentation: { id: 'p2', title: 'B', startedAt: 'x' } })

    expect(store.recentSlides).toEqual([])
    expect(store.currentSlide).toBeNull()
  })

  it('keeps the last slide when the presentation ends', async () => {
    const { store, push } = setup()
    await store.init()
    push({ kind: 'presentation', presentation: { id: 'p1', title: 'A', startedAt: 'x' } })
    push({ kind: 'slide', slide: slide('a') })
    push({ kind: 'presentation', presentation: null })

    expect(store.presentation).toBeNull()
    expect(store.currentSlide?.id).toBe('a')
  })

  it('refreshes the history when the connection state changes', async () => {
    const { store, push, integration } = setup()
    await store.init()
    const calls = integration.getHistory.mock.calls.length

    push({ kind: 'status', status: { ...idle, state: 'connected' } })
    push({ kind: 'status', status: { ...idle, state: 'connected', connectedAt: 'later' } }) // same state
    await vi.waitFor(() => expect(integration.getHistory.mock.calls.length).toBe(calls + 1))
  })

  it('delegates connect/disconnect and stops listening on dispose', async () => {
    const { store, integration, unsubscribe } = setup()
    await store.init()
    await store.init() // idempotent
    expect(integration.onEvent).toHaveBeenCalledTimes(1)

    const endpoint = { host: '10.0.0.1', port: 7070, token: 'AB12c' } as const
    await store.connect(endpoint)
    await store.disconnect()
    expect(integration.connect).toHaveBeenCalledWith(endpoint)
    expect(integration.disconnect).toHaveBeenCalled()

    store.dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
