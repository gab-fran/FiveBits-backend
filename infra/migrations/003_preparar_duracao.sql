BEGIN;
SELECT pg_advisory_xact_lock(51943001);
ALTER TABLE consulta ADD COLUMN IF NOT EXISTS duracao_minutos integer;
INSERT INTO schema_migrations(version) VALUES('003_preparar_duracao') ON CONFLICT DO NOTHING;
COMMIT;
-- Existing rows deliberately receive no invented duration.
-- Supply the actual durations before running 004_agendamento.sql.
