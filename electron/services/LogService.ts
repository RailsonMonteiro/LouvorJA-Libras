import type { DatabaseSync } from 'node:sqlite'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class LogService {
  constructor(private readonly db: DatabaseSync) {}

  log(level: LogLevel, scope: string, message: string, data?: unknown): void {
    console[level === 'debug' ? 'log' : level](`[${scope}] ${message}`, data ?? '')
    try {
      this.db
        .prepare('INSERT INTO logs (level, scope, message, data) VALUES (?, ?, ?, ?)')
        .run(level, scope, message, data === undefined ? null : JSON.stringify(data))
    } catch {
      // Logging must never break the caller.
    }
  }

  info(scope: string, message: string, data?: unknown): void {
    this.log('info', scope, message, data)
  }

  warn(scope: string, message: string, data?: unknown): void {
    this.log('warn', scope, message, data)
  }

  error(scope: string, message: string, data?: unknown): void {
    this.log('error', scope, message, data)
  }

  /** Deletes entries older than `days` days. */
  prune(days = 30): number {
    const result = this.db
      .prepare(`DELETE FROM logs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`)
      .run(`-${Math.trunc(days)} days`)
    return Number(result.changes)
  }
}
