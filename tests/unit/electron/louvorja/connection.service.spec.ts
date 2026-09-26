import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../../../electron/services/DatabaseService'
import {
  ConnectionError,
  type LouvorJAAdapter
} from '../../../../electron/services/louvorja/adapters/LouvorJAAdapter'
import { ConnectionRepository } from '../../../../electron/services/louvorja/ConnectionRepository'
import { ConnectionService } from '../../../../electron/services/louvorja/ConnectionService'
import type {
  ConnectionStatus,
  Endpoint,
  LouvorJAEvent
} from '../../../../src/modules/louvorja/types/louvorja.types'

const endpoint: Endpoint = { host: '10.0.0.5', port: 7070, token: 'AB12c' }

/** Adapter whose connection result is decided by the test. */
class FakeAdapter implements LouvorJAAdapter {
  static instances: FakeAdapter[] = []
  static failNext = 0
  static failWith: ConnectionError | null = null
  eventListener: ((e: LouvorJAEvent) => void) | null = null
  closeListener: ((e: ConnectionError) => void) | null = null
  disconnected = false

  constructor() {
    FakeAdapter.instances.push(this)
  }

  connect(): Promise<void> {
    if (FakeAdapter.failWith) return Promise.reject(FakeAdapter.failWith)
    if (FakeAdapter.failNext > 0) {
      FakeAdapter.failNext -= 1
      return Promise.reject(new ConnectionError('unreachable', 'refused'))
    }
    return Promise.resolve()
  }

  disconnect(): void {
    this.disconnected = true
  }

  onEvent(listener: (e: LouvorJAEvent) => void): void {
    this.eventListener = listener
  }

  onClose(listener: (e: ConnectionError) => void): void {
    this.closeListener = listener
  }
}

function setup() {
  const repository = new ConnectionRepository(openDatabase(':memory:'))
  const service = new ConnectionService({
    adapterFactory: () => new FakeAdapter(),
    repository,
    backoff: { initialMs: 1000, maxMs: 4000 },
    now: () => new Date('2026-01-01T10:00:00.000Z')
  })
  const statuses: ConnectionStatus[] = []
  service.onStatus((s) => statuses.push(s))
  return { service, repository, statuses }
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

describe('ConnectionService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeAdapter.instances = []
    FakeAdapter.failNext = 0
    FakeAdapter.failWith = null
  })
  afterEach(() => vi.useRealTimers())

  it('gives up (no retries) when the token is refused, and says why', async () => {
    FakeAdapter.failWith = new ConnectionError('unauthorized')
    const { service, repository } = setup()
    service.connect(endpoint)
    await flush()

    expect(service.getStatus()).toMatchObject({
      state: 'disconnected',
      endpoint: { host: '10.0.0.5' },
      lastError: { code: 'unauthorized' },
      retryInMs: null
    })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeAdapter.instances).toHaveLength(1) // never tried again
    expect(repository.listEvents()[0]).toMatchObject({ event: 'error', message: 'unauthorized' })
  })

  it('gives up when a token stops working in the middle of a session', async () => {
    const { service } = setup()
    service.connect(endpoint)
    await flush()

    FakeAdapter.instances[0]!.closeListener?.(new ConnectionError('unauthorized'))
    expect(service.getStatus()).toMatchObject({
      state: 'disconnected',
      lastError: { code: 'unauthorized' }
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeAdapter.instances).toHaveLength(1)
  })

  it('goes disconnected -> connecting -> connected and saves the endpoint', async () => {
    const { service, repository, statuses } = setup()
    service.connect(endpoint)
    expect(service.getStatus()).toMatchObject({ state: 'connecting', attempt: 1 })

    await flush()
    expect(service.getStatus()).toMatchObject({
      state: 'connected',
      attempt: 0,
      lastError: null,
      connectedAt: '2026-01-01T10:00:00.000Z'
    })
    expect(statuses.map((s) => s.state)).toEqual(['disconnected', 'connecting', 'connected'])
    expect(repository.getLast()).toMatchObject({ host: '10.0.0.5' })
    expect(repository.listEvents().map((e) => e.event)).toEqual(['connected'])
  })

  it('retries with exponential backoff capped at the maximum', async () => {
    FakeAdapter.failNext = 5
    const { service } = setup()
    service.connect(endpoint)
    await flush()
    expect(service.getStatus()).toMatchObject({
      state: 'reconnecting',
      attempt: 1,
      retryInMs: 1000,
      lastError: { code: 'unreachable', detail: 'refused' }
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(service.getStatus()).toMatchObject({ attempt: 2, retryInMs: 2000 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(service.getStatus()).toMatchObject({ attempt: 3, retryInMs: 4000 })
    await vi.advanceTimersByTimeAsync(4000)
    expect(service.getStatus()).toMatchObject({ attempt: 4, retryInMs: 4000 }) // capped
  })

  it('connects as soon as an attempt succeeds and clears the error', async () => {
    FakeAdapter.failNext = 2
    const { service } = setup()
    service.connect(endpoint)
    await flush()
    await vi.advanceTimersByTimeAsync(1000 + 2000)

    expect(service.getStatus()).toMatchObject({ state: 'connected', attempt: 0, lastError: null })
  })

  it('logs only the first failure of a streak', async () => {
    FakeAdapter.failNext = 3
    const { service, repository } = setup()
    service.connect(endpoint)
    await flush()
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000)

    const events = repository.listEvents().map((e) => e.event)
    expect(events).toEqual(['connected', 'error'])
  })

  it('reconnects automatically when an established connection drops', async () => {
    const { service, repository } = setup()
    service.connect(endpoint)
    await flush()

    FakeAdapter.instances[0]!.closeListener?.(new ConnectionError('closed'))
    expect(service.getStatus()).toMatchObject({
      state: 'reconnecting',
      lastError: { code: 'closed' },
      retryInMs: 1000
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(service.getStatus().state).toBe('connected')
    expect(FakeAdapter.instances).toHaveLength(2)
    expect(repository.listEvents().map((e) => e.event)).toEqual([
      'connected',
      'disconnected',
      'connected'
    ])
  })

  it('forwards adapter events while connected', async () => {
    const { service } = setup()
    const received: LouvorJAEvent[] = []
    service.onEvent((e) => received.push(e))
    service.connect(endpoint)
    await flush()

    const event: LouvorJAEvent = { type: 'presentation-ended', presentationId: 'p1' }
    FakeAdapter.instances[0]!.eventListener?.(event)
    expect(received).toEqual([event])
  })

  it('disconnect stops retrying, closes the adapter and resets the status', async () => {
    FakeAdapter.failNext = 10
    const { service } = setup()
    service.connect(endpoint)
    await flush()
    service.disconnect()

    expect(service.getStatus()).toMatchObject({ state: 'disconnected', endpoint: null })
    const attempts = FakeAdapter.instances.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeAdapter.instances).toHaveLength(attempts)
  })

  it('a new connect() abandons the previous attempt and ignores its late events', async () => {
    const { service } = setup()
    service.connect(endpoint)
    await flush()
    const first = FakeAdapter.instances[0]!

    service.connect({ ...endpoint, host: '10.0.0.6' })
    await flush()
    expect(first.disconnected).toBe(true)

    const received: LouvorJAEvent[] = []
    service.onEvent((e) => received.push(e))
    first.eventListener?.({ type: 'presentation-ended', presentationId: 'stale' })
    first.closeListener?.(new ConnectionError('closed'))

    expect(received).toEqual([])
    expect(service.getStatus()).toMatchObject({
      state: 'connected',
      endpoint: { host: '10.0.0.6' }
    })
  })

  it('records a manual disconnect in the history', async () => {
    const { service, repository } = setup()
    service.connect(endpoint)
    await flush()
    service.disconnect()

    expect(repository.listEvents()[0]).toMatchObject({ event: 'disconnected', message: 'manual' })
  })
})
