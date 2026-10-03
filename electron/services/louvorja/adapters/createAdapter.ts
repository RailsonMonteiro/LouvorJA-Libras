import type {
  Endpoint,
  LouvorJAEvent,
  ServerInfo
} from '../../../../src/modules/louvorja/types/louvorja.types'
import { ConnectionError, type AdapterFactory, type LouvorJAAdapter } from './LouvorJAAdapter'
import { LouvorJAApiAdapter, type LouvorJAApiAdapterOptions } from './LouvorJAApiAdapter'
import { LouvorJAPianoAdapter } from './LouvorJAPianoAdapter'
import { ViolinAppAdapter } from './ViolinAppAdapter'
import { describeError } from './errorDetail'

/** What a single ping told us about who is actually listening at the endpoint. */
type PingOutcome =
  | { kind: 'louvorja-v2' }
  | { kind: 'louvorja-v1' }
  | { kind: 'violin' }
  | { kind: 'incompatible' }
  | { kind: 'unauthorized' }
  /** No HTTP server answered at all - worth trying app-Piano's WebSocket next. */
  | { kind: 'no-http' }

async function ping(
  endpoint: Endpoint,
  path: string,
  timeoutMs: number,
  onWarning?: (message: string) => void
): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  const url = new URL(`http://${endpoint.host}:${endpoint.port}${path}`)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (endpoint.token) {
    // v2 (LouvorJA) prefers the header; violin-app's global token only ever reads the query
    // string - sending both covers whichever of the two actually answers.
    headers.authorization = `Bearer ${endpoint.token}`
    url.searchParams.set('token', endpoint.token)
  }
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    return { status: response.status, body }
  } catch (error) {
    // Logged, not just swallowed: this probe runs first on every attempt, so losing its own
    // failure reason (ECONNREFUSED vs ETIMEDOUT - the latter a common Windows Firewall symptom,
    // see docs/protocolo-louvorja.md) would mean no diagnostic trail at all for the most common
    // real-world report ("não conecta"), before even getting to app-Piano's WebSocket.
    onWarning?.(`Could not reach ${endpoint.host}:${endpoint.port}${path}: ${describeError(error)}`)
    return null
  }
}

/**
 * One HTTP probe (two requests at most - the same ones `LouvorJAApiAdapter.connect()` would make
 * anyway) to tell apart the three servers this app can talk to, before committing to an adapter:
 *
 * - Only the original LouvorJA (Delphi) answers `/api/v2/ping` - violin-app has no `/api/v2/*`
 *   routes at all, and app-Piano is not HTTP.
 * - Both the original LouvorJA's v1 and violin-app answer `/api/ping` the same way at a glance
 *   (`{"app":"LouvorJA"}`), but violin-app's also carries `authorized`/`permissions` fields the
 *   Delphi one never has (see docs/protocolo-louvorja.md) - that is the tell.
 * - Nothing answering HTTP at all (connection refused, not a timeout) is the point where app-Piano
 *   becomes worth trying - its remote-control server is a bare WebSocket, not HTTP.
 */
async function probe(
  endpoint: Endpoint,
  timeoutMs: number,
  onWarning?: (message: string) => void
): Promise<PingOutcome> {
  const v2 = await ping(endpoint, '/api/v2/ping', timeoutMs, onWarning)
  if (v2?.status === 401) return { kind: 'unauthorized' }
  if (v2?.status === 200 && v2.body?.app === 'LouvorJA') return { kind: 'louvorja-v2' }

  const v1 = await ping(endpoint, '/api/ping', timeoutMs, onWarning)
  if (v1?.status === 401) return { kind: 'unauthorized' }
  if (v1?.status === 200 && v1.body?.app === 'LouvorJA') {
    const isViolin = 'authorized' in v1.body && 'permissions' in v1.body
    return isViolin ? { kind: 'violin' } : { kind: 'louvorja-v1' }
  }
  if (v1) return { kind: 'incompatible' }

  return { kind: 'no-http' }
}

/**
 * Wraps whichever adapter turns out to be right so `ConnectionService` can keep asking for one
 * adapter per attempt (see its own `adapterFactory(endpoint)` call) without knowing any of this -
 * `onEvent`/`onClose` are recorded here and only wired to the real adapter once `connect()` has
 * picked it.
 */
class DetectingAdapter implements LouvorJAAdapter {
  private delegate: LouvorJAAdapter | null = null
  private eventListener: ((event: LouvorJAEvent) => void) | null = null
  private closeListener: ((error: ConnectionError) => void) | null = null

  constructor(
    private readonly endpoint: Endpoint,
    private readonly options: LouvorJAApiAdapterOptions
  ) {}

  onEvent(listener: (event: LouvorJAEvent) => void): void {
    this.eventListener = listener
    this.delegate?.onEvent(listener)
  }

  onClose(listener: (error: ConnectionError) => void): void {
    this.closeListener = listener
    this.delegate?.onClose(listener)
  }

  describe(): ServerInfo | null {
    return this.delegate?.describe?.() ?? null
  }

  async connect(): Promise<void> {
    const outcome = await probe(
      this.endpoint,
      this.options.requestTimeoutMs ?? 8000,
      this.options.onWarning
    )
    this.delegate = this.build(outcome)
    if (this.eventListener) this.delegate.onEvent(this.eventListener)
    if (this.closeListener) this.delegate.onClose(this.closeListener)
    await this.delegate.connect()
  }

  disconnect(): void {
    this.delegate?.disconnect()
  }

  private build(outcome: PingOutcome): LouvorJAAdapter {
    switch (outcome.kind) {
      case 'louvorja-v2':
      case 'louvorja-v1':
        // LouvorJAApiAdapter re-does its own v2→v1 ping (it has no way to be told the answer
        // already known) - one extra request on an otherwise-once-per-connection path, traded
        // for not having to plumb a "skip detection" mode through it just for this.
        return new LouvorJAApiAdapter(this.endpoint, this.options)
      case 'violin':
        return new ViolinAppAdapter(this.endpoint, this.options)
      case 'no-http':
        return new LouvorJAPianoAdapter(this.endpoint, {
          connectTimeoutMs: this.options.requestTimeoutMs,
          onWarning: this.options.onWarning
        })
      case 'unauthorized':
        return failing(new ConnectionError('unauthorized'))
      case 'incompatible':
        return failing(
          new ConnectionError('incompatible', 'the answer to ping is not from LouvorJA')
        )
    }
  }
}

/** An adapter whose `connect()` only ever rejects - for outcomes the probe already settled. */
function failing(error: ConnectionError): LouvorJAAdapter {
  return {
    onEvent: () => {},
    onClose: () => {},
    connect: () => Promise.reject(error),
    disconnect: () => {}
  }
}

/** Detects which of the three servers is listening, then hands off to its adapter. */
export function createAdapterFactory(options: LouvorJAApiAdapterOptions = {}): AdapterFactory {
  return (endpoint) => new DetectingAdapter(endpoint, options)
}
