import { currentUser } from '../middlewares/authorization.js';
import type { Request, Response } from 'express';
import Repository from '../repositories/MedicoRepository.js';
import { MedicoService as Service } from '../services/MedicoService.js';
import { parseMedico, parseId } from '../validation/inputs.js';
export default class MedicoController {
    static async todos(req: Request, res: Response) {
        res.json(
            await Repository.listarMedicos(
                currentUser(req).role === 'MEDICO'
                    ? (currentUser(req).idMedico ?? 0)
                    : undefined,
            ),
        );
    }
    static async medico(req: Request, res: Response) {
        res.json(await Service.get(parseId(req.params.idMedico)));
    }
    static async novo(req: Request, res: Response) {
        const id = await Service.create(parseMedico(req.body, true));
        res.status(201).json({
            idMedico: id,
            mensagem: 'Cadastro realizado com sucesso.',
        });
    }
    static async atualizar(req: Request, res: Response) {
        await Service.update(
            parseId(req.params.idMedico),
            parseMedico(req.body),
        );
        res.json({ mensagem: 'Dados atualizados com sucesso.' });
    }
    static async remover(req: Request, res: Response) {
        await Service.remove(parseId(req.params.idMedico));
        res.json({ mensagem: 'Registro desativado com sucesso.' });
    }
}
