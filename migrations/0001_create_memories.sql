CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  answer TEXT NOT NULL,
  supporting_thought TEXT,
  tags_json TEXT NOT NULL,
  question_variants_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_memories_active_sort
ON memories (is_active, sort_order, category);
