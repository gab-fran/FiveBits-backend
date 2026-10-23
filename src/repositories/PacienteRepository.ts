import type { PacienteDTO } from '../interface/PacienteDTO.js';
import { pool } from '../model/DatabaseModel.js';
import type { PoolClient } from 'pg';
import type { PacienteInput } from '../validation/inputs.js';
const columns =
    'id_paciente AS "idPaciente", nome, cpf, telefone, data_nascimento::text AS "dataNascimento", situacao';
export default class PacienteRepository {
    static async listarPacientes(id?: number) {
        return (
            await pool.query<PacienteDTO>(
                `SELECT ${columns} FROM paciente WHERE situacao AND ($1::integer IS NULL OR id_paciente=$1) ORDER BY nome`,
                [id ?? null],
            )
        ).rows;
    }
    static async listarPaciente(id: number) {
        return (
            (
                await pool.query<PacienteDTO>(
                    `SELECT ${columns} FROM paciente WHERE id_paciente=$1 AND situacao`,
                    [id],
                )
            ).rows[0] ?? null
        );
    }
    static async cadastrarPaciente(data: PacienteInput, client: PoolClient) {
        const result = await client.query<{ id_paciente: number }>(
            'INSERT INTO paciente(nome,cpf,telefone,data_nascimento) VALUES($1,$2,$3,$4) RETURNING id_paciente',
            [data.nome, data.cpf, data.telefone || null, data.dataNascimento],
        );
        return result.rows[0]!.id_paciente;
    }
    static async atualizarPaciente(id: number, data: PacienteInput) {
        return (
            (
                await pool.query(
                    'UPDATE paciente SET nome=$2,cpf=$3,telefone=$4,data_nascimento=$5 WHERE id_paciente=$1 AND situacao RETURNING id_paciente',
                    [
                        id,
                        data.nome,
                        data.cpf,
                        data.telefone || null,
                        data.dataNascimento,
                    ],
                )
            ).rowCount === 1
        );
    }
    static async deletarPaciente(id: number, client: PoolClient) {
        return (
            (
                await client.query(
                    'UPDATE paciente SET situacao=false WHERE id_paciente=$1 AND situacao RETURNING id_paciente',
                    [id],
                )
            ).rowCount === 1
        );
    }
}
