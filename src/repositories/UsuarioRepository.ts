import { pool } from '../model/DatabaseModel.js';
import type { PoolClient } from 'pg';
export type Role = 'ADMIN' | 'MEDICO' | 'PACIENTE';
export interface UsuarioAutenticacao {
    id: number;
    nome: string;
    email: string;
    senha: string;
    role: Role;
    situacao: boolean;
    idPaciente: number | null;
    idMedico: number | null;
}
const select = `SELECT u.id_usuario AS id, COALESCE(p.nome,m.nome,'Administrador') AS nome,
 u.email,u.senha,u.role, (u.situacao AND COALESCE(p.situacao,true) AND COALESCE(m.situacao,true)) AS situacao,
 u.id_paciente AS "idPaciente",u.id_medico AS "idMedico" FROM usuario u
 LEFT JOIN paciente p ON p.id_paciente=u.id_paciente LEFT JOIN medico m ON m.id_medico=u.id_medico`;
export class UsuarioRepository {
    async findByEmail(email: string) {
        return (
            (
                await pool.query<UsuarioAutenticacao>(
                    `${select} WHERE lower(u.email)=$1`,
                    [email],
                )
            ).rows[0] ?? null
        );
    }
    async findById(id: number) {
        return (
            (
                await pool.query<UsuarioAutenticacao>(
                    `${select} WHERE u.id_usuario=$1`,
                    [id],
                )
            ).rows[0] ?? null
        );
    }
    async create(
        client: PoolClient,
        email: string,
        hash: string,
        role: 'MEDICO' | 'PACIENTE',
        id: number,
    ) {
        await client.query(
            'INSERT INTO usuario(email,senha,role,id_paciente,id_medico) VALUES($1,$2,$3,$4,$5)',
            [
                email,
                hash,
                role,
                role === 'PACIENTE' ? id : null,
                role === 'MEDICO' ? id : null,
            ],
        );
    }
}
