-- Execute only after scripts/migrate-passwords.mjs succeeds.
BEGIN;
SELECT pg_advisory_xact_lock(51943001);
SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='002_credenciais') AS already_applied \gset
\if :already_applied
\echo '002_credenciais already applied'
\else
ALTER TABLE usuario ADD CONSTRAINT usuario_senha_hash CHECK (senha ~ '^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$') NOT VALID;
ALTER TABLE usuario VALIDATE CONSTRAINT usuario_senha_hash;
INSERT INTO schema_migrations(version) VALUES ('002_credenciais');
\endif
COMMIT;
