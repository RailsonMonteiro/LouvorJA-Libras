import type {
  LouvorJAEvent,
  Presentation,
  Slide
} from '../../../src/modules/louvorja/types/louvorja.types'
import type { PresentationRepository } from './PresentationRepository'

const MAX_RECENT_SLIDES = 100

/**
 * Turns adapter events into the presentation state (current presentation, current slide and a
 * bounded history) and persists what was received.
 */
export class SlideReceiverService {
  private presentation: Presentation | null = null
  private presentationRowId: number | null = null
  private currentSlide: Slide | null = null
  private recent: Slide[] = []

  private readonly presentationListeners = new Set<(p: Presentation | null) => void>()
  private readonly slideListeners = new Set<(slide: Slide) => void>()

  constructor(
    private readonly repository: PresentationRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  getPresentation(): Presentation | null {
    return this.presentation
  }

  getCurrentSlide(): Slide | null {
    return this.currentSlide
  }

  /** Oldest first. */
  getRecentSlides(): Slide[] {
    return [...this.recent]
  }

  onPresentation(listener: (presentation: Presentation | null) => void): () => void {
    this.presentationListeners.add(listener)
    return () => this.presentationListeners.delete(listener)
  }

  onSlide(listener: (slide: Slide) => void): () => void {
    this.slideListeners.add(listener)
    return () => this.slideListeners.delete(listener)
  }

  handle(event: LouvorJAEvent): void {
    switch (event.type) {
      case 'presentation-started':
        this.startPresentation(event.presentation)
        break
      case 'presentation-ended':
        this.endPresentation(event.presentationId)
        break
      case 'slide':
        this.receiveSlide(event.slide)
        break
    }
  }

  private startPresentation(presentation: Presentation): void {
    // A repeated "start" for the presentation already open (e.g. replay after reconnecting).
    if (this.presentation?.id === presentation.id) return
    this.presentation = presentation
    this.presentationRowId = this.repository.start(presentation)
    this.recent = []
    this.currentSlide = null
    this.presentationListeners.forEach((l) => l(presentation))
  }

  private endPresentation(id: string): void {
    if (this.presentation?.id !== id) return
    this.repository.end(id, this.now().toISOString())
    this.presentation = null
    this.presentationRowId = null
    this.presentationListeners.forEach((l) => l(null))
  }

  private receiveSlide(slide: Slide): void {
    if (this.currentSlide?.id === slide.id && this.currentSlide.text === slide.text) return

    // Slides sent without a presentation still belong somewhere: open an implicit one.
    if (!this.presentation) {
      this.startPresentation({
        id: slide.presentationId ?? `implicit-${slide.receivedAt}`,
        title: slide.title ?? '',
        startedAt: slide.receivedAt
      })
    }
    if (this.presentationRowId !== null) this.repository.addSlide(this.presentationRowId, slide)

    this.currentSlide = slide
    this.recent.push(slide)
    if (this.recent.length > MAX_RECENT_SLIDES) this.recent.shift()
    this.slideListeners.forEach((l) => l(slide))
  }
}
