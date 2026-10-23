import { pool } from './model/DatabaseModel.js';
import { server } from './server.js';
import { jwtSecret } from './config/security.js';
try {
    jwtSecret();
    await pool.query('SELECT 1');
    const ready = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version IN ('001_integridade','002_credenciais','003_preparar_duracao','004_agendamento')",
    );
    if (ready.rowCount !== 4) throw new Error('Migrações pendentes.');
    const port = Number(process.env.PORT ?? 3333);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Porta inválida.');
    const http = server.listen(port, () =>
        console.info(`Servidor iniciado na porta ${port}.`),
    );
    http.on('error', () => {
        console.error('Não foi possível iniciar o servidor HTTP.');
        void pool.end();
        process.exitCode = 1;
    });
    const stop = () =>
        http.close(() => {
            void pool.end();
        });
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
} catch {
    console.error(
        'Falha na inicialização. Verifique o banco, PORT e JWT_SECRET.',
    );
    await pool.end();
    process.exitCode = 1;
}
