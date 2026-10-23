import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        scrypt(password, salt, 64, OPTIONS, (error, key) =>
            error ? reject(error) : resolve(key),
        ),
    );
}
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$32768$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export function isPasswordHash(value: string): boolean {
    return /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value);
}
export async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    if (!isPasswordHash(hash)) return false;
    const parts = hash.split('$');
    return timingSafeEqual(
        await derive(password, parts[4]!),
        Buffer.from(parts[5]!, 'hex'),
    );
}
