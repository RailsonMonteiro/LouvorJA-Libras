import type { DatabaseSync } from 'node:sqlite'
import type { Presentation, Slide } from '../../../src/modules/louvorja/types/louvorja.types'

/** Persists received presentations and slides (`presentations`, `presentation_slides`). */
export class PresentationRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** Returns the row id of the presentation, creating it when this is its first appearance. */
  start(presentation: Presentation): number {
    const open = this.db
      .prepare('SELECT id FROM presentations WHERE external_id = ? AND ended_at IS NULL')
      .get(presentation.id)
    if (open) return Number(open.id)

    const result = this.db
      .prepare('INSERT INTO presentations (external_id, title, started_at) VALUES (?, ?, ?)')
      .run(presentation.id, presentation.title, presentation.startedAt)
    return Number(result.lastInsertRowid)
  }

  end(externalId: string, endedAt: string): void {
    this.db
      .prepare('UPDATE presentations SET ended_at = ? WHERE external_id = ? AND ended_at IS NULL')
      .run(endedAt, externalId)
  }

  addSlide(presentationRowId: number, slide: Slide): void {
    this.db
      .prepare(
        `INSERT INTO presentation_slides
           (presentation_id, external_id, position, total, title, text, kind, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        presentationRowId,
        slide.id,
        slide.index,
        slide.total,
        slide.title,
        slide.text,
        slide.kind,
        slide.receivedAt
      )
  }

  countSlides(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM presentation_slides').get()?.n ?? 0)
  }

  /** Removes presentations (and, by cascade, their slides) older than `days` days. */
  prune(days = 30): number {
    const result = this.db
      .prepare(
        `DELETE FROM presentations
         WHERE started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
      )
      .run(`-${Math.trunc(days)} days`)
    return Number(result.changes)
  }
}
