import Repository from '../repositories/PacienteRepository.js';
import { UsuarioRepository } from '../repositories/UsuarioRepository.js';
import { transaction } from '../model/DatabaseModel.js';
import { hashPassword } from '../security/password.js';
import { notFound, AppError } from '../errors/AppError.js';
import type { PacienteInput } from '../validation/inputs.js';
export class PacienteService {
    static async create(data: PacienteInput) {
        const account = data.account;
        if (!account)
            throw new AppError(
                400,
                'CREDENCIAIS_OBRIGATORIAS',
                'Informe e-mail e senha no cadastro.',
            );
        const hash = await hashPassword(account.senha);
        return transaction(async (client) => {
            const id = await Repository.cadastrarPaciente(data, client);
            if (account)
                await new UsuarioRepository().create(
                    client,
                    account.email,
                    hash,
                    'PACIENTE',
                    id,
                );
            return id;
        });
    }
    static async update(id: number, data: PacienteInput) {
        if (!(await Repository.atualizarPaciente(id, data))) notFound();
    }
    static async remove(id: number) {
        await transaction(async (client) => {
            if (!(await Repository.deletarPaciente(id, client))) notFound();
            await client.query(
                'UPDATE usuario SET situacao=false WHERE id_paciente=$1',
                [id],
            );
        });
    }
    static async get(id: number) {
        return (await Repository.listarPaciente(id)) ?? notFound();
    }
}
