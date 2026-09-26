import type {
  ConnectionHistory,
  Endpoint,
  IntegrationPushEvent,
  IntegrationState
} from '../../../src/modules/louvorja/types/louvorja.types'
import type { LogService } from '../LogService'
import type { AdapterFactory } from './adapters/LouvorJAAdapter'
import { createAdapterFactory } from './adapters/createAdapter'
import { ConnectionRepository } from './ConnectionRepository'
import { ConnectionService, type ConnectionServiceOptions } from './ConnectionService'
import { PresentationRepository } from './PresentationRepository'
import { SlideReceiverService } from './SlideReceiverService'
import type { DatabaseSync } from 'node:sqlite'

export interface LouvorJAServiceOptions {
  db: DatabaseSync
  logs?: LogService
  adapterFactory?: AdapterFactory
  backoff?: ConnectionServiceOptions['backoff']
}

/** Facade used by the IPC layer: connection + received slides + history. */
export class LouvorJAService {
  readonly connection: ConnectionService
  readonly slides: SlideReceiverService
  private readonly connections: ConnectionRepository
  private readonly presentations: PresentationRepository
  private readonly listeners = new Set<(event: IntegrationPushEvent) => void>()

  constructor(options: LouvorJAServiceOptions) {
    const { db, logs } = options
    this.connections = new ConnectionRepository(db)
    this.presentations = new PresentationRepository(db)
    this.slides = new SlideReceiverService(this.presentations)

    const warn = (message: string): void => logs?.warn('louvorja', message)
    this.connection = new ConnectionService({
      adapterFactory: options.adapterFactory ?? createAdapterFactory({ onWarning: warn }),
      repository: this.connections,
      backoff: options.backoff
    })

    this.connection.onStatus((status) => {
      logs?.info('louvorja', `Connection ${status.state}`, {
        endpoint: status.endpoint,
        attempt: status.attempt,
        error: status.lastError
      })
      this.emit({ kind: 'status', status })
    })
    this.connection.onEvent((event) => this.slides.handle(event))
    this.slides.onPresentation((presentation) => this.emit({ kind: 'presentation', presentation }))
    this.slides.onSlide((slide) => this.emit({ kind: 'slide', slide }))
  }

  getState(): IntegrationState {
    return {
      status: this.connection.getStatus(),
      presentation: this.slides.getPresentation(),
      currentSlide: this.slides.getCurrentSlide(),
      recentSlides: this.slides.getRecentSlides()
    }
  }

  connect(endpoint: Endpoint): void {
    this.connection.connect(endpoint)
  }

  disconnect(): void {
    this.connection.disconnect()
  }

  /** Reconnects to the last endpoint that worked. Returns false when there is none. */
  connectToLast(): boolean {
    const last = this.connections.getLast()
    if (!last) return false
    this.connect({ host: last.host, port: last.port, token: last.token })
    return true
  }

  getHistory(): ConnectionHistory {
    return { connections: this.connections.list(), events: this.connections.listEvents() }
  }

  removeConnection(id: number): ConnectionHistory {
    this.connections.remove(id)
    return this.getHistory()
  }

  /** Housekeeping run at startup. */
  prune(days = 30): void {
    this.presentations.prune(days)
    this.connections.pruneEvents(days)
  }

  onEvent(listener: (event: IntegrationPushEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.connection.dispose()
    this.listeners.clear()
  }

  private emit(event: IntegrationPushEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}
