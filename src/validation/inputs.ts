export interface FieldError {
    campo: string;
    mensagem: string;
}
export class ValidationError extends Error {
    readonly status = 400;
    readonly codigo = 'DADOS_INVALIDOS';
    readonly erros: FieldError[];
    constructor(erros: FieldError[]) {
        super('Verifique os campos informados.');
        this.erros = erros;
    }
}

export function cpfValido(value: string): boolean {
    if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
    for (let size = 9; size <= 10; size++) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += Number(value[i]) * (size + 1 - i);
        const digit = ((sum * 10) % 11) % 10;
        if (digit !== Number(value[size])) return false;
    }
    return true;
}

export function dataCivilValida(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

class Input {
    readonly errors: FieldError[] = [];
    readonly body: Record<string, unknown>;
    constructor(value: unknown, fields: string[]) {
        this.body =
            value !== null && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
        if (value === null || typeof value !== 'object' || Array.isArray(value))
            this.add('body', 'Envie um objeto JSON.');
        for (const key of Object.keys(this.body))
            if (!fields.includes(key)) this.add(key, 'Campo não permitido.');
    }
    add(campo: string, mensagem: string) {
        this.errors.push({ campo, mensagem });
    }
    text(field: string, max: number, required = true, trim = true): string {
        const raw = this.body[field];
        if (!required && (raw === undefined || raw === null || raw === ''))
            return '';
        if (typeof raw !== 'string') {
            this.add(field, 'Informe um texto.');
            return '';
        }
        const value = trim ? raw.trim() : raw;
        if (!value.trim()) this.add(field, 'Campo obrigatório.');
        if (
            [...value].length > max ||
            [...value].some((char) => {
                const code = char.charCodeAt(0);
                return (
                    (code < 32 && ![9, 10, 13].includes(code)) || code === 127
                );
            })
        )
            this.add(field, `Use até ${max} caracteres válidos.`);
        return value;
    }
    id(field: string): number {
        const value = this.body[field];
        if (
            typeof value !== 'number' ||
            !Number.isSafeInteger(value) ||
            value <= 0 ||
            value > 2147483647
        ) {
            this.add(field, 'Informe um identificador inteiro positivo.');
            return 0;
        }
        return value;
    }
    finish() {
        if (this.errors.length) throw new ValidationError(this.errors);
    }
}

export function parseId(value: unknown, field = 'id'): number {
    if (
        typeof value !== 'string' ||
        !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) > 2147483647
    )
        throw new ValidationError([
            {
                campo: field,
                mensagem: 'Informe um identificador inteiro positivo.',
            },
        ]);
    return Number(value);
}

function credentials(input: Input, registration: boolean) {
    const email = input.text('email', 255).toLowerCase();
    const senha = input.text('senha', 128, true, false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        input.add('email', 'Informe um e-mail válido.');
    // Login accepts existing passwords; a stronger registration policy can be configured separately.
    if (registration && !senha.trim()) input.add('senha', 'Informe uma senha.');
    return { email, senha };
}

export function parseLogin(value: unknown) {
    const input = new Input(value, ['email', 'senha']);
    const result = credentials(input, false);
    input.finish();
    return result;
}

export function parsePaciente(
    value: unknown,
    registration = false,
    today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date()),
) {
    const input = new Input(value, [
        'nome',
        'cpf',
        'telefone',
        'dataNascimento',
        ...(registration ? ['email', 'senha'] : []),
    ]);
    const nome = input.text('nome', 50);
    if ([...nome].length < 3)
        input.add('nome', 'Informe um nome com pelo menos 3 caracteres.');
    const cpfInput = input.text('cpf', 14);
    const cpf = cpfInput.replace(/[.-]/g, '');
    if (!cpfValido(cpf)) input.add('cpf', 'Informe um CPF válido.');
    const telefoneInput = input.text('telefone', 20, false);
    const telefone = telefoneInput.replace(/[()\s-]/g, '');
    if (telefone && !/^\d{10,11}$/.test(telefone))
        input.add('telefone', 'Informe DDD e telefone com 10 ou 11 dígitos.');
    const dataNascimento = input.text('dataNascimento', 10);
    if (!dataCivilValida(dataNascimento) || dataNascimento > today)
        input.add(
            'dataNascimento',
            'Informe uma data de nascimento válida, não futura.',
        );
    const account = registration ? credentials(input, true) : undefined;
    input.finish();
    return { nome, cpf, telefone, dataNascimento, account };
}

export function parseMedico(value: unknown, registration = false) {
    const input = new Input(value, [
        'nome',
        'crm',
        'especialidade',
        'valorConsulta',
        ...(registration ? ['email', 'senha'] : []),
    ]);
    const nome = input.text('nome', 50);
    if ([...nome].length < 3)
        input.add('nome', 'Informe um nome com pelo menos 3 caracteres.');
    const crmInput = input.text('crm', 13);
    const crm = crmInput.replace('/', '').toUpperCase();
    if (!/^\d{1,6}\/?[A-Za-z]{2}$/.test(crmInput))
        input.add('crm', 'Use número/UF para o CRM.');
    const ufs =
        'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
            ' ',
        );
    if (!/^\d{1,6}[A-Z]{2}$/.test(crm) || !ufs.includes(crm.slice(-2)))
        input.add('crm', 'Informe o número do CRM e uma UF válida.');
    const especialidade = input.text('especialidade', 100);
    const valor = input.body.valorConsulta;
    if (
        typeof valor !== 'number' ||
        !Number.isFinite(valor) ||
        valor < 0 ||
        valor > 9999.99 ||
        Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-7
    )
        input.add(
            'valorConsulta',
            'Informe um valor entre 0 e 9999,99, com até duas casas decimais.',
        );
    const account = registration ? credentials(input, true) : undefined;
    input.finish();
    return {
        nome,
        crm,
        especialidade,
        valorConsulta: valor as number,
        account,
    };
}

export function parseConsulta(value: unknown, editing = false) {
    const input = new Input(value, [
        'idPaciente',
        'idMedico',
        'dataHora',
        'status',
        'modalidade',
        'triagemSintomas',
        'duracaoMinutos',
    ]);
    const duracaoMinutos = input.id('duracaoMinutos');
    const idPaciente = input.id('idPaciente');
    const idMedico = input.id('idMedico');
    const dataHora = input.text('dataHora', 35);
    // Offset is mandatory: never silently interpret an instant in the server's timezone.
    if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
            dataHora,
        ) ||
        !dataCivilValida(dataHora.slice(0, 10)) ||
        !Number.isFinite(Date.parse(dataHora)) ||
        Number(dataHora.slice(11, 13)) > 23 ||
        Number(dataHora.slice(14, 16)) > 59 ||
        Number(dataHora.slice(17, 19)) > 59
    )
        input.add('dataHora', 'Informe data e hora válidas com fuso horário.');
    if (
        !editing &&
        Number.isFinite(Date.parse(dataHora)) &&
        Date.parse(dataHora) <= Date.now()
    )
        input.add('dataHora', 'Escolha uma data e hora futuras.');
    if (
        Number.isFinite(Date.parse(dataHora)) &&
        Date.parse(dataHora) + duracaoMinutos * 60000 >
            Date.parse('9999-12-31T23:59:59Z')
    )
        input.add(
            'duracaoMinutos',
            'A duração excede o limite de datas suportado.',
        );
    const status = input.text('status', 20);
    if (
        !(
            editing
                ? ['Pendente', 'Confirmado', 'Cancelado', 'Concluido']
                : ['Pendente', 'Confirmado']
        ).includes(status)
    )
        input.add('status', 'Status inválido para esta operação.');
    const modalidade = input.text('modalidade', 30);
    if (!['Pessoalmente', 'Telemedicina'].includes(modalidade))
        input.add('modalidade', 'Modalidade inválida.');
    const triagemSintomas = input.text('triagemSintomas', 100);
    input.finish();
    return {
        idPaciente,
        idMedico,
        dataHora,
        duracaoMinutos,
        status,
        modalidade,
        triagemSintomas,
    };
}

export type PacienteInput = ReturnType<typeof parsePaciente>;
export type MedicoInput = ReturnType<typeof parseMedico>;
export type ConsultaInput = ReturnType<typeof parseConsulta>;
