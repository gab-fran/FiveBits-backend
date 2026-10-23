import { currentUser } from '../middlewares/authorization.js';
import { forbid } from '../errors/AppError.js';
import type { Request, Response } from 'express';
import Repository from '../repositories/ConsultaRepository.js';
import { ConsultaService as Service } from '../services/ConsultaService.js';
import { parseConsulta, parseId } from '../validation/inputs.js';
export default class ConsultaController {
    static async todos(req: Request, res: Response) {
        res.json(await Repository.listarConsultas(currentUser(req)));
    }
    static async consulta(req: Request, res: Response) {
        res.json(
            await Service.get(parseId(req.params.idConsulta), currentUser(req)),
        );
    }
    static async novo(req: Request, res: Response) {
        const data = parseConsulta(req.body);
        const user = currentUser(req);
        if (user.role === 'PACIENTE' && data.idPaciente !== user.idPaciente)
            forbid();
        const id = await Service.create(data);
        res.status(201).json({
            idConsulta: id,
            mensagem: 'Consulta cadastrada com sucesso.',
        });
    }
    static async atualizar(req: Request, res: Response) {
        const data = parseConsulta(req.body, true);
        const user = currentUser(req);
        if (
            user.role === 'PACIENTE' &&
            (data.idPaciente !== user.idPaciente || data.status === 'Concluido')
        )
            forbid();
        if (user.role === 'MEDICO' && data.idMedico !== user.idMedico) forbid();
        await Service.update(parseId(req.params.idConsulta), data, user);
        res.json({ mensagem: 'Consulta atualizada com sucesso.' });
    }
    static async remover(req: Request, res: Response) {
        await Service.remove(parseId(req.params.idConsulta), currentUser(req));
        res.json({ mensagem: 'Consulta cancelada com sucesso.' });
    }
}
