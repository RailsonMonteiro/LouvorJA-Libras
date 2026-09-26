-- Phase 1 base schema: application settings and technical logs.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,          -- JSON encoded
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  scope      TEXT NOT NULL,          -- connection, translation, avatar, app...
  message    TEXT NOT NULL,
  data       TEXT,                   -- JSON encoded, optional
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_logs_created_at ON logs (created_at);
CREATE INDEX idx_logs_scope_level ON logs (scope, level);
