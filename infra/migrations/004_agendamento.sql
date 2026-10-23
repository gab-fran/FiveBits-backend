BEGIN;
SELECT pg_advisory_xact_lock(51943001);
SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_agendamento') AS already_applied \gset
\if :already_applied
\echo '004_agendamento already applied'
\else
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM consulta WHERE duracao_minutos IS NULL OR duracao_minutos<=0) THEN
  RAISE EXCEPTION 'Informe a duração real dos agendamentos existentes antes de continuar.';
 END IF;
END $$;
DROP VIEW IF EXISTS vw_consultas_detalhes;
-- Existing TIMESTAMP values represent clinic wall time, confirmed as Brasilia.
ALTER TABLE consulta ALTER COLUMN data_hora TYPE timestamptz USING data_hora AT TIME ZONE 'America/Sao_Paulo';
ALTER TABLE consulta ALTER COLUMN duracao_minutos SET NOT NULL;
ALTER TABLE consulta ADD CONSTRAINT consulta_duracao_valida CHECK(duracao_minutos>0);
ALTER TABLE medico ADD CONSTRAINT medico_crm_valido CHECK(crm ~ '^[0-9]{1,6}(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$');
CREATE INDEX consulta_medico_periodo_idx ON consulta(id_medico,data_hora) WHERE situacao;

CREATE FUNCTION validar_nascimento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.data_nascimento > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='paciente_nascimento_valido',MESSAGE='Data de nascimento futura.';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER paciente_nascimento BEFORE INSERT OR UPDATE OF data_nascimento ON paciente FOR EACH ROW EXECUTE FUNCTION validar_nascimento();

CREATE FUNCTION proteger_desativacao() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked boolean;
BEGIN
 IF OLD.situacao AND NOT NEW.situacao THEN
  IF TG_TABLE_NAME='paciente' THEN
   SELECT EXISTS(SELECT 1 FROM consulta WHERE id_paciente=OLD.id_paciente AND situacao AND status IN('Pendente','Confirmado') AND data_hora>statement_timestamp()) INTO linked;
  ELSE
   SELECT EXISTS(SELECT 1 FROM consulta WHERE id_medico=OLD.id_medico AND situacao AND status IN('Pendente','Confirmado') AND data_hora>statement_timestamp()) INTO linked;
  END IF;
  IF linked THEN RAISE EXCEPTION USING ERRCODE='P1004',MESSAGE='Cancele as consultas futuras antes de desativar o cadastro.';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER paciente_desativacao BEFORE UPDATE OF situacao ON paciente FOR EACH ROW EXECUTE FUNCTION proteger_desativacao();
CREATE TRIGGER medico_desativacao BEFORE UPDATE OF situacao ON medico FOR EACH ROW EXECUTE FUNCTION proteger_desativacao();

CREATE FUNCTION validar_agendamento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE specialty text; active boolean; total integer; contact_phone text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id_paciente<>OLD.id_paciente THEN RAISE EXCEPTION USING ERRCODE='P1005',MESSAGE='Não é permitido trocar o paciente.';END IF;
  IF OLD.status IN('Concluido','Cancelado') THEN RAISE EXCEPTION USING ERRCODE='P1005',MESSAGE='Consulta encerrada não pode ser alterada.';END IF;
  IF NEW.status='Cancelado' OR NOT NEW.situacao THEN
   IF OLD.data_hora<statement_timestamp()+interval '24 hours' THEN RAISE EXCEPTION USING ERRCODE='P1003',MESSAGE='Cancelamentos online exigem 24 horas de antecedência. Entre em contato com a clínica.';END IF;
   NEW.status:='Cancelado';NEW.situacao:=false;RETURN NEW;
  END IF;
 ELSIF NEW.status NOT IN('Pendente','Confirmado') OR NOT NEW.situacao THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Status inicial inválido.';
 END IF;
 IF TG_OP='INSERT' OR NEW.data_hora IS DISTINCT FROM OLD.data_hora THEN
  IF NEW.data_hora<=statement_timestamp() THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Agendamento deve ser futuro.';END IF;
 END IF;
 -- Acquire parent rows in a fixed order. These locks serialize concurrent schedules,
 -- specialization limits and deactivation. Queries after lock acquisition see committed rows.
 SELECT situacao,telefone INTO active,contact_phone FROM paciente WHERE id_paciente=NEW.id_paciente FOR UPDATE;
 IF active IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='P1006',MESSAGE='Paciente inexistente ou inativo.';END IF;
 IF COALESCE(btrim(contact_phone),'')='' THEN RAISE EXCEPTION USING ERRCODE='P1008',MESSAGE='Complete o telefone do paciente antes de agendar.';END IF;
 SELECT situacao,lower(btrim(especialidade)) INTO active,specialty FROM medico WHERE id_medico=NEW.id_medico FOR UPDATE;
 IF active IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='P1006',MESSAGE='Médico inexistente ou inativo.';END IF;
 IF EXISTS(SELECT 1 FROM consulta c WHERE c.id_medico=NEW.id_medico AND c.id_consulta<>NEW.id_consulta AND c.situacao AND c.status<>'Cancelado'
   AND tstzrange(c.data_hora,c.data_hora+c.duracao_minutos*interval '1 minute','[)') && tstzrange(NEW.data_hora,NEW.data_hora+NEW.duracao_minutos*interval '1 minute','[)')) THEN
  RAISE EXCEPTION USING ERRCODE='P1001',MESSAGE='O período informado conflita com outra consulta do médico.';
 END IF;
 IF NEW.status IN('Pendente','Confirmado') AND NEW.data_hora>statement_timestamp() THEN
  SELECT count(*) INTO total FROM consulta c JOIN medico m USING(id_medico)
   WHERE c.id_paciente=NEW.id_paciente AND c.id_consulta<>NEW.id_consulta AND c.situacao AND c.status IN('Pendente','Confirmado')
    AND c.data_hora>statement_timestamp() AND lower(btrim(m.especialidade))=specialty;
  IF total>=2 THEN RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Limite de duas consultas futuras por especialidade.';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER consulta_validacao BEFORE INSERT OR UPDATE ON consulta FOR EACH ROW EXECUTE FUNCTION validar_agendamento();

CREATE FUNCTION proteger_especialidade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF lower(btrim(NEW.especialidade)) IS DISTINCT FROM lower(btrim(OLD.especialidade)) THEN
  PERFORM 1 FROM paciente WHERE id_paciente IN (SELECT id_paciente FROM consulta WHERE id_medico=OLD.id_medico AND situacao AND status IN('Pendente','Confirmado') AND data_hora>statement_timestamp()) ORDER BY id_paciente FOR UPDATE;
  IF EXISTS(SELECT 1 FROM consulta c JOIN medico m USING(id_medico) WHERE c.situacao AND c.status IN('Pendente','Confirmado') AND c.data_hora>statement_timestamp()
   GROUP BY c.id_paciente,CASE WHEN m.id_medico=OLD.id_medico THEN lower(btrim(NEW.especialidade)) ELSE lower(btrim(m.especialidade)) END HAVING count(*)>2) THEN
   RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='A alteração excede o limite de consultas por especialidade.';
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER medico_especialidade BEFORE UPDATE OF especialidade ON medico FOR EACH ROW EXECUTE FUNCTION proteger_especialidade();

CREATE VIEW vw_consultas_detalhes AS SELECT c.*,p.nome paciente_nome,p.cpf paciente_cpf,p.telefone paciente_telefone,
 p.data_nascimento paciente_data_nascimento,p.situacao paciente_situacao,m.nome medico_nome,m.crm medico_crm,
 m.especialidade medico_especialidade,m.valor_consulta medico_valor_consulta,m.situacao medico_situacao
 FROM consulta c JOIN paciente p USING(id_paciente) JOIN medico m USING(id_medico) WHERE c.situacao;
-- Validate pre-existing overlaps and limits without silently repairing history.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM consulta a JOIN consulta b ON a.id_medico=b.id_medico AND a.id_consulta<b.id_consulta
 WHERE a.situacao AND b.situacao AND a.status<>'Cancelado' AND b.status<>'Cancelado'
 AND tstzrange(a.data_hora,a.data_hora+a.duracao_minutos*interval '1 minute','[)') && tstzrange(b.data_hora,b.data_hora+b.duracao_minutos*interval '1 minute','[)')) THEN
  RAISE EXCEPTION 'Existem consultas sobrepostas; revise os dados antes da migração.';
 END IF;
 IF EXISTS(SELECT 1 FROM consulta c JOIN medico m USING(id_medico) WHERE c.situacao AND c.status IN('Pendente','Confirmado') AND c.data_hora>now()
 GROUP BY c.id_paciente,lower(btrim(m.especialidade)) HAVING count(*)>2) THEN RAISE EXCEPTION 'Existem pacientes acima do limite de consultas por especialidade.';END IF;
 IF EXISTS(SELECT 1 FROM paciente WHERE data_nascimento>(now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Existem nascimentos futuros.';END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('004_agendamento');
\endif
COMMIT;
