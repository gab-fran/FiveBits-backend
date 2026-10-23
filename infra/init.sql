-- Initialize an EMPTY database only. No DROP statements and no default credentials.
\set ON_ERROR_STOP on
\ir create_tables.sql
\ir create_view.sql
\ir migrations/001_integridade.sql
\ir migrations/003_preparar_duracao.sql
\ir migrations/004_agendamento.sql
\ir migrations/002_credenciais.sql
\ir create_procedure.sql
