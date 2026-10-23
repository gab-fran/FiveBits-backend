import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../dist/security/password.js';
test('scrypt: salt único, verificação e rejeição de texto puro', async () => {
    const first = await hashPassword('senha de teste'),
        second = await hashPassword('senha de teste');
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('senha de teste', first), true);
    assert.equal(await verifyPassword('outra senha', first), false);
    assert.equal(await verifyPassword('senha', 'senha'), false);
});
