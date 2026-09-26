import type { DatabaseSync } from 'node:sqlite'

/** Persistence for the sign catalog, the manual translations and the translation cache. */
export class LibrasRepository {
  constructor(private readonly db: DatabaseSync) {}

  // --- sign catalog ---

  listSigns(): string[] {
    return this.db
      .prepare('SELECT gloss FROM signs')
      .all()
      .map((row) => String(row.gloss))
  }

  /** Replaces the whole catalog atomically, and remembers where and when it came from. */
  replaceSigns(signs: string[], url: string, now: Date): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM signs')
      const insert = this.db.prepare('INSERT OR IGNORE INTO signs (gloss) VALUES (?)')
      for (const sign of signs) insert.run(sign)
      this.setMeta('signs_url', url)
      this.setMeta('signs_updated_at', now.toISOString())
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM libras_meta WHERE key = ?').get(key)
    return row ? String(row.value) : null
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO libras_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  // --- manual translations ---

  getOverride(textKey: string): string | null {
    const row = this.db.prepare('SELECT gloss FROM translations WHERE text_key = ?').get(textKey)
    return row ? String(row.gloss) : null
  }

  setOverride(textKey: string, text: string, gloss: string): void {
    this.db
      .prepare(
        `INSERT INTO translations (text_key, text, gloss) VALUES (?, ?, ?)
         ON CONFLICT(text_key) DO UPDATE SET
           text = excluded.text,
           gloss = excluded.gloss,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(textKey, text, gloss)
  }

  removeOverride(textKey: string): void {
    this.db.prepare('DELETE FROM translations WHERE text_key = ?').run(textKey)
  }

  countOverrides(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM translations').get()?.n ?? 0)
  }

  // --- cache ---

  getCached(textKey: string, engine: string): string | null {
    const row = this.db
      .prepare('SELECT gloss FROM translation_cache WHERE text_key = ? AND engine = ?')
      .get(textKey, engine)
    return row ? String(row.gloss) : null
  }

  /** The most recent cached gloss for a text, whichever engine produced it. */
  getCachedAny(textKey: string): string | null {
    const row = this.db
      .prepare(
        'SELECT gloss FROM translation_cache WHERE text_key = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(textKey)
    return row ? String(row.gloss) : null
  }

  putCache(textKey: string, engine: string, text: string, gloss: string): void {
    this.db
      .prepare(
        `INSERT INTO translation_cache (text_key, engine, text, gloss) VALUES (?, ?, ?, ?)
         ON CONFLICT(text_key, engine) DO UPDATE SET
           gloss = excluded.gloss,
           created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .run(textKey, engine, text, gloss)
  }

  countCache(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM translation_cache').get()?.n ?? 0)
  }

  pruneCache(days = 180): number {
    const result = this.db
      .prepare(
        `DELETE FROM translation_cache
         WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
      )
      .run(`-${Math.trunc(days)} days`)
    return Number(result.changes)
  }
}
