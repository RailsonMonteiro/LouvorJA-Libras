-- The real LouvorJA transmission server speaks a single protocol (HTTP API, see
-- docs/protocolo-louvorja.md), so the guessed "transport" column goes away and the access token
-- is stored instead.
--
-- Rows saved so far were made against a simulator of the earlier, guessed protocol and would not
-- work with a real LouvorJA, so the two tables are recreated empty.

DROP TABLE connection_history;
DROP TABLE connections;

CREATE TABLE connections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  token             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_connected_at TEXT,
  UNIQUE (host, port)
) STRICT;

CREATE TABLE connection_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  host       TEXT NOT NULL,
  port       INTEGER NOT NULL,
  event      TEXT NOT NULL CHECK (event IN ('connected', 'disconnected', 'error')),
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_connection_history_created_at ON connection_history (created_at);
