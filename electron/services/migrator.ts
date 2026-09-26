import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  /** File name without extension, e.g. `0001_init`. Applied in lexical order. */
  name: string
  sql: string
}

/** Applies pending migrations, each one inside its own transaction. Returns the applied names. */
export function runMigrations(db: DatabaseSync, migrations: Migration[]): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT
  `)

  const done = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => String(row.name))
  )
  const applied: string[] = []

  for (const migration of migrations) {
    if (done.has(migration.name)) continue
    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
        cause: error
      })
    }
    applied.push(migration.name)
  }

  return applied
}
