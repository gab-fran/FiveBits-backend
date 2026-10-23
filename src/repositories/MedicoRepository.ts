import type { MedicoDTO } from '../interface/MedicoDTO.js';
import { pool } from '../model/DatabaseModel.js';
import type { PoolClient } from 'pg';
import type { MedicoInput } from '../validation/inputs.js';
const columns =
    'id_medico AS "idMedico", nome, crm, especialidade, valor_consulta::float8 AS "valorConsulta", situacao';
export default class MedicoRepository {
    static async listarMedicos(id?: number) {
        return (
            await pool.query<MedicoDTO>(
                `SELECT ${columns} FROM medico WHERE situacao AND ($1::integer IS NULL OR id_medico=$1) ORDER BY nome`,
                [id ?? null],
            )
        ).rows;
    }
    static async listarMedico(id: number) {
        return (
            (
                await pool.query<MedicoDTO>(
                    `SELECT ${columns} FROM medico WHERE id_medico=$1 AND situacao`,
                    [id],
                )
            ).rows[0] ?? null
        );
    }
    static async cadastrarMedico(data: MedicoInput, client: PoolClient) {
        const result = await client.query<{ id_medico: number }>(
            'INSERT INTO medico(nome,crm,especialidade,valor_consulta) VALUES($1,$2,$3,$4) RETURNING id_medico',
            [data.nome, data.crm, data.especialidade, data.valorConsulta],
        );
        return result.rows[0]!.id_medico;
    }
    static async atualizarMedico(id: number, data: MedicoInput) {
        return (
            (
                await pool.query(
                    'UPDATE medico SET nome=$2,crm=$3,especialidade=$4,valor_consulta=$5 WHERE id_medico=$1 AND situacao RETURNING id_medico',
                    [
                        id,
                        data.nome,
                        data.crm,
                        data.especialidade,
                        data.valorConsulta,
                    ],
                )
            ).rowCount === 1
        );
    }
    static async deletarMedico(id: number, client: PoolClient) {
        return (
            (
                await client.query(
                    'UPDATE medico SET situacao=false WHERE id_medico=$1 AND situacao RETURNING id_medico',
                    [id],
                )
            ).rowCount === 1
        );
    }
}
