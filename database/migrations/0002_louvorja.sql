-- Phase 2: LouvorJA integration (saved connections, connection log, received presentations).

CREATE TABLE connections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  transport         TEXT NOT NULL CHECK (transport IN ('websocket', 'http')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_connected_at TEXT,
  UNIQUE (host, port, transport)
) STRICT;

CREATE TABLE connection_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  host       TEXT NOT NULL,
  port       INTEGER NOT NULL,
  transport  TEXT NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('connected', 'disconnected', 'error')),
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_connection_history_created_at ON connection_history (created_at);

CREATE TABLE presentations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,           -- id sent by LouvorJA
  title       TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT
) STRICT;

CREATE INDEX idx_presentations_external_id ON presentations (external_id);

CREATE TABLE presentation_slides (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  presentation_id INTEGER NOT NULL REFERENCES presentations (id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  position        INTEGER,
  total           INTEGER,
  title           TEXT,
  text            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  received_at     TEXT NOT NULL
) STRICT;

CREATE INDEX idx_presentation_slides_presentation ON presentation_slides (presentation_id);
CREATE INDEX idx_presentation_slides_received_at ON presentation_slides (received_at);
