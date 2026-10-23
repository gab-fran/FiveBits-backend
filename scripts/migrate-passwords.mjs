import { pool, transaction } from '../dist/model/DatabaseModel.js';
import { hashPassword, isPasswordHash } from '../dist/security/password.js';
// Maintenance operation: no passwords or hashes are logged. Back up the database first.
try {
    const count = await transaction(async (client) => {
        await client.query('LOCK TABLE usuario IN EXCLUSIVE MODE');
        const { rows } = await client.query(
            'SELECT id_usuario, senha FROM usuario FOR UPDATE',
        );
        let migrated = 0;
        for (const row of rows) {
            if (isPasswordHash(row.senha)) continue;
            if (
                typeof row.senha !== 'string' ||
                !row.senha.trim() ||
                row.senha.length > 128
            )
                throw new Error(
                    'Existem credenciais incompatíveis; revise antes da migração.',
                );
            await client.query(
                'UPDATE usuario SET senha=$1 WHERE id_usuario=$2',
                [await hashPassword(row.senha), row.id_usuario],
            );
            migrated++;
        }
        return migrated;
    });
    console.log(`Credenciais migradas: ${count}.`);
} catch {
    console.error(
        'Migração interrompida; transação revertida. Verifique a disponibilidade e os dados do banco.',
    );
    process.exitCode = 1;
} finally {
    await pool.end();
}
