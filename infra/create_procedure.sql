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
