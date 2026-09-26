import type {
  ConnectionErrorInfo,
  ConnectionStatus,
  Endpoint,
  LouvorJAEvent
} from '../../../src/modules/louvorja/types/louvorja.types'
import {
  ConnectionError,
  type AdapterFactory,
  type LouvorJAAdapter
} from './adapters/LouvorJAAdapter'
import type { ConnectionRepository } from './ConnectionRepository'

export interface ConnectionServiceOptions {
  adapterFactory: AdapterFactory
  repository: ConnectionRepository
  /** Delay before retry n is `min(maxMs, initialMs * 2^(n-1))`. */
  backoff?: { initialMs: number; maxMs: number }
  now?: () => Date
}

const IDLE: ConnectionStatus = {
  state: 'disconnected',
  endpoint: null,
  attempt: 0,
  lastError: null,
  retryInMs: null,
  connectedAt: null,
  server: null
}

/**
 * Owns the connection lifecycle: connects through an adapter, keeps trying with exponential
 * backoff when the attempt fails or the link drops, and reports every change.
 */
export class ConnectionService {
  private status: ConnectionStatus = { ...IDLE }
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>()
  private readonly eventListeners = new Set<(event: LouvorJAEvent) => void>()

  private adapter: LouvorJAAdapter | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Bumped on every connect/disconnect so callbacks of an abandoned attempt are ignored. */
  private generation = 0
  private attempt = 0
  private errorLogged = false

  constructor(private readonly options: ConnectionServiceOptions) {}

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onEvent(listener: (event: LouvorJAEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /** Starts connecting and returns immediately; progress is reported through `onStatus`. */
  connect(endpoint: Endpoint): void {
    this.teardown()
    this.attempt = 0
    this.errorLogged = false
    this.setStatus({ ...IDLE, endpoint })
    void this.run(endpoint, this.generation)
  }

  disconnect(): void {
    const previous = this.status
    this.teardown()
    if (previous.state === 'connected' && previous.endpoint) {
      this.options.repository.addEvent(previous.endpoint, 'disconnected', 'manual')
    }
    this.setStatus({ ...IDLE })
  }

  dispose(): void {
    this.teardown()
    this.statusListeners.clear()
    this.eventListeners.clear()
  }

  private teardown(): void {
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.adapter?.disconnect()
    this.adapter = null
  }

  private async run(endpoint: Endpoint, generation: number): Promise<void> {
    this.attempt += 1
    this.setStatus({
      state: this.attempt === 1 ? 'connecting' : 'reconnecting',
      endpoint,
      attempt: this.attempt,
      retryInMs: null
    })

    const adapter = this.options.adapterFactory(endpoint)
    this.adapter = adapter
    adapter.onEvent((event) => {
      if (generation === this.generation) this.eventListeners.forEach((l) => l(event))
    })
    adapter.onClose((error) => {
      if (generation !== this.generation) return
      this.options.repository.addEvent(endpoint, error.fatal ? 'error' : 'disconnected', error.code)
      this.adapter = null
      this.attempt = 0
      this.errorLogged = false
      if (error.fatal) return this.giveUp(endpoint, error)
      this.scheduleRetry(endpoint, generation, error)
    })

    try {
      await adapter.connect()
    } catch (error) {
      if (generation !== this.generation) return
      const failure = error instanceof ConnectionError ? error : new ConnectionError('unreachable')
      this.adapter = null
      if (!this.errorLogged) {
        this.errorLogged = true
        this.options.repository.addEvent(endpoint, 'error', failure.detail ?? failure.code)
      }
      if (failure.fatal) this.giveUp(endpoint, failure)
      else this.scheduleRetry(endpoint, generation, failure)
      return
    }
    if (generation !== this.generation) {
      adapter.disconnect()
      return
    }

    this.attempt = 0
    this.errorLogged = false
    this.options.repository.markConnected(endpoint)
    this.options.repository.addEvent(endpoint, 'connected')
    this.setStatus({
      state: 'connected',
      endpoint,
      attempt: 0,
      lastError: null,
      retryInMs: null,
      connectedAt: (this.options.now?.() ?? new Date()).toISOString(),
      server: adapter.describe?.() ?? null
    })
  }

  /** Some failures (wrong token, not a LouvorJA) will not fix themselves: stop and say why. */
  private giveUp(endpoint: Endpoint, error: ConnectionError): void {
    this.setStatus({
      state: 'disconnected',
      endpoint,
      attempt: 0,
      lastError: { code: error.code, detail: error.detail },
      retryInMs: null,
      connectedAt: null,
      server: null
    })
  }

  private scheduleRetry(endpoint: Endpoint, generation: number, error: ConnectionError): void {
    const { initialMs, maxMs } = this.options.backoff ?? { initialMs: 1000, maxMs: 15000 }
    const delay = Math.min(maxMs, initialMs * 2 ** Math.max(0, this.attempt - 1))
    const lastError: ConnectionErrorInfo = { code: error.code, detail: error.detail }

    this.setStatus({
      state: 'reconnecting',
      endpoint,
      attempt: this.attempt,
      lastError,
      retryInMs: delay,
      connectedAt: null,
      server: null
    })
    this.timer = setTimeout(() => {
      this.timer = null
      if (generation === this.generation) void this.run(endpoint, generation)
    }, delay)
  }

  private setStatus(patch: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...patch }
    const snapshot = this.getStatus()
    this.statusListeners.forEach((listener) => listener(snapshot))
  }
}
