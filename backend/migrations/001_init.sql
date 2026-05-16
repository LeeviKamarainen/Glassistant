CREATE TABLE IF NOT EXISTS widgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL,
  row         INTEGER NOT NULL,
  col         INTEGER NOT NULL,
  row_span    INTEGER NOT NULL DEFAULT 1,
  col_span    INTEGER NOT NULL DEFAULT 1,
  config_json TEXT    NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  z_order     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_widgets_position ON widgets(row, col);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
