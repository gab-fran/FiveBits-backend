// Disposable integration server for the sibling frontend's Playwright suite.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const name = `fivebits_e2e_${process.pid}_${randomBytes(3).toString('hex')}`;
const config = {
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USER ?? 'agent',
    password: process.env.TEST_DB_PASSWORD,
};
const admin = new pg.Client({
    ...config,
    database: process.env.TEST_DB_ADMIN ?? 'postgres',
});
await admin.connect();
await admin.query(`CREATE DATABASE ${name}`);
let http, pool;
async function cleanup() {
    if (http) await new Promise((resolve) => http.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
}
try {
    const psql =
        process.env.PSQL_BIN ??
        '/workspace/.setup/pg/usr/lib/postgresql/17/bin/psql';
    for (const file of ['infra/init.sql'])
        execFileSync(
            psql,
            [
                '-h',
                config.host,
                '-p',
                String(config.port),
                '-U',
                config.user,
                '-d',
                name,
                '-v',
                'ON_ERROR_STOP=1',
                '-f',
                file,
            ],
            {
                env: { ...process.env, PGPASSWORD: config.password ?? '' },
                stdio: 'pipe',
            },
        );
    process.env.DB_HOST = config.host;
    process.env.DB_PORT = String(config.port);
    process.env.DB_USER = config.user;
    process.env.DB_NAME = name;
    if (config.password) process.env.DB_PASSWORD = config.password;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.CORS_ORIGINS = 'http://127.0.0.1:5174';
    ({ pool } = await import('../dist/model/DatabaseModel.js'));
    const { hashPassword } = await import('../dist/security/password.js');
    await pool.query(
        "INSERT INTO usuario(email,senha,role) VALUES('admin@e2e.test',$1,'ADMIN')",
        [await hashPassword('e2e-only-password')],
    );
    const { server } = await import('../dist/server.js');
    http = server.listen(3334, '127.0.0.1', () => console.log('E2E API ready'));
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT'])
        process.once(signal, () => {
            if (!stopping) {
                stopping = true;
                void cleanup().then(() => process.exit(0));
            }
        });
} catch (error) {
    await cleanup();
    throw error;
}
