import 'dotenv/config';
export function jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32)
        throw new Error(
            'Configure JWT_SECRET com pelo menos 32 bytes aleatórios.',
        );
    return secret;
}
