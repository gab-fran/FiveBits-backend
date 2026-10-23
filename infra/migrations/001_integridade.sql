-- Run with psql -v ON_ERROR_STOP=1. All changes roll back if legacy data is invalid.
BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
SELECT pg_advisory_xact_lock(51943001);
SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='001_integridade') AS already_applied \gset
\if :already_applied
\echo '001_integridade already applied'
\else
CREATE FUNCTION cpf_valido(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE size integer; idx integer; total integer; digit integer;
BEGIN
 IF value !~ '^[0-9]{11}$' OR value ~ '^([0-9])\1{10}$' THEN RETURN false; END IF;
 FOR size IN 9..10 LOOP
  total := 0;
  FOR idx IN 1..size LOOP total := total + substr(value,idx,1)::integer*(size+2-idx); END LOOP;
  digit := ((total*10)%11)%10;
  IF digit <> substr(value,size+1,1)::integer THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

ALTER TABLE paciente ADD CONSTRAINT paciente_nome_valido CHECK (length(btrim(nome)) >= 3) NOT VALID;
ALTER TABLE paciente ADD CONSTRAINT paciente_cpf_valido CHECK (cpf_valido(cpf::text)) NOT VALID;
ALTER TABLE paciente ADD CONSTRAINT paciente_telefone_valido CHECK (telefone IS NULL OR telefone = '' OR telefone ~ '^[0-9]{10,11}$') NOT VALID;
ALTER TABLE medico ADD CONSTRAINT medico_nome_valido CHECK (length(btrim(nome)) >= 3) NOT VALID;
ALTER TABLE medico ADD CONSTRAINT medico_especialidade_valida CHECK (length(btrim(especialidade)) > 0) NOT VALID;
ALTER TABLE medico ADD CONSTRAINT medico_valor_valido CHECK (valor_consulta >= 0 AND valor_consulta <> 'NaN'::numeric) NOT VALID;
ALTER TABLE consulta ADD CONSTRAINT consulta_triagem_valida CHECK (length(btrim(triagem_sintomas)) > 0) NOT VALID;
ALTER TABLE usuario ADD CONSTRAINT usuario_email_valido CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') NOT VALID;

-- Validate before marking this migration applied. No rows are deleted or repaired automatically.
ALTER TABLE paciente VALIDATE CONSTRAINT paciente_nome_valido;
ALTER TABLE paciente VALIDATE CONSTRAINT paciente_cpf_valido;
ALTER TABLE paciente VALIDATE CONSTRAINT paciente_telefone_valido;
ALTER TABLE medico VALIDATE CONSTRAINT medico_nome_valido;
ALTER TABLE medico VALIDATE CONSTRAINT medico_especialidade_valida;
ALTER TABLE medico VALIDATE CONSTRAINT medico_valor_valido;
ALTER TABLE consulta VALIDATE CONSTRAINT consulta_triagem_valida;
ALTER TABLE usuario VALIDATE CONSTRAINT usuario_email_valido;
ALTER TABLE consulta ALTER COLUMN status SET NOT NULL;
ALTER TABLE consulta ALTER COLUMN modalidade SET NOT NULL;
CREATE UNIQUE INDEX usuario_email_canonical_key ON usuario(lower(email));
CREATE UNIQUE INDEX consulta_horario_unico ON consulta(id_medico, data_hora) WHERE situacao AND status <> 'Cancelado';
CREATE INDEX consulta_paciente_idx ON consulta(id_paciente);
CREATE INDEX usuario_paciente_idx ON usuario(id_paciente);
CREATE INDEX usuario_medico_idx ON usuario(id_medico);
INSERT INTO schema_migrations(version) VALUES ('001_integridade');
\endif
COMMIT;
