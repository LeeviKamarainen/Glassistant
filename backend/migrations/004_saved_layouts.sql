CREATE TABLE IF NOT EXISTS saved_layouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  description   TEXT    NOT NULL DEFAULT '',
  snapshot_json TEXT    NOT NULL DEFAULT '[]',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
