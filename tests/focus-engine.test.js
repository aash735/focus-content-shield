import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusEngine } from '../src/engine/focus-engine.js';

test('FocusEngine - createSession and evaluation', () => {
  const now = 1000000;
  const session = FocusEngine.createSession(25, ['social', 'entertainment'], false, now);

  assert.equal(session.active, true);
  assert.equal(session.durationMinutes, 25);
  assert.equal(session.endTime, now + 25 * 60 * 1000);

  const evalActive = FocusEngine.evaluateFocusSession(session, now + 5 * 60 * 1000);
  assert.equal(evalActive.active, true);
  assert.equal(evalActive.remainingSeconds, 20 * 60);

  const evalExpired = FocusEngine.evaluateFocusSession(session, now + 30 * 60 * 1000);
  assert.equal(evalExpired.active, false);
  assert.equal(evalExpired.expired, true);
});
