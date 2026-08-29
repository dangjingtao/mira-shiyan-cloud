PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  language TEXT,
  duration_ms INTEGER,
  segments_json TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_request_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES capture_tasks(id) ON DELETE CASCADE
);

ALTER TABLE audio_assets ADD COLUMN retained INTEGER NOT NULL DEFAULT 0 CHECK (retained IN (0, 1));
ALTER TABLE audio_assets ADD COLUMN delete_after TEXT;

CREATE INDEX IF NOT EXISTS idx_audio_assets_cleanup
  ON audio_assets(retained, delete_after, status);

CREATE INDEX IF NOT EXISTS idx_transcripts_task
  ON transcripts(task_id);
