import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../../electron/services/DatabaseService'
import { PresentationRepository } from '../../../../electron/services/louvorja/PresentationRepository'
import { SlideReceiverService } from '../../../../electron/services/louvorja/SlideReceiverService'
import type { LouvorJAEvent, Slide } from '../../../../src/modules/louvorja/types/louvorja.types'

const slide = (id: string, text = `text ${id}`, extra: Partial<Slide> = {}): Slide => ({
  id,
  presentationId: 'p1',
  index: null,
  total: null,
  title: null,
  text,
  nextText: null,
  kind: 'lyrics',
  receivedAt: '2026-01-01T10:00:00.000Z',
  ...extra
})

const started = (id = 'p1'): LouvorJAEvent => ({
  type: 'presentation-started',
  presentation: { id, title: `Presentation ${id}`, startedAt: '2026-01-01T10:00:00.000Z' }
})

function setup() {
  const db = openDatabase(':memory:')
  const repo = new PresentationRepository(db)
  const service = new SlideReceiverService(repo, () => new Date('2026-01-01T12:00:00.000Z'))
  const presentations: unknown[] = []
  const slides: Slide[] = []
  service.onPresentation((p) => presentations.push(p))
  service.onSlide((s) => slides.push(s))
  return { service, repo, presentations, slides }
}

describe('SlideReceiverService', () => {
  it('tracks the presentation and the current slide', () => {
    const { service, slides, presentations } = setup()
    service.handle(started())
    service.handle({ type: 'slide', slide: slide('a') })
    service.handle({ type: 'slide', slide: slide('b') })

    expect(service.getPresentation()?.title).toBe('Presentation p1')
    expect(service.getCurrentSlide()?.id).toBe('b')
    expect(service.getRecentSlides().map((s) => s.id)).toEqual(['a', 'b'])
    expect(slides).toHaveLength(2)
    expect(presentations).toHaveLength(1)
  })

  it('ignores a replay of the same slide and of the open presentation', () => {
    const { service, slides, presentations, repo } = setup()
    service.handle(started())
    service.handle({ type: 'slide', slide: slide('a') })
    service.handle(started()) // replay after reconnecting
    service.handle({ type: 'slide', slide: slide('a') })

    expect(slides).toHaveLength(1)
    expect(presentations).toHaveLength(1)
    expect(repo.countSlides()).toBe(1)
    expect(service.getCurrentSlide()?.id).toBe('a')
  })

  it('treats the same id with different text as a new slide', () => {
    const { service, slides } = setup()
    service.handle(started())
    service.handle({ type: 'slide', slide: slide('a', 'one') })
    service.handle({ type: 'slide', slide: slide('a', 'two') })
    expect(slides).toHaveLength(2)
  })

  it('opens an implicit presentation for slides that arrive alone', () => {
    const { service, presentations } = setup()
    service.handle({ type: 'slide', slide: slide('a', 'oi', { presentationId: null }) })

    expect(service.getPresentation()).not.toBeNull()
    expect(presentations).toHaveLength(1)
    expect(service.getCurrentSlide()?.text).toBe('oi')
  })

  it('clears the presentation on end but keeps the last slide visible', () => {
    const { service, presentations } = setup()
    service.handle(started())
    service.handle({ type: 'slide', slide: slide('a') })
    service.handle({ type: 'presentation-ended', presentationId: 'p1' })

    expect(service.getPresentation()).toBeNull()
    expect(presentations.at(-1)).toBeNull()
    expect(service.getCurrentSlide()?.id).toBe('a')
  })

  it('ignores the end of a presentation that is not the current one', () => {
    const { service } = setup()
    service.handle(started('p1'))
    service.handle({ type: 'presentation-ended', presentationId: 'other' })
    expect(service.getPresentation()?.id).toBe('p1')
  })

  it('starting another presentation resets the slide history', () => {
    const { service } = setup()
    service.handle(started('p1'))
    service.handle({ type: 'slide', slide: slide('a') })
    service.handle(started('p2'))

    expect(service.getRecentSlides()).toEqual([])
    expect(service.getCurrentSlide()).toBeNull()
  })

  it('keeps only the most recent 100 slides in memory', () => {
    const { service } = setup()
    service.handle(started())
    for (let i = 0; i < 120; i++) service.handle({ type: 'slide', slide: slide(`s${i}`) })

    const recent = service.getRecentSlides()
    expect(recent).toHaveLength(100)
    expect(recent[0]?.id).toBe('s20')
  })
})
