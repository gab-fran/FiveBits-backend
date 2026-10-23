import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { jwtSecret } from '../config/security.js';
import { AppError } from '../errors/AppError.js';
import { UsuarioRepository } from '../repositories/UsuarioRepository.js';
import type { AuthUser } from '../interface/UsuarioDTO.js';
declare global {
    namespace Express {
        interface Request {
            usuario?: AuthUser;
        }
    }
}
export class Auth {
    static verifyToken: RequestHandler = async (req, _res, next) => {
        const token = req.headers['x-access-token'];
        if (typeof token !== 'string' || !token)
            throw new AppError(
                401,
                'NAO_AUTENTICADO',
                'Faça login para continuar.',
            );
        let id: number;
        try {
            const payload = jwt.verify(token, jwtSecret(), {
                algorithms: ['HS256'],
                issuer: 'medflow-api',
                audience: 'medflow-web',
            });
            if (
                typeof payload === 'string' ||
                !payload.exp ||
                typeof payload.sub !== 'string' ||
                !/^[1-9]\d*$/.test(payload.sub)
            )
                throw new Error();
            id = Number(payload.sub);
            if (!Number.isSafeInteger(id) || id > 2147483647) throw new Error();
        } catch {
            throw new AppError(
                401,
                'TOKEN_INVALIDO',
                'Sessão inválida ou expirada. Faça login novamente.',
            );
        }
        const user = await new UsuarioRepository().findById(id);
        if (!user?.situacao)
            throw new AppError(
                401,
                'CONTA_INATIVA',
                'Conta indisponível. Faça login novamente.',
            );
        const { senha: _senha, ...safe } = user;
        req.usuario = safe;
        next();
    };
}
