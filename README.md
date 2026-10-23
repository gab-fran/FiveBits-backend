# MedFlow backend — refactor-codex

Base: branch `refactor`, commit `960afc13d99094ed8259c9107eb7aaf85d9fe496`.
Node 24, npm e PostgreSQL 17. A API mantém Express/TypeScript e PostgreSQL; não foi adicionado ORM ou dependência de produção.

## Instalar e executar

```sh
npm ci
npm run build
# Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME no ambiente ou .env ignorado.
# Configure JWT_SECRET com pelo menos 32 bytes aleatórios; não use uma senha humana.
# Configure CORS_ORIGINS com as origens do frontend, separadas por vírgula.
npm start
```

`PORT` tem padrão 3333. A inicialização exige conexão com o banco, JWT_SECRET e as quatro migrações aplicadas. Não há segredo JWT ou conta administrativa padrão. Configure os valores reais em armazenamento seguro, não em commits ou histórico de comandos.

Para banco **vazio**, execute `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/init.sql` com a autenticação PostgreSQL configurada. O script não apaga tabelas e falha caso elas já existam. Crie o primeiro administrador com `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos no ambiente e `npm run create-admin`; o script não imprime as credenciais. Remova essas variáveis após o uso.

## Migrar um banco existente

Faça backup e execute em janela de manutenção, após verificar os dados. Não execute `init.sql` em banco existente.

1. `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/migrations/001_integridade.sql`
2. `npm run migrate-passwords` usando as variáveis DB_* desse banco.
3. `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/migrations/002_credenciais.sql`
4. `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/migrations/003_preparar_duracao.sql`
5. Preencha `consulta.duracao_minutos` com a duração **real** de cada consulta antiga. Não há valor presumido ou backfill automático.
6. `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/migrations/004_agendamento.sql`
7. `psql -v ON_ERROR_STOP=1 -d <banco> -f infra/create_procedure.sql`

Cada migração registra sua versão; reaplicações preservam o estado. Dados inválidos interrompem a migração em transação: não há exclusão ou correção silenciosa. Verifique CPF, formato canônico do telefone/CRM/e-mail, duplicidades, limites, datas e sobreposições antes da liberação. Os dados demonstrativos antigos continham CPFs inválidos e senhas em texto puro; não são reutilizados automaticamente.

A migração de horários interpreta o TIMESTAMP legado como hora local de `America/Sao_Paulo`, conforme a definição da clínica, e passa a usar TIMESTAMPTZ. Confirme essa interpretação também para eventuais registros importados. A duração é inteira, positiva, em minutos; períodos adjacentes são permitidos. As procedures de consulta passam a receber duração e timestamptz; consumidores SQL antigos precisam atualizar sua chamada.

O hash de senha é irreversível. O script de conversão pode ser repetido e não reprocessa hashes existentes. Não volte à versão antiga da aplicação após essa conversão; uma reversão exige restauração coordenada do backup protegido. As migrations bloqueiam tabelas/linhas durante alterações e podem exigir revisão manual dos dados.

## Contratos e responsabilidades

Controllers validam o contrato HTTP; services coordenam operações e transações; repositories usam parâmetros SQL e mapeiam respostas. Um único pool é compartilhado. Constraints e triggers garantem integridade mesmo em escritas SQL diretas. Models não abrem conexões.

- Cadastro público de paciente: `POST /api/pacientes`, campos `nome`, `cpf`, `telefone` opcional, `dataNascimento` (`YYYY-MM-DD`), `email`, `senha`.
- Cadastro de médico: `POST /api/medicos`, exclusivo ADMIN, campos `nome`, `crm` (número/UF), `especialidade`, `valorConsulta`, `email`, `senha`. Valores gratuitos são aceitos; precisão máxima é a do DECIMAL(6,2).
- PUT paciente/médico recebe somente os dados cadastrais, sem credenciais, IDs redundantes, role ou situacao. CPF/CRM/e-mail são únicos; CPF usa dígitos verificadores.
- POST/PUT consulta recebe `idPaciente`, `idMedico`, `dataHora` ISO com offset, `duracaoMinutos`, `status`, `modalidade`, `triagemSintomas` (até 100 caracteres). Respostas mantêm paciente/médico aninhados, com datas em strings e valor monetário numérico.
- `x-access-token` transporta o JWT. Assinatura HS256, emissor, audiência, expiração e sujeito são validados; a conta e seu vínculo ativo são consultados em cada requisição. Senhas usam scrypt com salt individual e comparação em tempo constante.
- Erros: `{ codigo, mensagem, erros?: [{ campo, mensagem }] }`. 400: dados inválidos; 401: autenticação; 403: autorização; 404: inexistência; 409: duplicidade/regra/conflito concorrente; 413: corpo excessivo; 500: falha interna sem dados sensíveis.

| Perfil | Permissões |
|---|---|
| ADMIN | Gerencia cadastros e consultas. |
| PACIENTE | Cadastro próprio, leitura/edição de seus dados e gestão de suas consultas; consulta diretório de médicos para agendar; não conclui atendimentos. |
| MEDICO | Acessa somente seus atendimentos e seu cadastro profissional; não cadastra médicos/pacientes nem altera outros atendimentos. |

O telefone continua opcional no cadastro, mas é necessário para agendar (RN001); a confirmação externa fica para v2. O paciente da consulta é imutável. Consultas concluídas/canceladas não são editáveis. Desativação exige ausência de consultas futuras ativas; histórico não depende do cadastro relacionado continuar ativo. Cancelamento online exige pelo menos 24 horas, sem exceção administrativa automática (o documento não definiu uma). O limite de duas consultas futuras usa status Pendente/Confirmado, cadastro ativo e especialidade normalizada por espaços externos/caixa. Especialidades continuam sendo texto; um catálogo é trabalho futuro.

## Testes

```sh
npm test
```

Testes unitários, API, concorrência SQL, constraints, migração e limite exato de 24 horas. O runner cria e remove somente bancos com prefixo `fivebits_test_`, não usa o banco da aplicação. Configure `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_ADMIN` e `PSQL_BIN` se necessário; o usuário de teste precisa de CREATEDB. No ambiente preparado, PostgreSQL local usa `agent` e o psql está em `/workspace/.setup/pg/usr/lib/postgresql/17/bin/psql`. Em outra máquina defina `PSQL_BIN=psql`.

O frontend irmão tem testes Playwright que iniciam `scripts/e2e-server.mjs`, com banco descartável `fivebits_e2e_*` e credenciais exclusivamente sintéticas.

## Limites desta entrega

Agenda de disponibilidade/feriados, financeiro, convênios, e-mail/SMS e PDF ficam para v2. Confirmação de telefone/e-mail e cancelamento automático em 12 horas dependem desses fluxos e não são simulados. A senha tem hash; CPF, telefone e sintomas não são criptografados por campo nesta implementação. Proteção de transporte, backups, armazenamento e gestão de chaves devem ser configuradas na infraestrutura. O JWT continua em localStorage por compatibilidade; o frontend não registra o token e mantém o escape de texto do React.

Publicação da branch local, após revisão: `git push -u origin refactor-codex`.
