import type {
  ConnectionErrorCode,
  Endpoint,
  LouvorJAEvent,
  ServerInfo
} from '../../../../src/modules/louvorja/types/louvorja.types'

/** A failed attempt to reach LouvorJA, with a code the UI can translate. */
export class ConnectionError extends Error {
  constructor(
    readonly code: ConnectionErrorCode,
    readonly detail: string | null = null
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ConnectionError'
  }

  /** A refused token or a wrong kind of server: trying again cannot change the answer. */
  get fatal(): boolean {
    return this.code === 'unauthorized' || this.code === 'incompatible'
  }
}

/**
 * Everything the app knows about talking to LouvorJA. An adapter hides the transport and the
 * wire protocol: when LouvorJA changes, only the adapters change.
 */
export interface LouvorJAAdapter {
  /** Resolves once connected; rejects with a {@link ConnectionError} otherwise. */
  connect(): Promise<void>
  /** What the server said about itself, once connected. */
  describe?(): ServerInfo | null
  /** Closes the connection without triggering the close listener. */
  disconnect(): void
  /** Domain events (presentation started, slide, presentation ended). */
  onEvent(listener: (event: LouvorJAEvent) => void): void
  /** Called when an established connection is lost. */
  onClose(listener: (error: ConnectionError) => void): void
}

export type AdapterFactory = (endpoint: Endpoint) => LouvorJAAdapter
