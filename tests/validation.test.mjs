import test from 'node:test';
import assert from 'node:assert/strict';
import {
    cpfValido,
    dataCivilValida,
    parseId,
    parsePaciente,
    parseMedico,
    parseConsulta,
    parseLogin,
    ValidationError,
} from '../dist/validation/inputs.js';
const paciente = {
    nome: '  Ana Maria  ',
    cpf: '529.982.247-25',
    telefone: '(11) 99999-1234',
    dataNascimento: '2000-02-29',
};
const consulta = {
    idPaciente: 1,
    idMedico: 2,
    duracaoMinutos: 30,
    dataHora: '2030-01-01T10:00:00-03:00',
    status: 'Pendente',
    modalidade: 'Pessoalmente',
    triagemSintomas: 'Dor de cabeça',
};
test('CPF: dígitos verificadores, repetidos e formatos', () => {
    assert.equal(cpfValido('52998224725'), true);
    for (const value of ['11111111111', '52998224724', '', '123'])
        assert.equal(cpfValido(value), false);
});
test('data civil: ano bissexto, calendário e nascimento futuro', () => {
    assert.equal(dataCivilValida('2000-02-29'), true);
    for (const value of [
        '2001-02-29',
        '2026-04-31',
        '0000-01-01',
        '01/01/2000',
    ])
        assert.equal(dataCivilValida(value), false);
    assert.throws(
        () =>
            parsePaciente(
                { ...paciente, dataNascimento: '2100-01-01' },
                false,
                '2026-10-23',
            ),
        ValidationError,
    );
});
test('IDs rejeitam coerções, frações, sinal e overflow', () => {
    assert.equal(parseId('42'), 42);
    for (const value of [
        '1abc',
        '1.5',
        '0',
        '-1',
        '+1',
        ' 1',
        '2147483648',
        1,
        null,
    ])
        assert.throws(() => parseId(value), ValidationError);
});
test('paciente: normaliza apenas campos autorizados e agrega erros', () => {
    const result = parsePaciente(paciente);
    assert.equal(result.nome, 'Ana Maria');
    assert.equal(result.cpf, '52998224725');
    assert.equal(result.telefone, '11999991234');
    assert.throws(
        () => parsePaciente({ ...paciente, nome: [], cpf: 123, role: 'ADMIN' }),
        (e) =>
            e.erros.some((x) => x.campo === 'role') &&
            e.erros.some((x) => x.campo === 'nome'),
    );
    for (const value of [null, [], true, 'text'])
        assert.throws(() => parsePaciente(value), ValidationError);
});
test('médico: CRM, precisão e limites monetários', () => {
    const medico = {
        nome: 'Dra. Ana',
        crm: '12345/SP',
        especialidade: 'Clínica',
        valorConsulta: 123.45,
    };
    assert.equal(parseMedico(medico).crm, '12345SP');
    for (const value of [-1, 10000, 1.001, '100', null, Infinity])
        assert.throws(
            () => parseMedico({ ...medico, valorConsulta: value }),
            ValidationError,
        );
    assert.throws(
        () => parseMedico({ ...medico, crm: '12345/XX' }),
        ValidationError,
    );
});
test('consulta: formato inequívoco e payload mínimo', () => {
    assert.equal(parseConsulta(consulta).idPaciente, 1);
    for (const dataHora of [
        '2030-01-01T10:00',
        '2030-02-30T10:00:00Z',
        '2030-01-01T24:00:00Z',
    ])
        assert.throws(
            () => parseConsulta({ ...consulta, dataHora }),
            ValidationError,
        );
    assert.throws(
        () => parseConsulta({ ...consulta, status: 'Concluido' }),
        ValidationError,
    );
    assert.throws(
        () => parseConsulta({ ...consulta, triagemSintomas: 'x'.repeat(101) }),
        ValidationError,
    );
    assert.throws(
        () => parseConsulta({ ...consulta, idPaciente: '1' }),
        ValidationError,
    );
});
test('login não transforma a senha e não aceita objetos', () => {
    assert.equal(
        parseLogin({ email: ' A@EXAMPLE.COM ', senha: ' senha ' }).senha,
        ' senha ',
    );
    assert.throws(() => parseLogin({ email: {}, senha: [] }), ValidationError);
});
