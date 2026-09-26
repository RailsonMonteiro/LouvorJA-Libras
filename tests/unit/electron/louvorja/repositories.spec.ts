import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../../electron/services/DatabaseService'
import { ConnectionRepository } from '../../../../electron/services/louvorja/ConnectionRepository'
import { PresentationRepository } from '../../../../electron/services/louvorja/PresentationRepository'
import type { Slide } from '../../../../src/modules/louvorja/types/louvorja.types'

const endpoint = { host: '192.168.0.10', port: 7070, token: 'AB12c' } as const

describe('ConnectionRepository', () => {
  it('saves an endpoint once and tracks the last used one', () => {
    const repo = new ConnectionRepository(openDatabase(':memory:'))
    expect(repo.getLast()).toBeNull()

    repo.markConnected(endpoint)
    repo.markConnected({ ...endpoint, token: 'NEW99' }) // same address: updates the token
    repo.markConnected({ host: 'OTHER.local', port: 9000, token: '' })

    const list = repo.list()
    expect(list).toHaveLength(2)
    expect(repo.getLast()).toMatchObject({ host: 'other.local', port: 9000, token: '' })
    expect(list.find((c) => c.host === '192.168.0.10')?.token).toBe('NEW99')
  })

  it('removes saved endpoints', () => {
    const repo = new ConnectionRepository(openDatabase(':memory:'))
    repo.markConnected(endpoint)
    repo.remove(repo.list()[0]!.id)
    expect(repo.list()).toEqual([])
  })

  it('logs events newest first and prunes old ones', () => {
    const db = openDatabase(':memory:')
    const repo = new ConnectionRepository(db)
    repo.addEvent(endpoint, 'connected')
    repo.addEvent(endpoint, 'error', 'unreachable')
    db.prepare(
      `INSERT INTO connection_history (host, port, event, created_at)
       VALUES ('x', 1, 'connected', '2000-01-01T00:00:00.000Z')`
    ).run()

    expect(repo.listEvents().map((e) => e.event)).toEqual(['error', 'connected', 'connected'])
    expect(repo.pruneEvents(30)).toBe(1)
    expect(repo.listEvents()).toHaveLength(2)
  })
})

describe('PresentationRepository', () => {
  const slide: Slide = {
    id: 's1',
    presentationId: 'p1',
    index: 0,
    total: 2,
    title: 'Hino',
    text: 'Letra',
    nextText: null,
    kind: 'lyrics',
    receivedAt: '2026-01-01T10:00:00.000Z'
  }

  it('stores slides under their presentation and reuses the open presentation', () => {
    const repo = new PresentationRepository(openDatabase(':memory:'))
    const presentation = { id: 'p1', title: 'Culto', startedAt: '2026-01-01T10:00:00.000Z' }

    const first = repo.start(presentation)
    expect(repo.start(presentation)).toBe(first)

    repo.addSlide(first, slide)
    expect(repo.countSlides()).toBe(1)

    repo.end('p1', '2026-01-01T11:00:00.000Z')
    // After it ended, the same external id starts a new presentation.
    expect(repo.start(presentation)).not.toBe(first)
  })

  it('prunes old presentations together with their slides', () => {
    const repo = new PresentationRepository(openDatabase(':memory:'))
    const old = repo.start({ id: 'old', title: 'Old', startedAt: '2000-01-01T00:00:00.000Z' })
    repo.addSlide(old, slide)
    const recent = repo.start({ id: 'new', title: 'New', startedAt: new Date().toISOString() })
    repo.addSlide(recent, slide)

    expect(repo.prune(30)).toBe(1)
    expect(repo.countSlides()).toBe(1)
  })
})
