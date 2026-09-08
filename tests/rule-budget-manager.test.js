import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleBudgetManager } from '../src/engine/rule-budget-manager.js';
import { RuleCompiler } from '../src/engine/rule-compiler.js';

test('RuleBudgetManager - strict protection hierarchy allocation order', () => {
  const mockTiers = {
    safetyRules: [{ id: 1, priority: 10000 }],
    permanentDomainRules: [{ id: 2, priority: 7000 }, { id: 3, priority: 7000 }],
    categoryAdultRules: [{ id: 4, priority: 6000 }, { id: 5, priority: 6000 }],
    keywordExemptionRules: [{ id: 6, priority: 4500 }],
    keywordRules: [{ id: 7, priority: 4000 }],
    searchRules: [{ id: 8, priority: 1000 }]
  };

  // Test with budget of 4 rules: Safety (1) + Permanent (2) + Category Adult (1) = 4
  const result = RuleBudgetManager.allocateRules(mockTiers, 4);

  assert.equal(result.success, true);
  assert.equal(result.totalAllocated, 4);
  assert.equal(result.categoryTruncatedCount, 1);
  assert.equal(result.remainingBudget, 0);

  // Assert exact order: Safety (1), Permanent (2,3), Category Adult (4)
  const allocatedIds = result.allocatedRules.map((r) => r.id);
  assert.deepEqual(allocatedIds, [1, 2, 3, 4]);
});

test('RuleBudgetManager - stress test 100 personal domains under budget', () => {
  const permanentDomains = [];
  for (let i = 0; i < 100; i++) {
    permanentDomains.push({ id: `id_${i}`, domain: `domain${i}.com`, createdAt: Date.now() });
  }

  const sampleState = {
    permanentDomains,
    filterLists: { enabledCategoryAdult: true, cachedDomains: ['adult1.com', 'adult2.com'] },
    protectedKeywords: [{ id: 'k1', pattern: 'xxx', matchScope: 'path_query', action: 'redirect_safe_home' }],
    settings: { searchProtectionEnabled: true }
  };

  const result = RuleCompiler.compileRules(sampleState, 5000);
  assert.equal(result.success, true);
  assert.ok(result.allocatedRules.length >= 100);

  // Check unique rule IDs
  const ruleIds = result.allocatedRules.map((r) => r.id);
  const uniqueIds = new Set(ruleIds);
  assert.equal(ruleIds.length, uniqueIds.size);

  // Verify all 100 personal domain rules are present
  const permRules = result.allocatedRules.filter((r) => r.priority === 7000);
  assert.equal(permRules.length, 100);
});

test('RuleBudgetManager - fail-safe behavior when permanent domains exceed budget limit', () => {
  const permanentDomains = [];
  // Generate 5,005 permanent domains (exceeding 5,000 budget limit)
  for (let i = 0; i < 5005; i++) {
    permanentDomains.push({ id: `id_${i}`, domain: `domain${i}.com`, createdAt: Date.now() });
  }

  const sampleState = { permanentDomains };
  const result = RuleCompiler.compileRules(sampleState, 5000);

  // Must fail safely and not report success!
  assert.equal(result.success, false);
  assert.ok(result.error.includes('PERMANENT_DOMAIN_CAPACITY_EXCEEDED'));
  assert.equal(result.allocatedRules.length, 0);
});

test('RuleBudgetManager - rule classification helpers (isUnsafeRule & isRegexRule)', () => {
  assert.equal(RuleBudgetManager.isUnsafeRule({ action: { type: 'redirect' } }), true);
  assert.equal(RuleBudgetManager.isUnsafeRule({ action: { type: 'transformScheme' } }), true);
  assert.equal(RuleBudgetManager.isUnsafeRule({ action: { type: 'block' } }), false);
  assert.equal(RuleBudgetManager.isUnsafeRule({ action: { type: 'allow' } }), false);

  assert.equal(RuleBudgetManager.isRegexRule({ condition: { regexFilter: '.*sex.*' } }), true);
  assert.equal(RuleBudgetManager.isRegexRule({ condition: { urlFilter: '||example.com^' } }), false);
});

test('RuleBudgetManager - multi-capacity limit tracking (unsafe rules quota)', () => {
  const mockTiers = {
    safetyRules: [{ id: 1, priority: 10000, action: { type: 'allow' } }],
    permanentDomainRules: [
      { id: 2, priority: 7000, action: { type: 'redirect' } },
      { id: 3, priority: 7000, action: { type: 'redirect' } },
      { id: 4, priority: 7000, action: { type: 'redirect' } }
    ],
    categoryAdultRules: [
      { id: 5, priority: 6000, action: { type: 'redirect' } },
      { id: 6, priority: 6000, action: { type: 'redirect' } }
    ]
  };

  // Limit: maxDynamicRules = 10, maxUnsafeDynamicRules = 2
  const result = RuleBudgetManager.allocateRules(mockTiers, {
    maxDynamicRules: 10,
    maxUnsafeDynamicRules: 2,
    maxRegexRules: 10
  });

  assert.equal(result.success, true);
  // First 2 permanent domain rules consume unsafe budget (2). 3rd permanent domain rule falls back to safe 'block' action!
  assert.equal(result.allocatedRules.length, 6); // Safety + 3 Permanent + 2 Category Adult (converted to block)

  const unsafeAllocated = result.allocatedRules.filter(r => RuleBudgetManager.isUnsafeRule(r));
  assert.ok(unsafeAllocated.length <= 2, `Allocated unsafe rules (${unsafeAllocated.length}) must not exceed limit (2)`);
});

test('RuleBudgetManager - regex rule limit enforcing', () => {
  const mockTiers = {
    safetyRules: [{ id: 1, priority: 10000, action: { type: 'allow' } }],
    keywordRules: [
      { id: 2, priority: 4000, action: { type: 'redirect' }, condition: { regexFilter: 'r1' } },
      { id: 3, priority: 4000, action: { type: 'redirect' }, condition: { regexFilter: 'r2' } },
      { id: 4, priority: 4000, action: { type: 'redirect' }, condition: { regexFilter: 'r3' } }
    ]
  };

  const result = RuleBudgetManager.allocateRules(mockTiers, {
    maxDynamicRules: 10,
    maxUnsafeDynamicRules: 10,
    maxRegexRules: 2
  });

  assert.equal(result.success, true);
  const regexAllocated = result.allocatedRules.filter(r => RuleBudgetManager.isRegexRule(r));
  assert.equal(regexAllocated.length, 2, 'Must allocate exactly 2 regex rules matching maxRegexRules limit');
});

