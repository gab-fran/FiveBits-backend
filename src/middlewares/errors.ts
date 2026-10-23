import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { ValidationError } from '../validation/inputs.js';

export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
) => {
    if (error instanceof ValidationError) {
        res.status(400).json({
            codigo: error.codigo,
            mensagem: error.message,
            erros: error.erros,
        });
        return;
    }
    if (error instanceof AppError) {
        res.status(error.status).json({
            codigo: error.codigo,
            mensagem: error.message,
        });
        return;
    }
    const detail = error as {
        code?: string;
        type?: string;
        constraint?: string;
    };
    if (
        detail.type === 'entity.parse.failed' ||
        detail.type === 'entity.too.large'
    ) {
        res.status(detail.type === 'entity.too.large' ? 413 : 400).json({
            codigo: 'JSON_INVALIDO',
            mensagem: 'Corpo JSON inválido ou muito grande.',
        });
        return;
    }
    const conflicts: Record<string, string> = {
        paciente_cpf_key: 'CPF já cadastrado.',
        medico_crm_key: 'CRM já cadastrado.',
        usuario_email_canonical_key: 'E-mail já cadastrado.',
        consulta_horario_unico: 'Médico já possui consulta neste horário.',
    };
    const rules: Record<string, string> = {
        P1001: 'O período informado conflita com outra consulta do médico.',
        P1002: 'Limite de duas consultas futuras por especialidade.',
        P1003: 'Cancelamentos online exigem 24 horas de antecedência. Entre em contato com a clínica.',
        P1004: 'Cancele as consultas futuras antes de desativar o cadastro.',
        P1005: 'Consulta encerrada ou alteração de paciente não permitida.',
        P1006: 'Paciente e médico devem estar ativos.',
        P1008: 'Complete o telefone do paciente antes de agendar.',
    };
    if (detail.code && rules[detail.code]) {
        res.status(409).json({
            codigo: detail.code,
            mensagem: rules[detail.code],
        });
        return;
    }
    if (detail.code === '40P01' || detail.code === '40001') {
        res.status(409).json({
            codigo: 'CONCORRENCIA',
            mensagem: 'Outra operação alterou estes dados. Tente novamente.',
        });
        return;
    }
    if (detail.code === 'P1007') {
        res.status(404).json({
            codigo: 'NAO_ENCONTRADO',
            mensagem: 'Registro não encontrado.',
        });
        return;
    }
    if (detail.code === '23505') {
        res.status(409).json({
            codigo: 'CONFLITO',
            mensagem:
                conflicts[detail.constraint ?? ''] ?? 'Registro duplicado.',
        });
        return;
    }
    if (
        [
            '23503',
            '23514',
            '23502',
            '22001',
            '22007',
            '22008',
            '22P02',
        ].includes(detail.code ?? '')
    ) {
        res.status(400).json({
            codigo: 'DADOS_INVALIDOS',
            mensagem: 'Dados incompatíveis com as regras de integridade.',
        });
        return;
    }
    // Never log SQL parameters, patient data, credentials or raw database errors.
    console.error('Falha interna na operação.', {
        codigo: detail.code ?? 'INTERNO',
    });
    res.status(500).json({
        codigo: 'ERRO_INTERNO',
        mensagem: 'Não foi possível concluir a operação.',
    });
};
