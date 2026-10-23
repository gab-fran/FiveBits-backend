import type { AuthUser } from '../interface/UsuarioDTO.js';
import { pool } from '../model/DatabaseModel.js';
import type { PoolClient } from 'pg';
import type { ConsultaInput } from '../validation/inputs.js';
interface ConsultaRow {
    id_consulta: number;
    id_paciente: number;
    id_medico: number;
    data_hora: Date;
    duracao_minutos: number;
    status: string;
    modalidade: string;
    triagem_sintomas: string;
    situacao: boolean;
    paciente_nome: string;
    paciente_cpf: string;
    paciente_telefone: string | null;
    paciente_data_nascimento: string;
    paciente_situacao: boolean;
    medico_nome: string;
    medico_crm: string;
    medico_especialidade: string;
    medico_valor_consulta: string;
    medico_situacao: boolean;
}
function map(row: ConsultaRow) {
    return {
        idConsulta: row.id_consulta,
        dataHora: row.data_hora.toISOString(),
        duracaoMinutos: row.duracao_minutos,
        status: row.status,
        modalidade: row.modalidade,
        triagemSintomas: row.triagem_sintomas,
        situacao: row.situacao,
        paciente: {
            idPaciente: row.id_paciente,
            nomePaciente: row.paciente_nome,
            cpf: row.paciente_cpf,
            telefone: row.paciente_telefone ?? '',
            dataNascimento: row.paciente_data_nascimento,
            situacao: row.paciente_situacao,
        },
        medico: {
            idMedico: row.id_medico,
            nomeMedico: row.medico_nome,
            crm: row.medico_crm,
            especialidade: row.medico_especialidade,
            valorConsulta: Number(row.medico_valor_consulta),
            situacao: row.medico_situacao,
        },
    };
}
export default class ConsultaRepository {
    static async listarConsultas(user: AuthUser) {
        return (
            await pool.query<ConsultaRow>(
                `SELECT * FROM vw_consultas_detalhes WHERE ($1='ADMIN' OR ($1='PACIENTE' AND id_paciente=$2) OR ($1='MEDICO' AND id_medico=$3)) ORDER BY paciente_nome,medico_nome`,
                [user.role, user.idPaciente, user.idMedico],
            )
        ).rows.map(map);
    }
    static async listarConsulta(id: number, user: AuthUser) {
        const row = (
            await pool.query<ConsultaRow>(
                `SELECT * FROM vw_consultas_detalhes WHERE id_consulta=$1 AND ($2='ADMIN' OR ($2='PACIENTE' AND id_paciente=$3) OR ($2='MEDICO' AND id_medico=$4))`,
                [id, user.role, user.idPaciente, user.idMedico],
            )
        ).rows[0];
        return row ? map(row) : null;
    }
    static async lock(client: PoolClient, id: number) {
        return (
            (
                await client.query<{
                    id_paciente: number;
                    id_medico: number;
                    data_hora: Date;
                    duracao_minutos: number;
                    status: string;
                    situacao: boolean;
                }>('SELECT * FROM consulta WHERE id_consulta=$1 FOR UPDATE', [
                    id,
                ])
            ).rows[0] ?? null
        );
    }
    static async cadastrarConsulta(data: ConsultaInput, client: PoolClient) {
        const result = await client.query<{ id_consulta: number }>(
            `INSERT INTO consulta(id_paciente,id_medico,data_hora,status,modalidade,triagem_sintomas,duracao_minutos) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id_consulta`,
            [
                data.idPaciente,
                data.idMedico,
                data.dataHora,
                data.status,
                data.modalidade,
                data.triagemSintomas,
                data.duracaoMinutos,
            ],
        );
        return result.rows[0]!.id_consulta;
    }
    static async atualizarConsulta(
        id: number,
        data: ConsultaInput,
        client: PoolClient,
    ) {
        await client.query(
            "UPDATE consulta SET id_medico=$2,data_hora=$3,status=$4,modalidade=$5,triagem_sintomas=$6,duracao_minutos=$7,situacao=($4<>'Cancelado') WHERE id_consulta=$1",
            [
                id,
                data.idMedico,
                data.dataHora,
                data.status,
                data.modalidade,
                data.triagemSintomas,
                data.duracaoMinutos,
            ],
        );
    }
    static async deletarConsulta(id: number, client: PoolClient) {
        await client.query(
            "UPDATE consulta SET status='Cancelado',situacao=false WHERE id_consulta=$1",
            [id],
        );
    }
}
