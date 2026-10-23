import type { AuthUser } from '../interface/UsuarioDTO.js';
import { forbid } from '../errors/AppError.js';
import type { PoolClient } from 'pg';
import Repository from '../repositories/ConsultaRepository.js';
import { transaction } from '../model/DatabaseModel.js';
import { AppError, notFound } from '../errors/AppError.js';
import type { ConsultaInput } from '../validation/inputs.js';
export class ConsultaService {
    static checkOwner(
        user: AuthUser,
        row: { id_paciente: number; id_medico: number },
    ) {
        if (
            user.role !== 'ADMIN' &&
            !(
                (user.role === 'PACIENTE' &&
                    user.idPaciente === row.id_paciente) ||
                (user.role === 'MEDICO' && user.idMedico === row.id_medico)
            )
        )
            forbid();
    }
    static async get(id: number, user: AuthUser) {
        return (await Repository.listarConsulta(id, user)) ?? notFound();
    }
    static async participants(client: PoolClient, data: ConsultaInput) {
        // Row locks coordinate scheduling with deactivation in the same database.
        const paciente = await client.query(
            'SELECT 1 FROM paciente WHERE id_paciente=$1 AND situacao FOR UPDATE',
            [data.idPaciente],
        );
        const medico = await client.query(
            'SELECT 1 FROM medico WHERE id_medico=$1 AND situacao FOR UPDATE',
            [data.idMedico],
        );
        if (!paciente.rowCount || !medico.rowCount)
            throw new AppError(
                409,
                'CADASTRO_INATIVO',
                'Paciente e médico devem existir e estar ativos.',
            );
    }
    static async create(data: ConsultaInput) {
        return transaction(async (client) => {
            await this.participants(client, data);
            return Repository.cadastrarConsulta(data, client);
        });
    }
    static async update(id: number, data: ConsultaInput, user: AuthUser) {
        await transaction(async (client) => {
            const current = await Repository.lock(client, id);
            if (!current?.situacao) notFound();
            this.checkOwner(user, current);
            if (['Concluido', 'Cancelado'].includes(current.status))
                throw new AppError(
                    409,
                    'CONSULTA_ENCERRADA',
                    'Consulta encerrada não pode ser alterada.',
                );
            if (current.id_paciente !== data.idPaciente)
                throw new AppError(
                    409,
                    'PACIENTE_DIVERGENTE',
                    'O paciente não pode ser alterado nesta operação.',
                );
            await this.participants(client, data);
            await Repository.atualizarConsulta(id, data, client);
        });
    }
    static async remove(id: number, user: AuthUser) {
        await transaction(async (client) => {
            const current = await Repository.lock(client, id);
            if (!current?.situacao) notFound();
            this.checkOwner(user, current);
            if (['Concluido', 'Cancelado'].includes(current.status))
                throw new AppError(
                    409,
                    'CONSULTA_ENCERRADA',
                    'Consulta encerrada não pode ser cancelada.',
                );
            await Repository.deletarConsulta(id, client);
        });
    }
}
