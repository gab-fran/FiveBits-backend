import pg from 'pg';
import 'dotenv/config';

// PostgreSQL DATE is a civil date, not an instant in the host timezone.
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT ?? 5432),
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
});
pool.on('error', () =>
    console.error('Conexão ociosa com o banco indisponível.'),
);

export async function transaction<T>(
    operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export class DatabaseModel {
    get pool() {
        return pool;
    }
    async testeConexao() {
        await pool.query('SELECT 1');
        return true;
    }
}
