import { contextBridge, ipcRenderer } from 'electron'
import type { IntegrationPushEvent } from '../../src/modules/louvorja/types/louvorja.types'
import {
  IpcChannels,
  type LouvorJAApi,
  type OverlayCommand,
  type OverlayState
} from '../../src/types/ipc'
import type { AppSettings } from '../../src/types/settings'

/** Subscribes to a main -> renderer event and returns the unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Only this narrow, typed surface reaches the renderer; ipcRenderer itself is never exposed.
const api: LouvorJAApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo)
  },
  settings: {
    getAll: () => ipcRenderer.invoke(IpcChannels.settingsGetAll),
    set: (key, value) => ipcRenderer.invoke(IpcChannels.settingsSet, { key, value }),
    onChange: (listener) => subscribe<AppSettings>(IpcChannels.settingsChanged, listener)
  },
  window: {
    control: (action) => ipcRenderer.invoke(IpcChannels.windowControl, action),
    onMaximizedChange: (listener) => {
      const handler = (_event: unknown, maximized: boolean): void => listener(maximized)
      ipcRenderer.on(IpcChannels.windowMaximizedChanged, handler)
      return () => ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, handler)
    }
  },
  integration: {
    getState: () => ipcRenderer.invoke(IpcChannels.louvorjaGetState),
    connect: (endpoint) => ipcRenderer.invoke(IpcChannels.louvorjaConnect, endpoint),
    disconnect: () => ipcRenderer.invoke(IpcChannels.louvorjaDisconnect),
    getHistory: () => ipcRenderer.invoke(IpcChannels.louvorjaGetHistory),
    removeConnection: (id) => ipcRenderer.invoke(IpcChannels.louvorjaRemoveConnection, id),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: IntegrationPushEvent): void => listener(payload)
      ipcRenderer.on(IpcChannels.louvorjaEvent, handler)
      return () => ipcRenderer.removeListener(IpcChannels.louvorjaEvent, handler)
    }
  },
  libras: {
    translate: (text) => ipcRenderer.invoke(IpcChannels.librasTranslate, text),
    saveOverride: (text, gloss) =>
      ipcRenderer.invoke(IpcChannels.librasSaveOverride, { text, gloss }),
    removeOverride: (text) => ipcRenderer.invoke(IpcChannels.librasRemoveOverride, text),
    getCatalogStatus: () => ipcRenderer.invoke(IpcChannels.librasCatalogStatus),
    refreshCatalog: () => ipcRenderer.invoke(IpcChannels.librasCatalogRefresh)
  },
  avatar: {
    prefetch: (region, signs) => ipcRenderer.invoke(IpcChannels.avatarPrefetch, { region, signs }),
    getCacheStats: () => ipcRenderer.invoke(IpcChannels.avatarCacheStats),
    clearCache: () => ipcRenderer.invoke(IpcChannels.avatarCacheClear)
  },
  overlay: {
    getState: () => ipcRenderer.invoke(IpcChannels.overlayGetState),
    open: (displayId) => ipcRenderer.invoke(IpcChannels.overlayOpen, displayId),
    close: () => ipcRenderer.invoke(IpcChannels.overlayClose),
    identify: () => ipcRenderer.invoke(IpcChannels.overlayIdentify),
    command: (command) => ipcRenderer.invoke(IpcChannels.overlayCommand, command),
    onStateChange: (listener) => subscribe<OverlayState>(IpcChannels.overlayStateChanged, listener),
    onCommand: (listener) => subscribe<OverlayCommand>(IpcChannels.overlayCommandEvent, listener)
  }
}

contextBridge.exposeInMainWorld('louvorja', api)
