-- Libras translator: sign catalog, manual translations and translation cache.

-- Names of the signs the player can perform (downloaded from the sign index, never bundled).
CREATE TABLE signs (
  gloss TEXT PRIMARY KEY
) STRICT;

CREATE TABLE libras_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- Glosses written or corrected by a person. They always win over any engine.
CREATE TABLE translations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text_key   TEXT NOT NULL UNIQUE,   -- normalised text (see textKey)
  text       TEXT NOT NULL,          -- text as it was written
  gloss      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Results of the automatic engines, so a slide is translated once.
CREATE TABLE translation_cache (
  text_key   TEXT NOT NULL,
  engine     TEXT NOT NULL,          -- 'online', later 'local:<version>'
  text       TEXT NOT NULL,
  gloss      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (text_key, engine)
) STRICT;

CREATE INDEX idx_translation_cache_created_at ON translation_cache (created_at);
