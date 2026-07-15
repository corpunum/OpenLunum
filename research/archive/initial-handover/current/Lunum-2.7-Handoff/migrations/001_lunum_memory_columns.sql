-- Lunum 2.7 memory sidecar columns

ALTER TABLE facts ADD COLUMN lunum_sem_json TEXT;
ALTER TABLE facts ADD COLUMN lunum_fp TEXT;
ALTER TABLE facts ADD COLUMN lunum_code TEXT;
ALTER TABLE facts ADD COLUMN lunum_confidence REAL DEFAULT 0;
ALTER TABLE facts ADD COLUMN lunum_schema_version TEXT;
ALTER TABLE facts ADD COLUMN lunum_risk TEXT DEFAULT 'unknown';
ALTER TABLE facts ADD COLUMN lunum_context_eligible INTEGER DEFAULT 0;
ALTER TABLE facts ADD COLUMN lunum_last_validated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_facts_lunum_fp ON facts(lunum_fp);
CREATE INDEX IF NOT EXISTS idx_facts_lunum_context_eligible ON facts(lunum_context_eligible);
CREATE INDEX IF NOT EXISTS idx_facts_lunum_schema_version ON facts(lunum_schema_version);
