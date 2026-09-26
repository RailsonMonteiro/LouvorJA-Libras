import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '../../../database/migrations'
import { openDatabase } from '../../../electron/services/DatabaseService'
import { runMigrations } from '../../../electron/services/migrator'

describe('migrator', () => {
  it('bundles the SQL migrations in order', () => {
    expect(migrations.length).toBeGreaterThan(0)
    expect(migrations[0]?.name).toBe('0001_init')
    expect(migrations.map((m) => m.name)).toEqual([...migrations.map((m) => m.name)].sort())
  })

  it('applies pending migrations once', () => {
    const db = new DatabaseSync(':memory:')
    const first = runMigrations(db, [{ name: '0001_a', sql: 'CREATE TABLE a (id INTEGER)' }])
    const second = runMigrations(db, [
      { name: '0001_a', sql: 'CREATE TABLE a (id INTEGER)' },
      { name: '0002_b', sql: 'CREATE TABLE b (id INTEGER)' }
    ])
    expect(first).toEqual(['0001_a'])
    expect(second).toEqual(['0002_b'])
  })

  it('rolls back a failing migration and reports it', () => {
    const db = new DatabaseSync(':memory:')
    expect(() =>
      runMigrations(db, [
        { name: '0001_bad', sql: 'CREATE TABLE ok (id INTEGER); INSERT INTO missing VALUES (1)' }
      ])
    ).toThrow(/0001_bad/)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").all()
    expect(tables).toHaveLength(0)
  })

  it('upgrades a database that already holds connections saved with the earlier schema', () => {
    const db = new DatabaseSync(':memory:')
    const before = migrations.filter((m) => m.name < '0004')
    runMigrations(db, before)
    db.prepare(
      "INSERT INTO connections (host, port, transport, last_connected_at) VALUES ('192.168.0.9', 8080, 'websocket', '2026-01-01T00:00:00.000Z')"
    ).run()
    db.prepare(
      "INSERT INTO connection_history (host, port, transport, event) VALUES ('192.168.0.9', 8080, 'websocket', 'connected')"
    ).run()

    // The user's real database is in this state: it only has to survive the upgrade.
    expect(runMigrations(db, migrations)).toEqual([
      '0004_louvorja_real_protocol',
      '0005_external_player_connections',
      '0006_drop_external_player_connections'
    ])

    const columns = db
      .prepare("SELECT name FROM pragma_table_info('connections')")
      .all()
      .map((row) => row.name)
    expect(columns).toEqual(expect.arrayContaining(['host', 'port', 'token']))
    expect(columns).not.toContain('transport')
    expect(db.prepare('SELECT COUNT(*) AS n FROM connections').get()?.n).toBe(0)

    // ...and the new tables are usable.
    db.prepare(
      "INSERT INTO connections (host, port, token) VALUES ('10.0.0.1', 7070, 'AB12c')"
    ).run()
    expect(() =>
      db.prepare("INSERT INTO connections (host, port, token) VALUES ('10.0.0.1', 7070, 'X')").run()
    ).toThrow(/UNIQUE/)
  })

  it('creates the base schema', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    expect(tables).toEqual(expect.arrayContaining(['settings', 'logs', 'schema_migrations']))
  })
})
