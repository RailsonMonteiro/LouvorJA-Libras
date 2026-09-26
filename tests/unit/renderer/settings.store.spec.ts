import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/stores/settings.store'
import type { LouvorJAApi } from '@/types/ipc'
import { DEFAULT_SETTINGS } from '@/types/settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const api: LouvorJAApi = {
      app: { getInfo: vi.fn() },
      window: { control: vi.fn(), onMaximizedChange: vi.fn() },
      avatar: { prefetch: vi.fn(), getCacheStats: vi.fn(), clearCache: vi.fn() },
      overlay: {
        getState: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        identify: vi.fn(),
        command: vi.fn(),
        onStateChange: vi.fn(),
        onCommand: vi.fn()
      },
      libras: {
        translate: vi.fn(),
        saveOverride: vi.fn(),
        removeOverride: vi.fn(),
        getCatalogStatus: vi.fn(),
        refreshCatalog: vi.fn()
      },
      integration: {
        getState: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        getHistory: vi.fn(),
        removeConnection: vi.fn(),
        onEvent: vi.fn()
      },
      settings: {
        getAll: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, theme: 'dark' }),
        set: vi
          .fn()
          .mockImplementation(async (key, value) => ({ ...DEFAULT_SETTINGS, [key]: value })),
        onChange: vi.fn()
      }
    }
    vi.stubGlobal('window', { louvorja: api })
  })

  it('loads settings from the main process', async () => {
    const store = useSettingsStore()
    await store.load()
    expect(store.settings.theme).toBe('dark')
  })

  it('updates a setting through IPC and keeps the returned state', async () => {
    const store = useSettingsStore()
    await store.update('locale', 'en')
    expect(store.settings.locale).toBe('en')
  })
})
