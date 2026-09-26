import { api } from '@/services/api'
import type {
  ConnectionHistory,
  Endpoint,
  IntegrationPushEvent,
  IntegrationState
} from '../types/louvorja.types'

/**
 * Renderer-side client of the integration. The connection itself lives in the main process
 * (see electron/services/louvorja); this is a thin, typed wrapper over the IPC bridge.
 */
export const LouvorJAService = {
  getState: (): Promise<IntegrationState> => api().integration.getState(),
  connect: (endpoint: Endpoint): Promise<void> => api().integration.connect(endpoint),
  disconnect: (): Promise<void> => api().integration.disconnect(),
  getHistory: (): Promise<ConnectionHistory> => api().integration.getHistory(),
  removeConnection: (id: number): Promise<ConnectionHistory> =>
    api().integration.removeConnection(id),
  onEvent: (listener: (event: IntegrationPushEvent) => void): (() => void) =>
    api().integration.onEvent(listener)
}
