export class AppError extends Error {
    constructor(
        readonly status: number,
        readonly codigo: string,
        mensagem: string,
    ) {
        super(mensagem);
    }
}
export function notFound(): never {
    throw new AppError(404, 'NAO_ENCONTRADO', 'Registro não encontrado.');
}

export function forbid(): never {
    throw new AppError(
        403,
        'ACESSO_NEGADO',
        'Você não tem permissão para esta operação.',
    );
}
