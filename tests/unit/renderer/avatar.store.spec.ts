// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAvatarStore } from '@/modules/avatar/stores/avatar.store'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import type { TranslationResult } from '@/modules/libras/types/libras.types'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { LouvorJAApi } from '@/types/ipc'
import { DEFAULT_SETTINGS } from '@/types/settings'

const translation = (text: string): TranslationResult => ({
  text,
  gloss: text.toUpperCase(),
  tokens: text
    .toUpperCase()
    .split(' ')
    .map((word) => ({ text: word, kind: 'plain', availability: 'sign' })),
  source: 'online',
  edited: false
})

interface Sent {
  method: string
  params?: unknown
}

/** A player iframe that records the commands it receives and can emit events. */
function fakeFrame() {
  const sent: Sent[] = []
  const frame = document.createElement('iframe')
  frame.src = 'http://localhost/vlibras/unity/index.html'
  const contentWindow = {
    postMessage: (message: { method: string; params?: unknown }) =>
      sent.push({ method: message.method, params: message.params })
  }
  Object.defineProperty(frame, 'contentWindow', { value: contentWindow })
  const emit = (event: string, data?: unknown): void => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'unity_event', event, data },
        source: contentWindow as unknown as MessageEventSource
      })
    )
  }
  return { frame, sent, emit }
}

function setup(available = true) {
  const avatarApi = {
    prefetch: vi.fn().mockResolvedValue({ cached: 0, downloaded: 0, failed: 0 }),
    getCacheStats: vi.fn().mockResolvedValue({ files: 3, bytes: 1024 }),
    clearCache: vi.fn().mockResolvedValue({ files: 0, bytes: 0 })
  }
  const libras = {
    translate: vi.fn(async (text: string) => translation(text)),
    getCatalogStatus: vi
      .fn()
      .mockResolvedValue({ ready: false, count: 0, updatedAt: null, url: '' })
  }
  const integration = {
    getState: vi.fn().mockResolvedValue({
      status: { state: 'disconnected' },
      presentation: null,
      currentSlide: null,
      recentSlides: []
    }),
    getHistory: vi.fn().mockResolvedValue({ connections: [], events: [] }),
    onEvent: vi.fn().mockReturnValue(() => undefined)
  }
  const settings = {
    getAll: vi.fn(),
    set: vi.fn(async (key: string, value: unknown) => ({ ...DEFAULT_SETTINGS, [key]: value }))
  }
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      louvorja: { avatar: avatarApi, libras, integration, settings } as unknown as LouvorJAApi
    })
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      available
        ? new Response('{}', { headers: { 'content-type': 'application/json' } })
        : new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    )
  )
  setActivePinia(createPinia())
  return { avatarApi, libras, store: useAvatarStore(), settings: useSettingsStore() }
}

const OPEN_PRESENTATION = { id: 'p1', title: 'Louvor', startedAt: '2026-09-21T12:00:00Z' }

const slide = (id: string, text: string, nextText: string | null = null, receivedAt = 'x') => ({
  id,
  presentationId: null,
  index: null,
  total: null,
  title: null,
  text,
  nextText,
  kind: 'lyrics' as const,
  receivedAt
})

describe('avatar store', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('is unavailable when the player files are missing (dev server answers with HTML)', async () => {
    const { store } = setup(false)
    await store.checkAvailability()
    expect(store.status).toBe('unavailable')
  })

  it('goes from loading to ready and pushes the settings to the player', async () => {
    const { store, settings } = setup()
    settings.settings = { ...DEFAULT_SETTINGS, avatar: 'guga', avatarSpeed: 1.5, signRegion: 'SP' }
    await store.checkAvailability()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    expect(store.status).toBe('loading')

    emit('update_progress', 0.5)
    expect(store.progress).toBe(50)
    emit('on_load_player')
    expect(store.status).toBe('ready')

    expect(sent).toEqual([
      { method: 'setBaseUrl', params: 'app://renderer/__signs__/SP/' },
      { method: 'Change', params: 'guga' },
      { method: 'setSlider', params: 1.5 },
      { method: 'setSubtitlesState', params: 0 }
    ])
  })

  it('ignores messages that do not come from its own frame', async () => {
    const { store } = setup()
    const { frame } = fakeFrame()
    store.attach(frame)
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'unity_event', event: 'on_load_player' } })
    )
    expect(store.status).toBe('loading')
  })

  it('does not send commands before the player is ready, nor an empty gloss', async () => {
    const { store } = setup()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    expect(store.play('DEUS')).toBe(false)
    emit('on_load_player')
    sent.length = 0

    expect(store.play('   ')).toBe(false)
    expect(store.play('DEUS AMOR')).toBe(true)
    expect(sent).toEqual([{ method: 'playNow', params: 'DEUS AMOR' }])
    expect(store.repeat()).toBe(true)
  })

  it('follows the player state and toggles pause', async () => {
    const { store } = setup()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    emit('on_load_player')
    sent.length = 0

    emit('on_playing_state_change', ['True', 'False', 'False', 'False', 'True'])
    emit('counter_gloss', [2, 5])
    expect(store.playing).toBe(true)
    expect(store.counter).toEqual({ count: 2, max: 5 })

    store.togglePause()
    emit('on_playing_state_change', ['True', 'True', 'False', 'False', 'True'])
    store.togglePause()
    expect(sent.map((c) => [c.method, c.params])).toEqual([
      ['setPauseState', 1],
      ['setPauseState', 0]
    ])

    emit('on_playing_state_change', ['False', 'False', 'False', 'False', 'True'])
    expect(store.counter).toEqual({ count: 0, max: 0 })
  })

  it('changes avatar and speed when the settings change, only what changed', async () => {
    const { store, settings } = setup()
    await store.init()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    emit('on_load_player')
    sent.length = 0

    settings.settings = { ...settings.settings, avatar: 'hosana' }
    await nextTick()
    expect(sent.filter((c) => c.method === 'Change')).toEqual([
      { method: 'Change', params: 'hosana' }
    ])

    sent.length = 0
    settings.settings = { ...settings.settings, avatarSpeed: 2 }
    await nextTick()
    expect(sent.some((c) => c.method === 'Change')).toBe(false)
    expect(sent).toContainEqual({ method: 'setSlider', params: 2 })
  })

  it('gives up when the player never finishes loading, and can retry', async () => {
    const { store } = setup()
    const { frame } = fakeFrame()
    store.attach(frame)
    vi.advanceTimersByTime(46_000)
    expect(store.status).toBe('error')

    const before = store.reloadKey
    store.retry()
    expect(store.reloadKey).toBe(before + 1)
    expect(store.status).toBe('checking')
  })

  it('signs each new slide once when automatic interpretation is on', async () => {
    const { store, settings, avatarApi } = setup()
    const louvorja = useLouvorJAStore()
    louvorja.presentation = OPEN_PRESENTATION
    await useLibrasStore().init()
    await store.init()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    emit('on_load_player')
    settings.settings = { ...DEFAULT_SETTINGS, autoInterpret: true }
    sent.length = 0

    louvorja.currentSlide = slide('s1', 'Glória a Deus', 'Amém')
    await vi.waitFor(() =>
      expect(sent).toContainEqual({ method: 'playNow', params: 'GLÓRIA A DEUS' })
    )
    // The same slide arriving again is not signed twice.
    sent.length = 0
    louvorja.currentSlide = { ...louvorja.currentSlide! }
    await nextTick()
    expect(sent.filter((c) => c.method === 'playNow')).toHaveLength(0)

    louvorja.currentSlide = slide('s2', 'Amém')
    await vi.waitFor(() => expect(sent).toContainEqual({ method: 'playNow', params: 'AMÉM' }))
    expect(avatarApi.prefetch).toHaveBeenCalled()
  })

  it('does not sign by itself when automatic interpretation is off', async () => {
    const { store, settings } = setup()
    const louvorja = useLouvorJAStore()
    settings.settings = { ...DEFAULT_SETTINGS, autoInterpret: false }
    await useLibrasStore().init()
    await store.init()
    const { frame, sent, emit } = fakeFrame()
    store.attach(frame)
    emit('on_load_player')
    sent.length = 0

    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await nextTick()
    await nextTick()
    expect(sent.some((c) => c.method === 'playNow')).toBe(false)
  })

  it('prefetches the signs of a translation once per region', async () => {
    const { store, avatarApi } = setup()
    await store.checkAvailability()
    const result: TranslationResult = {
      ...translation('Deus amor'),
      tokens: [
        { text: 'DEUS', kind: 'plain', availability: 'sign' },
        { text: 'JÉSSICA', kind: 'plain', availability: 'spelled' },
        { text: 'XYZ', kind: 'plain', availability: 'missing' }
      ]
    }
    store.prefetchSigns(result)
    store.prefetchSigns(result)

    expect(avatarApi.prefetch).toHaveBeenCalledTimes(1)
    const [region, names] = avatarApi.prefetch.mock.calls[0]!
    expect(region).toBe('BR')
    // Signs plus the letters of the fingerspelled word (accents removed), nothing for "missing".
    expect(new Set(names)).toEqual(new Set(['DEUS', 'J', 'E', 'S', 'I', 'C', 'A']))
  })
})

describe('avatar store, synchronization with the presentation', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** A player that is ready, the translator running and one slide-by-slide interpreter. */
  async function running() {
    const ctx = setup()
    const louvorja = useLouvorJAStore()
    louvorja.presentation = OPEN_PRESENTATION
    await useLibrasStore().init()
    await ctx.store.init()
    const frame = fakeFrame()
    ctx.store.attach(frame.frame)
    frame.emit('on_load_player')
    ctx.settings.settings = { ...DEFAULT_SETTINGS, autoInterpret: true }
    await nextTick() // the settings reach the player
    frame.sent.length = 0
    return { ...ctx, louvorja, ...frame }
  }

  const played = (sent: Sent[]): unknown[] =>
    sent.filter((c) => c.method === 'playNow').map((c) => c.params)

  it('waits for the signs of the slide before the avatar starts', async () => {
    const { store, avatarApi, louvorja, sent } = await running()
    let arrive!: (value: { cached: number; downloaded: number; failed: number }) => void
    avatarApi.prefetch.mockReturnValueOnce(new Promise((resolve) => (arrive = resolve)))

    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(store.signsState).toBe('loading'))
    expect(played(sent)).toEqual([])

    arrive({ cached: 0, downloaded: 2, failed: 0 })
    await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    expect(store.signsState).toBe('ready')
  })

  it('starts anyway when the signs take too long, and says some may be missing', async () => {
    const { store, avatarApi, louvorja, sent } = await running()
    avatarApi.prefetch.mockReturnValueOnce(new Promise(() => undefined)) // never arrives

    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(store.signsState).toBe('loading'))
    await vi.advanceTimersByTimeAsync(2_600)
    await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    // Nothing reported failures: the wait just ran out.
    expect(store.signsState).toBe('ready')
  })

  it('reports a partial result when a sign could not be downloaded', async () => {
    const { store, avatarApi, louvorja, sent } = await running()
    avatarApi.prefetch.mockResolvedValueOnce({ cached: 1, downloaded: 0, failed: 1 })

    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    expect(store.signsState).toBe('partial')
  })

  it('drops the slide it was waiting for when a newer one arrives', async () => {
    const { store, avatarApi, louvorja, sent } = await running()
    let arrive!: (value: { cached: number; downloaded: number; failed: number }) => void
    const late = new Promise<{ cached: number; downloaded: number; failed: number }>(
      (resolve) => (arrive = resolve)
    )
    // The first slide's signs are slow; the second one's are already there.
    avatarApi.prefetch.mockImplementation((_region: string, names: string[]) =>
      names.includes('GLÓRIA') ? late : Promise.resolve({ cached: 1, downloaded: 0, failed: 0 })
    )

    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(store.signsState).toBe('loading'))
    louvorja.currentSlide = slide('s2', 'Amém')
    await vi.waitFor(() => expect(played(sent)).toEqual(['AMÉM']))

    arrive({ cached: 0, downloaded: 1, failed: 0 }) // the old slide's signs finally arrive
    await nextTick()
    await nextTick()
    expect(played(sent)).toEqual(['AMÉM'])
  })

  describe('delay before signing', () => {
    it('starts only after the delay, and knows when it will start', async () => {
      const { store, settings, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 3 }

      louvorja.currentSlide = slide('s1', 'Glória a Deus')
      await vi.waitFor(() => expect(store.signsState).toBe('ready'))
      expect(played(sent)).toEqual([])
      expect(store.startsAt).not.toBeNull()

      await vi.advanceTimersByTimeAsync(2_900)
      expect(played(sent)).toEqual([])
      await vi.advanceTimersByTimeAsync(200)
      expect(played(sent)).toEqual(['GLÓRIA A DEUS'])
      expect(store.startsAt).toBeNull()
    })

    it('counts from the moment the slide came on the air, not from the translation', async () => {
      const { settings, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 3 }

      const twoSecondsAgo = new Date(Date.now() - 2_000).toISOString()
      louvorja.currentSlide = slide('s1', 'Glória a Deus', null, twoSecondsAgo)
      await vi.advanceTimersByTimeAsync(700)
      expect(played(sent)).toEqual([])
      await vi.advanceTimersByTimeAsync(500)
      expect(played(sent)).toEqual(['GLÓRIA A DEUS'])
    })

    it('does not wait when the slide has already been on the air longer than the delay', async () => {
      const { settings, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 3 }

      louvorja.currentSlide = slide(
        's1',
        'Glória a Deus',
        null,
        new Date(Date.now() - 10_000).toISOString()
      )
      await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    })

    it('drops the wait when another slide comes, which then has its own delay', async () => {
      const { settings, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 3 }

      louvorja.currentSlide = slide('s1', 'Glória a Deus')
      await vi.advanceTimersByTimeAsync(1_000)
      louvorja.currentSlide = slide('s2', 'Amém')
      await vi.advanceTimersByTimeAsync(2_500)
      // The first slide's 3 s are over, but it was replaced: nothing yet for either.
      expect(played(sent)).toEqual([])
      await vi.advanceTimersByTimeAsync(800)
      expect(played(sent)).toEqual(['AMÉM'])
    })

    it('does not start when the presentation ends during the wait', async () => {
      const { settings, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 3 }

      louvorja.currentSlide = slide('s1', 'Glória a Deus')
      await vi.advanceTimersByTimeAsync(1_000)
      louvorja.presentation = null
      await vi.advanceTimersByTimeAsync(5_000)
      expect(played(sent)).toEqual([])
    })

    it('does not delay what a person asks for with the buttons', async () => {
      const { store, settings, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: 5 }
      store.play('DEUS AMOR')
      expect(played(sent)).toEqual(['DEUS AMOR'])
    })
  })

  describe('advance (negative delay) before signing', () => {
    it('shortens how long it waits for the signs, down to not waiting at all', async () => {
      const { store, settings, avatarApi, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: -2 }
      avatarApi.prefetch.mockReturnValueOnce(new Promise(() => undefined)) // never arrives

      louvorja.currentSlide = slide('s1', 'Glória a Deus')
      await vi.waitFor(() => expect(store.signsState).toBe('loading'))
      await vi.advanceTimersByTimeAsync(400) // short of the shortened budget (2_500 - 2_000 ms)
      expect(played(sent)).toEqual([])
      await vi.advanceTimersByTimeAsync(200)
      await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
      expect(store.signsState).toBe('ready') // it just ran out, not a failure
    })

    it('adds no pause once the signs are ready, unlike a positive delay', async () => {
      const { store, settings, avatarApi, louvorja, sent } = await running()
      settings.settings = { ...settings.settings, interpretDelay: -2.5 } // the most it can advance
      avatarApi.prefetch.mockResolvedValueOnce({ cached: 1, downloaded: 0, failed: 0 })

      louvorja.currentSlide = slide('s1', 'Glória a Deus')
      await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
      expect(store.startsAt).toBeNull()
    })
  })

  it('stops the avatar when the slide goes away', async () => {
    const { louvorja, sent, emit } = await running()
    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    emit('on_playing_state_change', ['True', 'False', 'False', 'False', 'True'])
    sent.length = 0

    louvorja.currentSlide = null
    await vi.waitFor(() => expect(sent).toContainEqual({ method: 'stopAll', params: undefined }))
  })

  it('stops the avatar when the presentation ends, although the last slide is remembered', async () => {
    const { louvorja, sent, emit } = await running()
    louvorja.currentSlide = slide('s1', 'Glória a Deus')
    await vi.waitFor(() => expect(played(sent)).toEqual(['GLÓRIA A DEUS']))
    emit('on_playing_state_change', ['True', 'False', 'False', 'False', 'True'])
    sent.length = 0

    louvorja.presentation = null // ended; currentSlide stays
    await vi.waitFor(() => expect(sent).toContainEqual({ method: 'stopAll', params: undefined }))
  })

  it('does what the projection page asks of the overlay window', async () => {
    const { store, sent, emit } = await running()

    store.applyCommand({ type: 'play', gloss: 'DEUS AMOR' })
    expect(played(sent)).toEqual(['DEUS AMOR'])

    emit('on_playing_state_change', ['True', 'False', 'False', 'False', 'True'])
    store.applyCommand({ type: 'pause' })
    emit('on_playing_state_change', ['True', 'True', 'False', 'False', 'True'])
    store.applyCommand({ type: 'pause' }) // already paused: no second toggle
    store.applyCommand({ type: 'resume' })
    store.applyCommand({ type: 'repeat' })
    store.applyCommand({ type: 'stop' })

    expect(sent.map((c) => [c.method, c.params])).toEqual([
      ['playNow', 'DEUS AMOR'],
      ['setPauseState', 1],
      ['setPauseState', 0],
      ['playNow', 'DEUS AMOR'],
      ['stopAll', undefined]
    ])
  })
})
