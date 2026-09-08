import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleCompiler } from '../src/engine/rule-compiler.js';

test('RuleCompiler - compileRules tier compilation and priority ordering', () => {
  const sampleState = {
    permanentDomains: [
      { id: '1', domain: 'distraction.com', createdAt: 1000, source: 'user_permanent' }
    ],
    protectedKeywords: [
      { id: '2', pattern: 'xxx', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: 1000 },
      { id: '3', pattern: 'adult-content', matchScope: 'path_query', action: 'block_page', createdAt: 1000 }
    ],
    filterLists: {
      enabledCategoryAdult: true,
      cachedDomains: ['badadultsite.com']
    },
    settings: {
      searchProtectionEnabled: true
    }
  };

  const compilationResult = RuleCompiler.compileRules(sampleState, 5000);
  const rules = compilationResult.allocatedRules;

  assert.ok(Array.isArray(rules));
  assert.ok(rules.length > 0);

  // Check internal safety rule (priority 10000)
  const extensionSafetyRule = rules.find((r) => r.priority === 10000);
  assert.ok(extensionSafetyRule);
  assert.equal(extensionSafetyRule.action.type, 'allow');

  // Check permanent domain rule (priority 7000)
  const domainRule = rules.find((r) => r.priority === 7000 && r.condition.urlFilter === '||distraction.com^');
  assert.ok(domainRule);
  assert.equal(domainRule.action.type, 'redirect');
  assert.equal(domainRule.action.redirect.extensionPath, '/src/ui/blocked.html');

  // Check category adult domain rule (priority 6000) - MUST BE SAFE 'block' ACTION!
  const categoryRule = rules.find((r) => r.priority === 6000 && r.condition.urlFilter === '||badadultsite.com^');
  assert.ok(categoryRule);
  assert.equal(categoryRule.action.type, 'block', 'Adult category domains must use safe block actions!');

  // Check loop exemption rule (priority 4500)
  const loopExemptionRule = rules.find((r) => r.priority === 4500);
  assert.ok(loopExemptionRule);
  assert.equal(loopExemptionRule.action.type, 'allow');

  // Check custom keyword safe homepage redirect rule (priority 4000)
  const keywordRedirectRule = rules.find((r) => r.priority === 4000 && r.action.redirect?.regexSubstitution === '\\1/');
  assert.ok(keywordRedirectRule);
  assert.ok(keywordRedirectRule.condition.regexFilter.includes('xxx'));

  // Check custom keyword block page rule (priority 4000)
  const keywordBlockRule = rules.find((r) => r.priority === 4000 && (r.condition.urlFilter || r.condition.regexFilter));
  assert.ok(keywordBlockRule);

  // Check SafeSearch rules (priority 1000)
  const searchRules = rules.filter((r) => r.priority === 1000);
  assert.equal(searchRules.length, 3);
});

test('RuleCompiler - Permanent domain homepage is NOT exempted by Priority 4500 exemption rule', () => {
  const sampleState = {
    permanentDomains: [
      { id: '1', domain: 'blocked-site.com', createdAt: 1000, source: 'user_permanent' }
    ],
    protectedKeywords: [
      { id: '2', pattern: 'sex', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: 1000 }
    ]
  };

  const result = RuleCompiler.compileRules(sampleState, 5000);
  const rules = result.allocatedRules;

  const domainRule = rules.find((r) => r.condition.urlFilter === '||blocked-site.com^');
  const exemptionRule = rules.find((r) => r.priority === 4500);

  assert.ok(domainRule);
  assert.ok(exemptionRule);

  // CRITICAL SECURITY ASSERTION:
  // Domain Block Rule priority (7,000) MUST be strictly greater than Exemption Rule priority (4,500)
  // so that blocked-site.com/ is ALWAYS redirected to block page and never allowed by the exemption rule!
  assert.ok(domainRule.priority > exemptionRule.priority);
  assert.equal(domainRule.priority, 7000);
  assert.equal(exemptionRule.priority, 4500);
});

test('RuleCompiler - origin preservation with custom ports', () => {
  const sampleState = {
    protectedKeywords: [
      { id: '1', pattern: 'sex', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: 1000 }
    ]
  };

  const result = RuleCompiler.compileRules(sampleState, 5000);
  const redirectRule = result.allocatedRules.find((r) => r.priority === 4000 && r.action.redirect?.regexSubstitution);

  assert.ok(redirectRule);
  const regex = new RegExp(redirectRule.condition.regexFilter, 'i');

  // Regex captures origin scheme + host + port
  const match = 'https://example.com:8080/videos/sex/123'.match(regex);
  assert.ok(match);
  assert.equal(match[1], 'https://example.com:8080');
});

test('RuleCompiler - Adult category domains use SAFE block rules and do NOT consume unsafe budget', () => {
  const adultDomains = [];
  for (let i = 0; i < 4900; i++) {
    adultDomains.push(`adult-domain-${i}.com`);
  }

  const sampleState = {
    permanentDomains: [
      { id: 'p1', domain: 'user-permanent.com', createdAt: Date.now() }
    ],
    filterLists: {
      enabledCategoryAdult: true,
      cachedDomains: adultDomains
    }
  };

  const limits = {
    maxDynamicRules: 30000,
    maxUnsafeDynamicRules: 5000,
    maxRegexRules: 1000
  };

  const result = RuleCompiler.compileRules(sampleState, limits);

  assert.equal(result.success, true);
  assert.equal(result.totalAllocated, 4905); // 1 safety + 1 permanent + 4,900 adult + 3 search

  // Unsafe rules must ONLY include permanent user domain + 3 search redirect rules (4 unsafe rules total!)
  assert.equal(result.unsafeCount, 4, 'Unsafe rule count must be 4 (1 user permanent domain + 3 search redirect rules)');
  assert.equal(result.safeCount, 4901, 'Safe rule count must include safety rule + 4,900 adult block rules');
  assert.ok(result.unsafeCount <= 5000, 'Unsafe rule count must be <= 5,000 unsafe limit');
});

test('RuleCompiler - Scale test 10,000 adult domains under safe dynamic quota', () => {
  const adultDomains = [];
  for (let i = 0; i < 10000; i++) {
    adultDomains.push(`adult-site-${i}.com`);
  }

  const sampleState = {
    filterLists: {
      enabledCategoryAdult: true,
      cachedDomains: adultDomains
    }
  };

  const result = RuleCompiler.compileRules(sampleState, {
    maxDynamicRules: 30000,
    maxUnsafeDynamicRules: 5000,
    maxRegexRules: 1000
  });

  assert.equal(result.success, true);
  assert.equal(result.totalAllocated, 10004); // 1 safety + 10,000 adult + 3 search
  assert.equal(result.unsafeCount, 3, 'Adult category block rules must not consume unsafe quota (only 3 search redirect rules consume unsafe)');
  assert.equal(result.safeCount, 10001);
});

test('RuleCompiler - Keyword scale test (100 domain-bound block_page keywords use 0 regex rules)', () => {
  const protectedKeywords = [];
  for (let i = 0; i < 100; i++) {
    protectedKeywords.push({
      id: `k_${i}`,
      domain: 'example.com',
      pattern: `keyword-${i}`,
      matchScope: 'path_query',
      action: 'block_page',
      createdAt: Date.now()
    });
  }

  const sampleState = { protectedKeywords };
  const result = RuleCompiler.compileRules(sampleState, {
    maxDynamicRules: 30000,
    maxUnsafeDynamicRules: 5000,
    maxRegexRules: 1000
  });

  assert.equal(result.success, true);
  // Domain-bound block page path_query keywords use urlFilter: "||example.com/*keyword-i", consuming 0 regex rules!
  assert.equal(result.regexCount, 0, 'Domain-bound path_query block_page keywords must use 0 regex rules');
});

test('RuleCompiler - SCHEMA VALIDATION: NO generated rule condition contains BOTH regexFilter and urlFilter', () => {
  const sampleState = {
    permanentDomains: [{ id: 'p1', domain: 'example.com', createdAt: Date.now() }],
    protectedKeywords: [
      { id: 'k1', domain: 'example.com', pattern: 'sex-video', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: Date.now() },
      { id: 'k2', domain: 'mysite.com', pattern: 'adult', matchScope: 'path_query', action: 'block_page', createdAt: Date.now() },
      { id: 'k3', pattern: 'global-bad', matchScope: 'hostname', action: 'block_page', createdAt: Date.now() }
    ],
    filterLists: { enabledCategoryAdult: true, cachedDomains: ['badadult.com'] }
  };

  const result = RuleCompiler.compileRules(sampleState, 30000);
  assert.equal(result.success, true);

  for (const rule of result.allocatedRules) {
    const cond = rule.condition || {};
    const hasRegex = Boolean(cond.regexFilter);
    const hasUrlFilter = Boolean(cond.urlFilter);

    // CRITICAL DNR RULE SCHEMA ASSERTION:
    // Chromium DNR API rejects any rule condition that contains BOTH regexFilter and urlFilter!
    assert.ok(!(hasRegex && hasUrlFilter), `Rule ID ${rule.id} violates DNR schema by containing both regexFilter and urlFilter!`);
  }
});

test('RuleCompiler - Domain-bound Keyword: requestDomains correctly set and domain isolated', () => {
  const sampleState = {
    protectedKeywords: [
      { id: 'k1', domain: 'targetsite.com', pattern: 'sex-video', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: Date.now() }
    ]
  };

  const result = RuleCompiler.compileRules(sampleState, 30000);
  const keywordRule = result.allocatedRules.find((r) => r.priority === 4000);

  assert.ok(keywordRule);
  assert.deepEqual(keywordRule.condition.requestDomains, ['targetsite.com']);
  assert.ok(keywordRule.condition.regexFilter.includes('sex-video'));

  // Test regex match against target origin
  const regex = new RegExp(keywordRule.condition.regexFilter, 'i');
  const matchTarget = 'https://targetsite.com/watch/sex-video'.match(regex);
  assert.ok(matchTarget);
  assert.equal(matchTarget[1], 'https://targetsite.com');
});

test('RuleCompiler - CRITICAL REGRESSION: Keyword rule matches target page but does NOT block normal pages', () => {
  const sampleState = {
    protectedKeywords: [
      { id: 'k1', domain: 'example.com', pattern: 'sex-video', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: Date.now() }
    ]
  };

  const result = RuleCompiler.compileRules(sampleState, 30000);
  const keywordRule = result.allocatedRules.find((r) => r.priority === 4000);
  const regex = new RegExp(keywordRule.condition.regexFilter, 'i');

  // MATCH: URL contains keyword
  assert.ok(regex.test('https://example.com/sex-video'));
  assert.ok(regex.test('https://example.com/watch/sex-video'));
  assert.ok(regex.test('https://example.com/page?q=sex-video'));

  // NO MATCH: Normal pages on same domain MUST remain allowed!
  assert.equal(regex.test('https://example.com/'), false, 'Root homepage must NOT match keyword rule');
  assert.equal(regex.test('https://example.com/about'), false, 'Normal about page must NOT match keyword rule');
  assert.equal(regex.test('https://example.com/movies'), false, 'Normal movies page must NOT match keyword rule');
});

test('RuleCompiler - Safe Homepage Exemption Rule (Priority 4500) regex excludes query strings', () => {
  const sampleState = {
    protectedKeywords: [
      { id: 'k1', domain: 'example.com', pattern: 'sex-video', matchScope: 'path_query', action: 'redirect_safe_home', createdAt: Date.now() }
    ]
  };

  const result = RuleCompiler.compileRules(sampleState, 30000);
  const exemptionRule = result.allocatedRules.find((r) => r.priority === 4500);
  assert.ok(exemptionRule);

  const exemptionRegex = new RegExp(exemptionRule.condition.regexFilter, 'i');

  // MATCH: Clean root homepage and fragments
  assert.equal(exemptionRegex.test('https://example.com/'), true);
  assert.equal(exemptionRegex.test('https://example.com/#top'), true);

  // NO MATCH: Query string URLs MUST NOT be exempted by Priority 4500!
  assert.equal(exemptionRegex.test('https://example.com/?q=sex-video'), false);
  assert.equal(exemptionRegex.test('https://example.com/search?q=sex-video'), false);
});
