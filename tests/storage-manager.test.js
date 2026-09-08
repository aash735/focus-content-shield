import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageManager } from '../src/storage/storage-manager.js';

class MockStorageDriver {
  constructor() {
    this.store = {};
  }
  async get(keys) {
    if (!keys) return { ...this.store };
    if (typeof keys === 'string') return { [keys]: this.store[keys] };
    const res = {};
    for (const k of keys) {
      if (this.store[k] !== undefined) res[k] = this.store[k];
    }
    return res;
  }
  async set(items) {
    Object.assign(this.store, items);
  }
  async clear() {
    this.store = {};
  }
}

test('StorageManager - initialization and default schema', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  const state = await sm.getState();
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.permanentDomains, []);
  assert.deepEqual(state.protectedKeywords, []);
  assert.equal(state.statistics.totalBlockedAttempts, 0);
});

test('StorageManager - addPermanentDomain administrative removal lock', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  const res1 = await sm.addPermanentDomain('HTTP://WWW.Distraction-Site.COM/');
  assert.equal(res1.success, true);
  assert.equal(res1.duplicate, false);
  assert.equal(res1.entry.domain, 'distraction-site.com');

  // Verify duplicate addition handles gracefully
  const res2 = await sm.addPermanentDomain('distraction-site.com');
  assert.equal(res2.success, true);
  assert.equal(res2.duplicate, true);

  const state = await sm.getState();
  assert.equal(state.permanentDomains.length, 1);
  assert.equal(state.permanentDomains[0].domain, 'distraction-site.com');

  // Verify NO delete, remove, or unblock direct legacy methods exist without transactional auth
  assert.equal(sm.deletePermanentDomain, undefined);
  assert.equal(sm.unblockDomain, undefined);
  assert.equal(sm.clearAllDomains, undefined);
});

test('StorageManager - addPermanentDomainTransactional rollback on DNR sync failure', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  // Mock sync callback that fails (e.g. DNR rule budget limit exceeded)
  const failingSyncCallback = async (candidateState) => {
    return { success: false, error: 'PERMANENT_DOMAIN_CAPACITY_EXCEEDED' };
  };

  const result = await sm.addPermanentDomainTransactional('overflow-domain.com', failingSyncCallback);

  // Transaction MUST fail and return error
  assert.equal(result.success, false);
  assert.equal(result.error, 'PERMANENT_DOMAIN_CAPACITY_EXCEEDED');

  // Candidate domain MUST NOT exist in persistent storage!
  const state = await sm.getState();
  assert.equal(state.permanentDomains.length, 0);
});

test('StorageManager - addProtectedKeywordTransactional success commit', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  const successSyncCallback = async (candidateState) => {
    return { success: true };
  };

  const result = await sm.addProtectedKeywordTransactional('porn', 'path_query', 'redirect_safe_home', successSyncCallback, 'example.com');

  assert.equal(result.success, true);
  assert.equal(result.entry.pattern, 'porn');
  assert.equal(result.entry.domain, 'example.com');

  const state = await sm.getState();
  assert.equal(state.protectedKeywords.length, 1);
  assert.equal(state.protectedKeywords[0].domain, 'example.com');
});

test('StorageManager - input validation and duplicate prevention for domains and keywords', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  // Invalid domain
  const invalidDomRes = await sm.addPermanentDomainTransactional('invalid_domain_name!!');
  assert.equal(invalidDomRes.success, false);
  assert.ok(invalidDomRes.error.includes('INVALID_DOMAIN'));

  // Invalid empty keyword
  const invalidKwRes = await sm.addProtectedKeywordTransactional('a'); // < 2 chars
  assert.equal(invalidKwRes.success, false);
  assert.ok(invalidKwRes.error.includes('INVALID_KEYWORD'));

  // Duplicate domain
  await sm.addPermanentDomainTransactional('example.com');
  const dupDomRes = await sm.addPermanentDomainTransactional('EXAMPLE.COM');
  assert.equal(dupDomRes.success, true);
  assert.equal(dupDomRes.duplicate, true);

  // Duplicate keyword for same domain
  await sm.addProtectedKeywordTransactional('sex-video', 'path_query', 'redirect_safe_home', null, 'example.com');
  const dupKwRes = await sm.addProtectedKeywordTransactional('sex-video', 'path_query', 'redirect_safe_home', null, 'example.com');
  assert.equal(dupKwRes.success, true);
  assert.equal(dupKwRes.duplicate, true);

  // Reject domain input containing path
  const pathDomRes = await sm.addPermanentDomainTransactional('example.com/movies');
  assert.equal(pathDomRes.success, false);
  assert.ok(pathDomRes.error.includes('INVALID_DOMAIN'));
});

test('StorageManager - concurrent transactional additions are serialized by mutex', async () => {
  const driver = new MockStorageDriver();
  const sm = new StorageManager(driver);

  let syncCount = 0;
  const syncCallback = async (candidateState) => {
    syncCount++;
    // Simulate async DNR sync latency
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { success: true };
  };

  // Launch 5 concurrent transactional additions rapidly
  const promises = [
    sm.addPermanentDomainTransactional('site1.com', syncCallback),
    sm.addPermanentDomainTransactional('site2.com', syncCallback),
    sm.addPermanentDomainTransactional('site3.com', syncCallback),
    sm.addProtectedKeywordTransactional('kw1', 'path_query', 'redirect_safe_home', syncCallback, 'site1.com'),
    sm.addProtectedKeywordTransactional('kw2', 'path_query', 'redirect_safe_home', syncCallback, 'site2.com')
  ];

  const results = await Promise.all(promises);

  // All 5 transactions must succeed
  assert.equal(results.filter((r) => r.success).length, 5);
  assert.equal(syncCount, 5);

  // Storage state must reflect all 3 permanent domains and 2 keywords without dropping any
  const finalState = await sm.getState();
  assert.equal(finalState.permanentDomains.length, 3);
  assert.equal(finalState.protectedKeywords.length, 2);
});
