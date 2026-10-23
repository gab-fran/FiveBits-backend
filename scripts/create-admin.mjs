import { pool } from '../dist/model/DatabaseModel.js';
import { parseLogin } from '../dist/validation/inputs.js';
import { hashPassword } from '../dist/security/password.js';
try {
    const data = parseLogin({
        email: process.env.ADMIN_EMAIL,
        senha: process.env.ADMIN_PASSWORD,
    });
    await pool.query(
        "INSERT INTO usuario(email,senha,role) VALUES($1,$2,'ADMIN')",
        [data.email, await hashPassword(data.senha)],
    );
    console.log('Administrador criado.');
} catch {
    console.error(
        'Administrador não criado. Verifique as variáveis, a conexão e a unicidade do e-mail.',
    );
    process.exitCode = 1;
} finally {
    await pool.end();
}
