import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { errorHandler } from './middlewares/errors.js';
const server = express();
server.disable('x-powered-by');
server.use(
    cors({
        origin: (
            process.env.CORS_ORIGINS ??
            'http://localhost:5173,http://127.0.0.1:5173'
        )
            .split(',')
            .map((value) => value.trim()),
    }),
);
server.use(express.json({ limit: '32kb' }));
server.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
});
server.use(router);
server.use((_req, res) => {
    res.status(404).json({
        codigo: 'ROTA_NAO_ENCONTRADA',
        mensagem: 'Rota não encontrada.',
    });
});
server.use(errorHandler);
export { server };
