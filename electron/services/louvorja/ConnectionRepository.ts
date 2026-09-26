import type { DatabaseSync } from 'node:sqlite'
import type {
  ConnectionEvent,
  ConnectionEventType,
  Endpoint,
  SavedConnection
} from '../../../src/modules/louvorja/types/louvorja.types'

type Address = Pick<Endpoint, 'host' | 'port'>

/** Saved endpoints (`connections`) and their event log (`connection_history`). */
export class ConnectionRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** Inserts the endpoint if new and stamps `last_connected_at` (and keeps the latest token). */
  markConnected(endpoint: Endpoint): void {
    this.db
      .prepare(
        `INSERT INTO connections (host, port, token, last_connected_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(host, port) DO UPDATE SET
           token = excluded.token,
           last_connected_at = excluded.last_connected_at`
      )
      .run(endpoint.host.toLowerCase(), endpoint.port, endpoint.token)
  }

  /** Most recently used endpoint, used by the auto-connect on startup. */
  getLast(): SavedConnection | null {
    const row = this.db
      .prepare(
        `SELECT * FROM connections WHERE last_connected_at IS NOT NULL
         ORDER BY last_connected_at DESC, id DESC LIMIT 1`
      )
      .get()
    return row ? this.toSaved(row) : null
  }

  list(limit = 20): SavedConnection[] {
    return this.db
      .prepare(
        `SELECT * FROM connections
         ORDER BY last_connected_at IS NULL, last_connected_at DESC, id DESC LIMIT ?`
      )
      .all(limit)
      .map((row) => this.toSaved(row))
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM connections WHERE id = ?').run(id)
  }

  addEvent(address: Address, event: ConnectionEventType, message: string | null = null): void {
    this.db
      .prepare('INSERT INTO connection_history (host, port, event, message) VALUES (?, ?, ?, ?)')
      .run(address.host.toLowerCase(), address.port, event, message)
  }

  listEvents(limit = 30): ConnectionEvent[] {
    return this.db
      .prepare('SELECT * FROM connection_history ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit)
      .map((row) => ({
        id: Number(row.id),
        host: String(row.host),
        port: Number(row.port),
        event: String(row.event) as ConnectionEventType,
        message: row.message === null ? null : String(row.message),
        createdAt: String(row.created_at)
      }))
  }

  pruneEvents(days = 30): number {
    const result = this.db
      .prepare(
        `DELETE FROM connection_history
         WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
      )
      .run(`-${Math.trunc(days)} days`)
    return Number(result.changes)
  }

  private toSaved(row: Record<string, unknown>): SavedConnection {
    return {
      id: Number(row.id),
      host: String(row.host),
      port: Number(row.port),
      token: String(row.token),
      lastConnectedAt: row.last_connected_at === null ? null : String(row.last_connected_at)
    }
  }
}
