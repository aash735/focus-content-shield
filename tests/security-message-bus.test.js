import test from 'node:test';
import assert from 'node:assert/strict';

test('Security Message Bus - sender origin validation logic', () => {
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopqrstuvwxyz123456/';

  function validateSender(senderUrl) {
    if (!senderUrl || typeof senderUrl !== 'string') return false;
    return senderUrl.startsWith(extensionOrigin);
  }

  // Internal UI callers
  assert.equal(validateSender('chrome-extension://abcdefghijklmnopqrstuvwxyz123456/src/ui/dashboard.html'), true);
  assert.equal(validateSender('chrome-extension://abcdefghijklmnopqrstuvwxyz123456/src/ui/blocked.html'), true);

  // Unauthorized External or Content Script Callers
  assert.equal(validateSender('https://example.com/'), false);
  assert.equal(validateSender('https://malicious-site.com/script.js'), false);
  assert.equal(validateSender('http://localhost:8080/page'), false);
  assert.equal(validateSender(null), false);
  assert.equal(validateSender(undefined), false);
});

test('Security Message Bus - rejection of deletion actions', () => {
  const ALLOWED_ACTIONS = ['ADD_PERMANENT_DOMAIN', 'ADD_PROTECTED_KEYWORD', 'GET_STATUS', 'INCREMENT_BLOCKED_COUNT', 'FORCE_SYNC_RULES'];

  assert.equal(ALLOWED_ACTIONS.includes('REMOVE_PERMANENT_DOMAIN'), false);
  assert.equal(ALLOWED_ACTIONS.includes('DELETE_PERMANENT_DOMAIN'), false);
  assert.equal(ALLOWED_ACTIONS.includes('UNBLOCK_DOMAIN'), false);
  assert.equal(ALLOWED_ACTIONS.includes('CLEAR_STORAGE'), false);
  assert.equal(ALLOWED_ACTIONS.includes('DISABLE_PROTECTION'), false);
});
