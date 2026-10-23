import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
const dbName = `fivebits_test_${process.pid}_${randomBytes(3).toString('hex')}`;
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
let db, http, base, pool, hashPassword, adminToken, patientToken, doctorToken;
let patientId, otherPatient, doctorId, otherDoctor;
const password = 'integration test password';
const psql =
    process.env.PSQL_BIN ??
    '/workspace/.setup/pg/usr/lib/postgresql/17/bin/psql';
function sqlFile(file) {
    return execFileSync(
        psql,
        [
            '-h',
            config.host,
            '-p',
            String(config.port),
            '-U',
            config.user,
            '-d',
            dbName,
            '-v',
            'ON_ERROR_STOP=1',
            '-f',
            file,
        ],
        {
            env: { ...process.env, PGPASSWORD: config.password ?? '' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
}
function cpf(prefix) {
    let s = String(prefix).padStart(9, '0');
    for (let size = 9; size <= 10; size++) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += Number(s[i]) * (size + 1 - i);
        s += String(((sum * 10) % 11) % 10);
    }
    return s;
}
async function request(path, { token, body, method = 'GET' } = {}) {
    const response = await fetch(base + path, {
        method,
        headers: {
            ...(token ? { 'x-access-token': token } : {}),
            ...(body !== undefined
                ? { 'Content-Type': 'application/json' }
                : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
}
async function login(email) {
    const result = await request('/api/login', {
        method: 'POST',
        body: { email, senha: password },
    });
    assert.equal(result.status, 200);
    return result.body.token;
}
let offset = 0;
function appointment(overrides = {}) {
    return {
        idPaciente: patientId,
        idMedico: doctorId,
        dataHora: new Date(
            Date.now() + (7 + offset++) * 86400000,
        ).toISOString(),
        duracaoMinutos: 30,
        status: 'Pendente',
        modalidade: 'Pessoalmente',
        triagemSintomas: 'Dor de cabeça',
        ...overrides,
    };
}
async function clearAppointments() {
    await db.query('TRUNCATE consulta RESTART IDENTITY');
}
before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    db = new pg.Client({ ...config, database: dbName });
    await db.connect();
    sqlFile('infra/create_tables.sql');
    sqlFile('infra/migrations/001_integridade.sql');
    sqlFile('infra/migrations/003_preparar_duracao.sql');
    sqlFile('infra/migrations/004_agendamento.sql');
    // Reapplying migrations must preserve the schema and data.
    sqlFile('infra/migrations/001_integridade.sql');
    sqlFile('infra/migrations/004_agendamento.sql');
    process.env.DB_HOST = config.host;
    process.env.DB_PORT = String(config.port);
    process.env.DB_USER = config.user;
    process.env.DB_NAME = dbName;
    if (config.password) process.env.DB_PASSWORD = config.password;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    ({ pool } = await import('../dist/model/DatabaseModel.js'));
    ({ hashPassword } = await import('../dist/security/password.js'));
    const hash = await hashPassword(password);
    for (let i = 0; i < 3; i++) {
        await db.query(
            'INSERT INTO paciente(nome,cpf,telefone,data_nascimento) VALUES($1,$2,$3,$4)',
            ['Paciente ' + i, cpf(529982240 + i), '11999991234', '1990-01-01'],
        );
        await db.query(
            'INSERT INTO medico(nome,crm,especialidade,valor_consulta) VALUES($1,$2,$3,$4)',
            ['Médico ' + i, 10000 + i + 'SP', 'Clínica', 0],
        );
    }
    patientId = 1;
    otherPatient = 2;
    doctorId = 1;
    otherDoctor = 2;
    await db.query(
        "INSERT INTO usuario(email,senha,role) VALUES('admin@example.test',$1,'ADMIN')",
        [hash],
    );
    await db.query(
        "INSERT INTO usuario(email,senha,role,id_paciente) VALUES('patient@example.test',$1,'PACIENTE',1)",
        [hash],
    );
    await db.query(
        "INSERT INTO usuario(email,senha,role,id_medico) VALUES('doctor@example.test',$1,'MEDICO',1)",
        [hash],
    );
    sqlFile('infra/migrations/002_credenciais.sql');
    const { server } = await import('../dist/server.js');
    http = server.listen(0, '127.0.0.1');
    await new Promise((resolve) => http.once('listening', resolve));
    base = `http://127.0.0.1:${http.address().port}`;
    adminToken = await login('admin@example.test');
    patientToken = await login('patient@example.test');
    doctorToken = await login('doctor@example.test');
});
after(async () => {
    if (http) await new Promise((resolve) => http.close(resolve));
    if (pool) await pool.end();
    if (db) await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
});
test('autenticação e payloads inválidos retornam erros padronizados', async () => {
    assert.equal((await request('/api/pacientes')).status, 401);
    for (const body of [
        null,
        [],
        { email: {}, senha: [] },
        { email: 'admin@example.test', senha: 'wrong' },
    ]) {
        const result = await request('/api/login', { method: 'POST', body });
        assert.ok([400, 401].includes(result.status));
        assert.equal(typeof result.body.codigo, 'string');
    }
    const result = await request('/api/pacientes/1abc', { token: adminToken });
    assert.equal(result.status, 400);
    assert.ok(result.body.erros.length);
    assert.equal(
        (await request('/api/pacientes/999999', { token: adminToken })).status,
        404,
    );
});
test('cadastro público cria conta com hash e duplicidade reverte toda a transação', async () => {
    const body = {
        nome: 'Nova Paciente',
        cpf: cpf(123456780),
        telefone: '11999991234',
        dataNascimento: '1990-01-01',
        email: 'new@example.test',
        senha: password,
    };
    const created = await request('/api/pacientes', { method: 'POST', body });
    assert.equal(created.status, 201);
    const row = (
        await db.query(
            "SELECT senha FROM usuario WHERE email='new@example.test'",
        )
    ).rows[0];
    assert.match(row.senha, /^scrypt\$/);
    assert.notEqual(row.senha, password);
    assert.ok(await login(body.email));
    const duplicate = await request('/api/pacientes', {
        method: 'POST',
        body: { ...body, cpf: cpf(123456781) },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
        (
            await db.query('SELECT 1 FROM paciente WHERE cpf=$1', [
                cpf(123456781),
            ])
        ).rowCount,
        0,
    );
    const invalid = await request('/api/pacientes', {
        method: 'POST',
        body: { ...body, cpf: '11111111111', role: 'ADMIN' },
    });
    assert.equal(invalid.status, 400);
});
test('perfis e propriedade impedem acesso horizontal e criação indevida', async () => {
    assert.equal(
        (
            await request('/api/medicos', {
                method: 'POST',
                token: patientToken,
                body: {},
            })
        ).status,
        403,
    );
    assert.equal(
        (await request('/api/pacientes', { token: doctorToken })).status,
        403,
    );
    assert.equal(
        (await request('/api/pacientes/2', { token: patientToken })).status,
        403,
    );
    const patients = await request('/api/pacientes', { token: patientToken });
    assert.equal(patients.body.length, 1);
    assert.equal(patients.body[0].idPaciente, patientId);
    assert.equal(
        (
            await request('/api/consultas', {
                method: 'POST',
                token: patientToken,
                body: appointment({ idPaciente: otherPatient }),
            })
        ).status,
        403,
    );
});
test('duração, sobreposição, adjacência e fuso são preservados', async () => {
    await clearAppointments();
    const body = appointment({
        dataHora: '2035-05-10T09:00:00-03:00',
        duracaoMinutos: 45,
    });
    const created = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body,
    });
    assert.equal(created.status, 201);
    const got = await request('/api/consultas/' + created.body.idConsulta, {
        token: patientToken,
    });
    assert.equal(got.body.dataHora, '2035-05-10T12:00:00.000Z');
    assert.equal(got.body.duracaoMinutos, 45);
    const overlap = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: {
            ...body,
            idPaciente: otherPatient,
            dataHora: '2035-05-10T09:30:00-03:00',
        },
    });
    assert.equal(overlap.status, 409);
    const adjacent = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: {
            ...body,
            idPaciente: otherPatient,
            dataHora: '2035-05-10T09:45:00-03:00',
        },
    });
    assert.equal(adjacent.status, 201);
    assert.equal(
        (
            await request('/api/consultas', {
                method: 'POST',
                token: adminToken,
                body: { ...body, duracaoMinutos: 0 },
            })
        ).status,
        400,
    );
});
test('concorrência: uma única reserva para períodos sobrepostos', async () => {
    await clearAppointments();
    const body = appointment();
    const result = await Promise.all([
        request('/api/consultas', { method: 'POST', token: adminToken, body }),
        request('/api/consultas', {
            method: 'POST',
            token: adminToken,
            body: { ...body, idPaciente: otherPatient },
        }),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
});
test('concorrência: limite de duas consultas futuras por especialidade', async () => {
    await clearAppointments();
    assert.equal(
        (
            await request('/api/consultas', {
                method: 'POST',
                token: adminToken,
                body: appointment(),
            })
        ).status,
        201,
    );
    const result = await Promise.all([
        request('/api/consultas', {
            method: 'POST',
            token: adminToken,
            body: appointment({ idMedico: 2 }),
        }),
        request('/api/consultas', {
            method: 'POST',
            token: adminToken,
            body: appointment({ idMedico: 3 }),
        }),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
});
test('desativação com consulta futura é bloqueada; cancelar permite desativar', async () => {
    await clearAppointments();
    const created = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: appointment({ idPaciente: 3, idMedico: 3 }),
    });
    assert.equal(created.status, 201);
    assert.equal(
        (
            await request('/api/pacientes/3', {
                method: 'DELETE',
                token: adminToken,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await request('/api/medicos/3', {
                method: 'DELETE',
                token: adminToken,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await request('/api/consultas/' + created.body.idConsulta, {
                method: 'DELETE',
                token: adminToken,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await request('/api/pacientes/3', {
                method: 'DELETE',
                token: adminToken,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await request('/api/medicos/3', {
                method: 'DELETE',
                token: adminToken,
            })
        ).status,
        200,
    );
});
test('cancelamento exige 24h e paciente não pode ser trocado', async () => {
    await clearAppointments();
    const body = appointment({
        dataHora: new Date(Date.now() + 23 * 3600000).toISOString(),
    });
    const created = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body,
    });
    assert.equal(created.status, 201);
    assert.equal(
        (
            await request('/api/consultas/' + created.body.idConsulta, {
                method: 'DELETE',
                token: patientToken,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await request('/api/consultas/' + created.body.idConsulta, {
                method: 'PUT',
                token: adminToken,
                body: { ...body, idPaciente: otherPatient },
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await request('/api/consultas/' + created.body.idConsulta, {
                method: 'PUT',
                token: patientToken,
                body: { ...body, status: 'Concluido' },
            })
        ).status,
        403,
    );
});
test('médico só enxerga atendimentos próprios', async () => {
    await clearAppointments();
    await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: appointment(),
    });
    const other = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: appointment({ idPaciente: otherPatient, idMedico: otherDoctor }),
    });
    const own = await request('/api/consultas', { token: doctorToken });
    assert.equal(own.body.length, 1);
    assert.equal(own.body[0].medico.idMedico, doctorId);
    assert.equal(
        (
            await request('/api/consultas/' + other.body.idConsulta, {
                token: doctorToken,
            })
        ).status,
        403,
    );
});
test('constraints rejeitam dados inválidos mesmo sem API', async () => {
    await assert.rejects(
        db.query(
            "INSERT INTO paciente(nome,cpf,data_nascimento) VALUES('X','11111111111','2000-01-01')",
        ),
        (e) => e.code === '23514',
    );
    await assert.rejects(
        db.query('UPDATE medico SET valor_consulta=-1 WHERE id_medico=1'),
        (e) => e.code === '23514',
    );
    await assert.rejects(
        db.query("UPDATE usuario SET senha='texto puro' WHERE id_usuario=1"),
        (e) => e.code === '23514',
    );
    await assert.rejects(
        db.query(
            "UPDATE paciente SET data_nascimento='2100-01-01' WHERE id_paciente=1",
        ),
        (e) => e.code === '23514',
    );
});
test('limite exato de 24h é aceito no banco', async () => {
    await clearAppointments();
    await db.query(`DO $$ DECLARE id integer; BEGIN
 INSERT INTO consulta(id_paciente,id_medico,data_hora,duracao_minutos,status,modalidade,triagem_sintomas)
 VALUES(1,1,statement_timestamp()+interval '24 hours',30,'Pendente','Pessoalmente','Teste') RETURNING id_consulta INTO id;
 UPDATE consulta SET status='Cancelado' WHERE id_consulta=id;
 END $$`);
    assert.equal(
        (await db.query('SELECT status FROM consulta')).rows[0].status,
        'Cancelado',
    );
});
test('SQL direto concorrente também impede sobreposição', async () => {
    await clearAppointments();
    const first = new pg.Client({ ...config, database: dbName }),
        second = new pg.Client({ ...config, database: dbName });
    await first.connect();
    await second.connect();
    try {
        const sql =
            "INSERT INTO consulta(id_paciente,id_medico,data_hora,duracao_minutos,status,modalidade,triagem_sintomas) VALUES($1,1,'2035-07-01T12:00:00Z',60,'Pendente','Pessoalmente','Teste')";
        const results = await Promise.allSettled([
            first.query(sql, [1]),
            second.query(sql, [2]),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    } finally {
        await first.end();
        await second.end();
    }
});
test('migração inválida reverte schema; hash migra sem perder contas e é repetível', async () => {
    const name = dbName + '_legacy';
    await admin.query(`CREATE DATABASE ${name}`);
    const legacy = new pg.Client({ ...config, database: name });
    await legacy.connect();
    const run = (file) =>
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
    try {
        run('infra/create_tables.sql');
        await legacy.query(
            "INSERT INTO paciente(nome,cpf,data_nascimento) VALUES('Legacy','11111111111','1990-01-01')",
        );
        assert.throws(() => run('infra/migrations/001_integridade.sql'));
        assert.equal(
            (await legacy.query('SELECT count(*)::int n FROM paciente')).rows[0]
                .n,
            1,
        );
        assert.equal(
            (
                await legacy.query(
                    "SELECT to_regclass('schema_migrations') AS table_name",
                )
            ).rows[0].table_name,
            null,
        );
        await legacy.query('UPDATE paciente SET cpf=$1', [cpf(123123123)]);
        run('infra/migrations/001_integridade.sql');
        await legacy.query(
            "INSERT INTO usuario(email,senha,role) VALUES('legacy@example.test',$1,'ADMIN')",
            [password],
        );
        const env = {
            ...process.env,
            DB_HOST: config.host,
            DB_PORT: String(config.port),
            DB_USER: config.user,
            DB_NAME: name,
        };
        if (config.password) env.DB_PASSWORD = config.password;
        execFileSync(process.execPath, ['scripts/migrate-passwords.mjs'], {
            env,
            stdio: 'pipe',
        });
        const hash = (await legacy.query('SELECT senha FROM usuario')).rows[0]
            .senha;
        assert.match(hash, /^scrypt\$/);
        execFileSync(process.execPath, ['scripts/migrate-passwords.mjs'], {
            env,
            stdio: 'pipe',
        });
        assert.equal(
            (await legacy.query('SELECT senha FROM usuario')).rows[0].senha,
            hash,
        );
        run('infra/migrations/002_credenciais.sql');
        run('infra/migrations/003_preparar_duracao.sql');
        await legacy.query(
            "INSERT INTO medico(nome,crm,especialidade,valor_consulta) VALUES('Legacy','123SP','Clínica',0)",
        );
        await legacy.query(
            "INSERT INTO consulta(id_paciente,id_medico,data_hora,triagem_sintomas) VALUES(1,1,'2035-08-01 09:00','Teste')",
        );
        assert.throws(() => run('infra/migrations/004_agendamento.sql'));
        assert.equal(
            (await legacy.query('SELECT duracao_minutos FROM consulta')).rows[0]
                .duracao_minutos,
            null,
        );
        await legacy.query('UPDATE consulta SET duracao_minutos=45');
        run('infra/migrations/004_agendamento.sql');
        assert.equal(
            (
                await legacy.query('SELECT data_hora FROM consulta')
            ).rows[0].data_hora.toISOString(),
            '2035-08-01T12:00:00.000Z',
        );
    } finally {
        await legacy.end();
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    }
});
test('especialidade não pode ser alterada para contornar o limite', async () => {
    await clearAppointments();
    await db.query("UPDATE medico SET especialidade='Outra' WHERE id_medico=2");
    for (const body of [
        appointment(),
        appointment(),
        appointment({ idMedico: 2 }),
    ])
        assert.equal(
            (
                await request('/api/consultas', {
                    method: 'POST',
                    token: adminToken,
                    body,
                })
            ).status,
            201,
        );
    await assert.rejects(
        db.query("UPDATE medico SET especialidade='Clínica' WHERE id_medico=2"),
        (e) => e.code === 'P1002',
    );
    await clearAppointments();
    await db.query(
        "UPDATE medico SET especialidade='Clínica' WHERE id_medico=2",
    );
});
test('telefone é opcional ao cadastrar, mas necessário para agendar', async () => {
    await clearAppointments();
    await db.query('UPDATE paciente SET telefone=NULL WHERE id_paciente=2');
    const result = await request('/api/consultas', {
        method: 'POST',
        token: adminToken,
        body: appointment({ idPaciente: 2 }),
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.codigo, 'P1008');
    await db.query(
        "UPDATE paciente SET telefone='11999991234' WHERE id_paciente=2",
    );
});
