import type { Request, RequestHandler } from 'express';
import { AppError, notFound, forbid } from '../errors/AppError.js';
import { pool } from '../model/DatabaseModel.js';
import type { Role } from '../repositories/UsuarioRepository.js';
import { parseId } from '../validation/inputs.js';
import type { AuthUser } from '../interface/UsuarioDTO.js';
export function currentUser(req: Request): AuthUser {
    if (!req.usuario)
        throw new AppError(
            401,
            'NAO_AUTENTICADO',
            'Faça login para continuar.',
        );
    return req.usuario;
}
export const roles =
    (...allowed: Role[]): RequestHandler =>
    (req, _res, next) => {
        if (!allowed.includes(currentUser(req).role)) forbid();
        next();
    };
export const pacienteAccess: RequestHandler = (req, _res, next) => {
    const id = parseId(req.params.idPaciente);
    const user = currentUser(req);
    if (
        user.role !== 'ADMIN' &&
        (user.role !== 'PACIENTE' || user.idPaciente !== id)
    )
        forbid();
    next();
};
export const medicoAccess: RequestHandler = (req, _res, next) => {
    const id = parseId(req.params.idMedico);
    const user = currentUser(req);
    if (user.role === 'MEDICO' && user.idMedico !== id) forbid();
    next();
};
export const consultaAccess: RequestHandler = async (req, _res, next) => {
    const id = parseId(req.params.idConsulta);
    const user = currentUser(req);
    const row = (
        await pool.query<{ id_paciente: number; id_medico: number }>(
            'SELECT id_paciente,id_medico FROM consulta WHERE id_consulta=$1',
            [id],
        )
    ).rows[0];
    if (!row) notFound();
    if (
        user.role !== 'ADMIN' &&
        !(
            (user.role === 'PACIENTE' && user.idPaciente === row.id_paciente) ||
            (user.role === 'MEDICO' && user.idMedico === row.id_medico)
        )
    )
        forbid();
    next();
};
