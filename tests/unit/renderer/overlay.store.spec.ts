import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOverlayStore } from '@/modules/overlay/stores/overlay.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { LouvorJAApi, OverlayState } from '@/types/ipc'
import { DEFAULT_SETTINGS } from '@/types/settings'

const closed: OverlayState = {
  open: false,
  displayId: null,
  displays: [
    { id: 1, label: '1 · 1920×1080', width: 1920, height: 1080, primary: true },
    { id: 2, label: '2 · 1280×720', width: 1280, height: 720, primary: false }
  ]
}
const openOn = (id: number): OverlayState => ({ ...closed, open: true, displayId: id })

function setup() {
  let push: (state: OverlayState) => void = () => undefined
  const overlay = {
    getState: vi.fn().mockResolvedValue(closed),
    open: vi.fn(async (id: number | null) => openOn(id ?? 2)),
    close: vi.fn().mockResolvedValue(closed),
    command: vi.fn().mockResolvedValue(undefined),
    onStateChange: vi.fn((listener: (state: OverlayState) => void) => {
      push = listener
      return () => undefined
    }),
    onCommand: vi.fn()
  }
  const settings = {
    getAll: vi.fn(),
    set: vi.fn(async (key: string, value: unknown) => ({ ...DEFAULT_SETTINGS, [key]: value })),
    onChange: vi.fn()
  }
  vi.stubGlobal('window', { louvorja: { overlay, settings } as unknown as LouvorJAApi })
  setActivePinia(createPinia())
  return { overlay, settings, store: useOverlayStore(), pushState: (s: OverlayState) => push(s) }
}

describe('overlay store', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('loads the state and follows the changes pushed by the main process', async () => {
    const { store, pushState } = setup()
    await store.init()
    expect(store.open).toBe(false)
    expect(store.displays).toHaveLength(2)

    pushState(openOn(2))
    expect(store.open).toBe(true)
    expect(store.currentDisplay?.label).toBe('2 · 1280×720')
  })

  it('subscribes only once, however many times it is started', async () => {
    const { store, overlay } = setup()
    await store.init()
    await store.init()
    expect(overlay.onStateChange).toHaveBeenCalledTimes(1)
  })

  it('opens on the remembered screen, or on the automatic one', async () => {
    const { store, overlay } = setup()
    await store.init()

    await store.show() // nothing chosen yet
    expect(overlay.open).toHaveBeenLastCalledWith(null)

    await useSettingsStore().update('overlayDisplayId', 1)
    await store.show()
    expect(overlay.open).toHaveBeenLastCalledWith(1)
    expect(store.open).toBe(true)
  })

  it('moves an open overlay to the screen that was chosen, and only remembers it when closed', async () => {
    const { store, overlay, settings } = setup()
    await store.init()

    await store.chooseDisplay(1)
    expect(settings.set).toHaveBeenCalledWith('overlayDisplayId', 1)
    expect(overlay.open).not.toHaveBeenCalled()

    await store.show()
    overlay.open.mockClear()
    await store.chooseDisplay(2)
    expect(overlay.open).toHaveBeenCalledWith(2)
  })

  it('closes', async () => {
    const { store } = setup()
    await store.init()
    await store.show()
    await store.hide()
    expect(store.open).toBe(false)
  })

  it('repeats commands in the overlay only while it is open', async () => {
    const { store, overlay } = setup()
    await store.init()

    store.mirror({ type: 'stop' })
    expect(overlay.command).not.toHaveBeenCalled()

    await store.show()
    store.mirror({ type: 'play', gloss: 'DEUS' })
    expect(overlay.command).toHaveBeenCalledWith({ type: 'play', gloss: 'DEUS' })
  })
})
