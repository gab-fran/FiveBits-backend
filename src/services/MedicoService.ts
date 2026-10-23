import Repository from '../repositories/MedicoRepository.js';
import { UsuarioRepository } from '../repositories/UsuarioRepository.js';
import { transaction } from '../model/DatabaseModel.js';
import { hashPassword } from '../security/password.js';
import { notFound, AppError } from '../errors/AppError.js';
import type { MedicoInput } from '../validation/inputs.js';
export class MedicoService {
    static async create(data: MedicoInput) {
        const account = data.account;
        if (!account)
            throw new AppError(
                400,
                'CREDENCIAIS_OBRIGATORIAS',
                'Informe e-mail e senha no cadastro.',
            );
        const hash = await hashPassword(account.senha);
        return transaction(async (client) => {
            const id = await Repository.cadastrarMedico(data, client);
            if (account)
                await new UsuarioRepository().create(
                    client,
                    account.email,
                    hash,
                    'MEDICO',
                    id,
                );
            return id;
        });
    }
    static async update(id: number, data: MedicoInput) {
        if (!(await Repository.atualizarMedico(id, data))) notFound();
    }
    static async remove(id: number) {
        await transaction(async (client) => {
            if (!(await Repository.deletarMedico(id, client))) notFound();
            await client.query(
                'UPDATE usuario SET situacao=false WHERE id_medico=$1',
                [id],
            );
        });
    }
    static async get(id: number) {
        return (await Repository.listarMedico(id)) ?? notFound();
    }
}
