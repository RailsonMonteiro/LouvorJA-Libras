import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibrasStore } from '@/modules/libras/stores/libras.store'
import { useLouvorJAStore } from '@/modules/louvorja/stores/louvorja.store'
import type { CatalogStatus, TranslationResult } from '@/modules/libras/types/libras.types'
import type { LouvorJAApi } from '@/types/ipc'

const result = (
  text: string,
  gloss: string,
  extra: Partial<TranslationResult> = {}
): TranslationResult => ({
  text,
  gloss,
  tokens: gloss.split(' ').map((word) => ({ text: word, kind: 'plain', availability: 'sign' })),
  source: 'online',
  edited: false,
  ...extra
})
const status = (ready: boolean): CatalogStatus => ({
  ready,
  count: ready ? 22000 : 0,
  updatedAt: null,
  url: 'u'
})

function setup() {
  const libras = {
    translate: vi.fn(async (text: string) => result(text, text.toUpperCase())),
    saveOverride: vi.fn(async (text: string, gloss: string) =>
      result(text, gloss, { source: 'manual', edited: true })
    ),
    removeOverride: vi.fn(async (text: string) => result(text, text.toUpperCase())),
    getCatalogStatus: vi.fn(async () => status(false)),
    refreshCatalog: vi.fn(async () => status(true))
  }
  const integration = {
    getState: vi.fn().mockResolvedValue({
      status: {
        state: 'disconnected',
        endpoint: null,
        attempt: 0,
        lastError: null,
        retryInMs: null,
        connectedAt: null,
        server: null
      },
      presentation: null,
      currentSlide: null,
      recentSlides: []
    }),
    getHistory: vi.fn().mockResolvedValue({ connections: [], events: [] }),
    onEvent: vi.fn().mockReturnValue(() => undefined)
  }
  vi.stubGlobal('window', { louvorja: { libras, integration } as unknown as LouvorJAApi })
  setActivePinia(createPinia())
  return { libras, store: useLibrasStore() }
}

describe('libras store', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('translates a text once and shares the result', async () => {
    const { store, libras } = setup()
    const [a, b] = await Promise.all([store.ensure('Deus é amor'), store.ensure('  deus  é AMOR')])

    expect(a).toEqual(b)
    expect(libras.translate).toHaveBeenCalledTimes(1)
    expect(store.get('DEUS É AMOR')?.gloss).toBe('DEUS É AMOR')
    await store.ensure('deus é amor')
    expect(libras.translate).toHaveBeenCalledTimes(1)
  })

  it('does not call anything for blank text and survives a failing translation', async () => {
    const { store, libras } = setup()
    expect(await store.ensure('   ')).toBeNull()
    expect(libras.translate).not.toHaveBeenCalled()

    libras.translate.mockRejectedValueOnce(new Error('boom'))
    expect(await store.ensure('oi')).toBeNull()
    expect(store.get('oi')).toBeNull()
    expect(await store.ensure('oi')).not.toBeNull() // can be asked again
  })

  it('keeps the manual gloss and the restored automatic one', async () => {
    const { store } = setup()
    await store.saveOverride('oi', 'OLÁ')
    expect(store.get('oi')).toMatchObject({ gloss: 'OLÁ', edited: true })

    await store.removeOverride('oi')
    expect(store.get('oi')).toMatchObject({ gloss: 'OI', edited: false })
  })

  it('refreshes the catalog and forgets translations so their availability is recomputed', async () => {
    const { store } = setup()
    await store.loadCatalog()
    expect(store.catalog?.ready).toBe(false)
    await store.ensure('oi')

    expect(await store.refreshCatalog()).toBe(true)
    expect(store.catalog?.ready).toBe(true)
    expect(store.get('oi')).toBeNull()
    expect(store.catalogBusy).toBe(false)
  })

  it('reports a failed catalog download without throwing', async () => {
    const { store, libras } = setup()
    libras.refreshCatalog.mockRejectedValueOnce(new Error('offline'))
    expect(await store.refreshCatalog()).toBe(false)
    expect(store.catalogError).toBe(true)
    expect(store.catalogBusy).toBe(false)
  })

  it('translates the live slide and, right after it, the next one', async () => {
    const { store, libras } = setup()
    const louvorja = useLouvorJAStore()
    await store.init()

    louvorja.currentSlide = {
      id: 's1',
      presentationId: null,
      index: null,
      total: null,
      title: null,
      text: 'GLÓRIA A DEUS',
      nextText: 'AMÉM',
      kind: 'lyrics',
      receivedAt: 'x'
    }
    await nextTick()
    await vi.waitFor(() =>
      expect(libras.translate.mock.calls.map((call) => call[0])).toEqual(['GLÓRIA A DEUS', 'AMÉM'])
    )
    // Already known when it becomes the current slide: no second request.
    expect(store.get('amém')).not.toBeNull()
  })
})
