import type { Request, Response } from 'express';
import { AuthService } from '../services/AuthService.js';
import { parseLogin } from '../validation/inputs.js';
export class AuthController {
    static async login(req: Request, res: Response) {
        res.json(await new AuthService().autenticar(parseLogin(req.body)));
    }
}
