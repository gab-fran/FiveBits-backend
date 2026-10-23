import { currentUser } from '../middlewares/authorization.js';
import type { Request, Response } from 'express';
import Repository from '../repositories/PacienteRepository.js';
import { PacienteService as Service } from '../services/PacienteService.js';
import { parsePaciente, parseId } from '../validation/inputs.js';
export default class PacienteController {
    static async todos(req: Request, res: Response) {
        res.json(
            await Repository.listarPacientes(
                currentUser(req).role === 'PACIENTE'
                    ? (currentUser(req).idPaciente ?? 0)
                    : undefined,
            ),
        );
    }
    static async paciente(req: Request, res: Response) {
        res.json(await Service.get(parseId(req.params.idPaciente)));
    }
    static async novo(req: Request, res: Response) {
        const id = await Service.create(parsePaciente(req.body, true));
        res.status(201).json({
            idPaciente: id,
            mensagem: 'Cadastro realizado com sucesso.',
        });
    }
    static async atualizar(req: Request, res: Response) {
        await Service.update(
            parseId(req.params.idPaciente),
            parsePaciente(req.body),
        );
        res.json({ mensagem: 'Dados atualizados com sucesso.' });
    }
    static async remover(req: Request, res: Response) {
        await Service.remove(parseId(req.params.idPaciente));
        res.json({ mensagem: 'Registro desativado com sucesso.' });
    }
}
