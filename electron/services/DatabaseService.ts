import { DatabaseSync } from 'node:sqlite'
import { migrations as bundledMigrations } from '../../database/migrations'
import { runMigrations, type Migration } from './migrator'

/**
 * Opens the local SQLite database and brings its schema up to date.
 * Uses the `node:sqlite` module bundled with Electron, so there is no native addon to rebuild.
 */
export function openDatabase(
  path: string,
  migrations: Migration[] = bundledMigrations
): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  runMigrations(db, migrations)
  return db
}
