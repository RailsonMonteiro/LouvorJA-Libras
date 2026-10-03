import { WebSocket, type RawData } from 'ws'
import type {
  Endpoint,
  LouvorJAEvent,
  ServerInfo
} from '../../../../src/modules/louvorja/types/louvorja.types'
import { ConnectionError, type LouvorJAAdapter } from './LouvorJAAdapter'
import { describeError } from './errorDetail'

/**
 * Connects to app-Piano's remote-control WebSocket ("LouvorJA Remote v1", see
 * `electron/remote-server.mjs` in that project) and confirms it is really there - nothing more.
 *
 * Its pushed `state` only ever carries liturgy item *titles* and, for the Bible, the book/
 * chapter/verse *numbers* selected - never the words actually on screen (see
 * docs/protocolo-louvorja.md). There is nothing here to translate to Libras yet, so this adapter
 * never calls `onEvent`'s listener: it exists so the app can say "connected to app-Piano" instead
 * of failing outright, ahead of app-Piano exposing that text some other way.
 *
 * app-Piano also allows only one WebSocket client at a time (meant for its own phone app) - this
 * adapter connecting takes that slot, and is refused (`remote_busy`) if the phone already holds
 * it. Accepted trade-off for now (see docs/protocolo-louvorja.md), not something fixable here.
 */
export interface LouvorJAPianoAdapterOptions {
  connectTimeoutMs?: number
  /** How long to wait, after the socket opens, for a possible `remote_busy` before declaring the
   *  connection good - the server sends it (and closes) right away, never after a delay. */
  busyGraceMs?: number
  onWarning?: (message: string) => void
}

export class LouvorJAPianoAdapter implements LouvorJAAdapter {
  private closeListener: ((error: ConnectionError) => void) | null = null
  private socket: WebSocket | null = null

  constructor(
    private readonly endpoint: Endpoint,
    private readonly options: LouvorJAPianoAdapterOptions = {}
  ) {}

  /** Nothing to translate yet - see the class doc. */
  onEvent(_listener: (event: LouvorJAEvent) => void): void {}

  onClose(listener: (error: ConnectionError) => void): void {
    this.closeListener = listener
  }

  describe(): ServerInfo {
    return { version: null, protocol: 'piano' }
  }

  async connect(): Promise<void> {
    const socket = new WebSocket(`ws://${this.endpoint.host}:${this.endpoint.port}`)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.off('open', onOpen)
        socket.off('message', onMessage)
        socket.off('error', onError)
        socket.off('close', onClose)
        fn()
      }
      const timer = setTimeout(
        () => finish(() => reject(new ConnectionError('timeout'))),
        this.options.connectTimeoutMs ?? 8000
      )
      const onOpen = (): void => {
        socket.send(JSON.stringify({ v: 1, type: 'hello', device: 'LouvorJA Libras' }))
        // The server answers "busy" (and closes) right away, never later - a short, fixed grace
        // window is enough to know a genuine "open" was not immediately followed by that.
        setTimeout(() => finish(resolve), this.options.busyGraceMs ?? 150)
      }
      const onMessage = (raw: RawData): void => {
        const message = parseMessage(raw)
        if (message?.type === 'error' && message.code === 'remote_busy') {
          finish(() =>
            reject(new ConnectionError('unreachable', 'remote_busy: another client is connected'))
          )
        }
      }
      const onError = (error: Error): void => {
        const detail = describeError(error)
        this.options.onWarning?.(
          `Could not reach ${this.endpoint.host}:${this.endpoint.port} (WebSocket): ${detail}`
        )
        finish(() => reject(new ConnectionError('unreachable', detail)))
      }
      const onClose = (code: number): void =>
        finish(() =>
          reject(new ConnectionError('unreachable', `closed (${code}) before connecting`))
        )

      socket.on('open', onOpen)
      socket.on('message', onMessage)
      socket.on('error', onError)
      socket.on('close', onClose)
    })

    socket.on('close', () => {
      this.socket = null
      this.closeListener?.(new ConnectionError('closed'))
    })
    socket.on('error', () => {
      // A post-connect error is always followed by 'close', which is what reports it.
    })
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = null
  }
}

function parseMessage(raw: RawData): { type?: string; code?: string } | null {
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
