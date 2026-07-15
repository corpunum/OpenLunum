-- Lunum 2.7 shadow evaluation logs

CREATE TABLE IF NOT EXISTS lunum_shadow_eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  model_name TEXT,
  context_mode TEXT NOT NULL,
  natural_tokens INTEGER,
  mixed_tokens INTEGER,
  lunum_tokens INTEGER,
  mixed_ratio REAL,
  lunum_ratio REAL,
  natural_score REAL,
  mixed_score REAL,
  lunum_score REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS lunum_shadow_eval_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  question TEXT,
  target_memory_ids TEXT,
  natural_answer TEXT,
  mixed_answer TEXT,
  lunum_answer TEXT,
  natural_score REAL,
  mixed_score REAL,
  lunum_score REAL,
  failure_reason TEXT,
  FOREIGN KEY(run_id) REFERENCES lunum_shadow_eval_runs(id)
);
