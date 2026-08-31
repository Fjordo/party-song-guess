-- Song catalog schema.
--
-- Deliberately provider-agnostic: the music provider appears only as a VALUE in
-- songs.provider, never as a column name, so swapping provider is a change to
-- services/musicService.js and nothing else.

CREATE TABLE IF NOT EXISTS songs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  provider         TEXT    NOT NULL,
  provider_ref     TEXT    NOT NULL,
  dedupe_key       TEXT    NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  artist           TEXT    NOT NULL,
  album            TEXT,
  preview_url      TEXT    NOT NULL,
  artwork_url      TEXT,
  release_date     TEXT,
  year             INTEGER,
  decade           TEXT,
  provider_genre   TEXT,
  is_reissue       INTEGER NOT NULL DEFAULT 0,
  ai_difficulty    TEXT,
  eff_difficulty   TEXT,
  play_count       INTEGER NOT NULL DEFAULT 0,
  guess_count      INTEGER NOT NULL DEFAULT 0,
  total_guess_ms   INTEGER NOT NULL DEFAULT 0,
  last_played_at   TEXT,
  last_verified_at TEXT,
  dead_checks      INTEGER NOT NULL DEFAULT 0,
  origin           TEXT    NOT NULL,
  added_at         TEXT    NOT NULL,
  UNIQUE (provider, provider_ref)
);

-- A song is discovered by several buckets, so its tags accumulate as a union.
CREATE TABLE IF NOT EXISTS song_tags (
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  kind    TEXT    NOT NULL,
  value   TEXT    NOT NULL,
  PRIMARY KEY (song_id, kind, value)
);

CREATE INDEX IF NOT EXISTS idx_tags_lookup  ON song_tags(kind, value, song_id);
CREATE INDEX IF NOT EXISTS idx_songs_play   ON songs(play_count, last_played_at);
CREATE INDEX IF NOT EXISTS idx_songs_verify ON songs(last_verified_at);

-- Rotation state for the incremental builder; survives restarts.
CREATE TABLE IF NOT EXISTS buckets (
  key          TEXT PRIMARY KEY,
  last_run_at  TEXT,
  runs         INTEGER NOT NULL DEFAULT 0,
  found        INTEGER NOT NULL DEFAULT 0,
  added        INTEGER NOT NULL DEFAULT 0,
  empty_streak INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
