-- Saved VLC/MPC connections (see docs/protocolo-players-externos.md), mirroring LouvorJA's
-- `connections` table (0004_louvorja_real_protocol.sql) but scoped down: no event-history log was
-- asked for here. `kind` is part of what makes a row unique, since VLC and MPC could otherwise
-- both sit on the same host/port pair.

CREATE TABLE external_player_connections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kind              TEXT NOT NULL CHECK (kind IN ('vlc', 'mpc')),
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  password          TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_connected_at TEXT,
  UNIQUE (kind, host, port)
) STRICT;
