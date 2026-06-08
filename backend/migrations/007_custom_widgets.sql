CREATE TABLE IF NOT EXISTS custom_widgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  source_code   TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'active',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
