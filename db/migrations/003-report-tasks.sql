-- Run once after 002. Additive migration; existing rows remain readable by admin.
ALTER TABLE fate_reading_history
  ADD COLUMN task_state JSON NULL,
  ADD COLUMN schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN revision INT NOT NULL DEFAULT 0,
  ADD COLUMN next_run_at DATETIME(3) NULL,
  ADD INDEX idx_fate_task_due (next_run_at);
ALTER TABLE fate_operation_log
  ADD COLUMN call_id CHAR(36) NULL,
  ADD COLUMN metadata_json JSON NULL,
  ADD UNIQUE INDEX uq_fate_call (call_id);
