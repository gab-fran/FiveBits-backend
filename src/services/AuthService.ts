import jwt from 'jsonwebtoken';
import { UsuarioRepository } from '../repositories/UsuarioRepository.js';
import { jwtSecret } from '../config/security.js';
import { verifyPassword, hashPassword } from '../security/password.js';
import { AppError } from '../errors/AppError.js';
import type { LoginDTO } from '../interface/UsuarioDTO.js';
const repository = new UsuarioRepository();
let dummyHash: Promise<string> | undefined;
export class AuthService {
    async autenticar(credenciais: LoginDTO) {
        const usuario = await repository.findByEmail(credenciais.email);
        dummyHash ??= hashPassword('dummy credential for timing equalization');
        const valid = await verifyPassword(
            credenciais.senha,
            usuario?.senha ?? (await dummyHash),
        );
        if (!usuario?.situacao || !valid)
            throw new AppError(
                401,
                'CREDENCIAIS_INVALIDAS',
                'Usuário e/ou senha incorretos.',
            );
        const token = jwt.sign({}, jwtSecret(), {
            algorithm: 'HS256',
            subject: String(usuario.id),
            expiresIn: '1h',
            issuer: 'medflow-api',
            audience: 'medflow-web',
        });
        return {
            auth: true,
            token,
            usuario: {
                id_usuario: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role,
                situacao: usuario.situacao,
                idPaciente: usuario.idPaciente,
                idMedico: usuario.idMedico,
            },
        };
    }
}
