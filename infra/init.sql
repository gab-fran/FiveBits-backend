-- FiveBits: inicializacao completa de um banco PostgreSQL vazio.
-- Gerado por npm run build:init. Edite os arquivos fonte, depois regenere.
-- Compativel com psql e editores SQL (execute o arquivo inteiro).
-- Nao cria o database: conecte-se previamente a um banco vazio.
-- Nao apaga dados nem cria contas/senhas padrao.
-- Se houver erro, a transacao inteira sera revertida.
BEGIN;
SET LOCAL search_path TO public;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- Source: create_tables.sql
-- Baseline for an EMPTY database. Existing databases must use migrations.
-- 2. CRIAÇÃO DAS TABELAS (DDL)
-- ==========================================

-- Tabela Paciente (Sem email/senha, focado apenas em dados pessoais)
CREATE TABLE Paciente (
    id_paciente INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    cpf CHAR(11) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    data_nascimento DATE NOT NULL,
    situacao BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tabela Medico (Sem email/senha, focado apenas em dados profissionais)
CREATE TABLE Medico(
    id_medico INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    crm VARCHAR(13) UNIQUE NOT NULL,
    especialidade VARCHAR(100) NOT NULL,
    valor_consulta DECIMAL(6,2) NOT NULL,
    situacao BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tabela Usuario (Centraliza a autenticação e autorização)
CREATE TABLE Usuario (
    id_usuario INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'MEDICO', 'PACIENTE')),
    id_medico INTEGER,
    id_paciente INTEGER,
    situacao BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_medico) REFERENCES Medico (id_medico),
    FOREIGN KEY (id_paciente) REFERENCES Paciente (id_paciente),
    -- Restrição para garantir que um usuário não seja médico e paciente ao mesmo tempo
    CHECK (
        (role = 'ADMIN' AND id_medico IS NULL AND id_paciente IS NULL) OR
        (role = 'MEDICO' AND id_medico IS NOT NULL AND id_paciente IS NULL) OR
        (role = 'PACIENTE' AND id_paciente IS NOT NULL AND id_medico IS NULL)
    )
);

-- Tabela Consulta
CREATE TABLE Consulta (
    id_consulta INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_paciente INTEGER NOT NULL,
    id_medico INTEGER NOT NULL,
    data_hora TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'Confirmado' CHECK (status IN ('Pendente', 'Confirmado', 'Cancelado', 'Concluido')),
    modalidade VARCHAR(30) DEFAULT 'Pessoalmente' CHECK (modalidade IN ('Pessoalmente', 'Telemedicina')),
    triagem_sintomas VARCHAR(100) NOT NULL,
    situacao BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_paciente) REFERENCES Paciente (id_paciente),
    FOREIGN KEY (id_medico) REFERENCES Medico (id_medico)
);

-- Source: create_view.sql
-- ==========================================
-- CRIAÇÃO DAS VIEWS DO BANCO DE DADOS
-- ==========================================

-- 1. View para Pacientes Ativos
CREATE OR REPLACE VIEW vw_pacientes AS
SELECT
    id_paciente,
    nome,
    cpf,
    telefone,
    data_nascimento,
    situacao
FROM Paciente
WHERE situacao = TRUE;

-- 2. View para Médicos Ativos
CREATE OR REPLACE VIEW vw_medicos AS
SELECT
    id_medico,
    nome,
    crm,
    especialidade,
    valor_consulta,
    situacao
FROM Medico
WHERE situacao = TRUE;

-- 3. View para Detalhes de Consultas Ativas
CREATE OR REPLACE VIEW vw_consultas_detalhes AS SELECT c.*,p.nome paciente_nome,p.cpf paciente_cpf,p.telefone paciente_telefone,
 p.data_nascimento paciente_data_nascimento,p.situacao paciente_situacao,m.nome medico_nome,m.crm medico_crm,
 m.especialidade medico_especialidade,m.valor_consulta medico_valor_consulta,m.situacao medico_situacao
 FROM consulta c JOIN paciente p USING(id_paciente) JOIN medico m USING(id_medico) WHERE c.situacao;

-- 4. View Geral de Usuários (sem a coluna de senha por motivos de segurança)
CREATE OR REPLACE VIEW vw_usuarios AS
SELECT
    u.id_usuario AS id,
    COALESCE(m.nome, p.nome) AS nome,
    u.email,
    u.role,
    u.id_medico,
    u.id_paciente,
    u.situacao
FROM Usuario u
LEFT JOIN Medico m ON u.id_medico = m.id_medico
LEFT JOIN Paciente p ON u.id_paciente = p.id_paciente;

-- 5. View Específica para Autenticação (contém a coluna senha necessária para login)
CREATE OR REPLACE VIEW vw_autenticacao AS
SELECT
    u.id_usuario AS id,
    COALESCE(m.nome, p.nome) AS nome,
    u.email,
    u.senha,
    u.role,
    u.situacao
FROM Usuario u
LEFT JOIN Medico m ON u.id_medico = m.id_medico
LEFT JOIN Paciente p ON u.id_paciente = p.id_paciente;

-- Source: migrations/001_integridade.sql
-- Run with psql -v ON_ERROR_STOP=1. All changes roll back if legacy data is invalid.
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
SELECT pg_advisory_xact_lock(51943001);
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

-- Source: migrations/003_preparar_duracao.sql
SELECT pg_advisory_xact_lock(51943001);
ALTER TABLE consulta ADD COLUMN IF NOT EXISTS duracao_minutos integer;
INSERT INTO schema_migrations(version) VALUES('003_preparar_duracao') ON CONFLICT DO NOTHING;
-- Existing rows deliberately receive no invented duration.
-- Supply the actual durations before running 004_agendamento.sql.

-- Source: migrations/004_agendamento.sql
SELECT pg_advisory_xact_lock(51943001);
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

-- Source: migrations/002_credenciais.sql
-- Execute only after scripts/migrate-passwords.mjs succeeds.
SELECT pg_advisory_xact_lock(51943001);
ALTER TABLE usuario ADD CONSTRAINT usuario_senha_hash CHECK (senha ~ '^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$') NOT VALID;
ALTER TABLE usuario VALIDATE CONSTRAINT usuario_senha_hash;
INSERT INTO schema_migrations(version) VALUES ('002_credenciais');

-- Source: create_procedure.sql
-- Compatibility procedures. Invariants are enforced by the table triggers and constraints.
-- Application registration additionally creates Usuario in the same transaction.
CREATE OR REPLACE PROCEDURE sp_cadastrar_paciente(p_nome varchar(50),p_cpf char(11),p_telefone varchar(20),p_data_nascimento date)
LANGUAGE SQL AS $$ INSERT INTO paciente(nome,cpf,telefone,data_nascimento) VALUES(p_nome,p_cpf,p_telefone,p_data_nascimento); $$;
CREATE OR REPLACE PROCEDURE sp_atualizar_paciente(p_id_paciente integer,p_nome varchar(50),p_cpf varchar(11),p_telefone varchar(20),p_data_nascimento date)
LANGUAGE plpgsql AS $$ BEGIN
 UPDATE paciente SET nome=p_nome,cpf=p_cpf,telefone=p_telefone,data_nascimento=p_data_nascimento WHERE id_paciente=p_id_paciente AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Paciente não encontrado.';END IF;
END $$;
CREATE OR REPLACE PROCEDURE sp_deletar_paciente(p_id integer) LANGUAGE plpgsql AS $$ BEGIN
 UPDATE paciente SET situacao=false WHERE id_paciente=p_id AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Paciente não encontrado.';END IF;
 UPDATE usuario SET situacao=false WHERE id_paciente=p_id;
END $$;
CREATE OR REPLACE PROCEDURE sp_cadastrar_medico(p_nome varchar(50),p_crm varchar(13),p_especialidade varchar(100),p_valor_consulta decimal(6,2))
LANGUAGE SQL AS $$ INSERT INTO medico(nome,crm,especialidade,valor_consulta) VALUES(p_nome,p_crm,p_especialidade,p_valor_consulta); $$;
CREATE OR REPLACE PROCEDURE sp_atualizar_medico(p_id_medico integer,p_nome varchar(50),p_crm varchar(13),p_especialidade varchar(100),p_valor_consulta decimal(6,2))
LANGUAGE plpgsql AS $$ BEGIN
 UPDATE medico SET nome=p_nome,crm=p_crm,especialidade=p_especialidade,valor_consulta=p_valor_consulta WHERE id_medico=p_id_medico AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Médico não encontrado.';END IF;
END $$;
CREATE OR REPLACE PROCEDURE sp_deletar_medico(p_id_medico integer) LANGUAGE plpgsql AS $$ BEGIN
 UPDATE medico SET situacao=false WHERE id_medico=p_id_medico AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Médico não encontrado.';END IF;
 UPDATE usuario SET situacao=false WHERE id_medico=p_id_medico;
END $$;
DROP PROCEDURE IF EXISTS sp_agendar_consulta(integer,integer,timestamp,varchar,varchar,varchar);
DROP PROCEDURE IF EXISTS sp_atualizar_consulta(integer,integer,varchar,timestamp,varchar,varchar);
CREATE OR REPLACE PROCEDURE sp_agendar_consulta(p_id_paciente integer,p_id_medico integer,p_data_hora timestamptz,p_modalidade varchar(30),p_triagem_sintomas varchar(100),p_duracao_minutos integer,p_status varchar(20) DEFAULT 'Pendente')
LANGUAGE SQL AS $$ INSERT INTO consulta(id_paciente,id_medico,data_hora,modalidade,triagem_sintomas,duracao_minutos,status) VALUES(p_id_paciente,p_id_medico,p_data_hora,p_modalidade,p_triagem_sintomas,p_duracao_minutos,p_status); $$;
CREATE OR REPLACE PROCEDURE sp_atualizar_consulta(p_id_consulta integer,p_id_medico integer,p_status varchar(20),p_data_hora timestamptz,p_modalidade varchar(30),p_triagem_sintomas varchar(100),p_duracao_minutos integer)
LANGUAGE plpgsql AS $$ BEGIN
 UPDATE consulta SET id_medico=p_id_medico,status=p_status,data_hora=p_data_hora,modalidade=p_modalidade,triagem_sintomas=p_triagem_sintomas,duracao_minutos=p_duracao_minutos WHERE id_consulta=p_id_consulta AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Consulta não encontrada.';END IF;
END $$;
CREATE OR REPLACE PROCEDURE sp_cancelar_consulta(p_id_consulta integer) LANGUAGE plpgsql AS $$ BEGIN
 UPDATE consulta SET status='Cancelado',situacao=false WHERE id_consulta=p_id_consulta AND situacao;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1007',MESSAGE='Consulta não encontrada.';END IF;
END $$;

COMMIT;
