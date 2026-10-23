import { readFile, writeFile } from 'node:fs/promises';

// Keep the standalone initializer synchronized with the versioned schema sources.
const sources = [
  'create_tables.sql',
  'create_view.sql',
  'migrations/001_integridade.sql',
  'migrations/003_preparar_duracao.sql',
  'migrations/004_agendamento.sql',
  'migrations/002_credenciais.sql',
  'create_procedure.sql',
];
const sections = [];
for (const source of sources) {
  const sql = await readFile(new URL(`../infra/${source}`, import.meta.url), 'utf8');
  const lines = sql.split('\n').map(line => line.trimEnd()).filter(line => {
    // A fresh database always executes the not-yet-applied migration branch.
    if (/^(BEGIN;|COMMIT;)$/.test(line)) return false;
    if (/^SELECT EXISTS\(SELECT 1 FROM schema_migrations WHERE version='[^']+'\) AS already_applied \\gset$/.test(line)) return false;
    if (/^\\(if :already_applied|echo '[^']+ already applied'|else|endif)$/.test(line)) return false;
    return true;
  });
  if (lines.some(line => /^\s*\\/.test(line) || /\\gset\s*$/.test(line))) {
    throw new Error(`Unsupported psql command in ${source}; review initializer generation.`);
  }
  sections.push(`-- Source: ${source}\n${lines.join('\n').trim()}`);
}
const output = `-- FiveBits: inicializacao completa de um banco PostgreSQL vazio.
-- Gerado por npm run build:init. Edite os arquivos fonte, depois regenere.
-- Compativel com psql e editores SQL (execute o arquivo inteiro).
-- Nao cria o database: conecte-se previamente a um banco vazio.
-- Nao apaga dados nem cria contas/senhas padrao.
-- Se houver erro, a transacao inteira sera revertida.
BEGIN;
SET LOCAL search_path TO public;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

${sections.join('\n\n')}

COMMIT;
`;
await writeFile(new URL('../infra/init.sql', import.meta.url), output);
console.log('infra/init.sql generated.');
