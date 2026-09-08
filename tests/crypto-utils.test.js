import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoUtils } from '../src/utils/crypto-utils.js';

test('CryptoUtils - generates salt and hashes PIN correctly', async () => {
  const salt = CryptoUtils.generateSalt();
  assert.ok(salt);
  assert.equal(salt.length, 32);

  const hash1 = await CryptoUtils.hashPin('1234', salt);
  const hash2 = await CryptoUtils.hashPin('1234', salt);
  assert.equal(hash1, hash2);

  const isValid = await CryptoUtils.verifyPin('1234', hash1, salt);
  assert.equal(isValid, true);

  const isInvalid = await CryptoUtils.verifyPin('9999', hash1, salt);
  assert.equal(isInvalid, false);
});
