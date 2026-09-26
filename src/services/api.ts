import type { LouvorJAApi } from '@/types/ipc'

/** Typed access to the preload bridge. Fails loudly when the page runs outside Electron. */
export function api(): LouvorJAApi {
  if (!window.louvorja)
    throw new Error('window.louvorja is not available (not running in Electron)')
  return window.louvorja
}
