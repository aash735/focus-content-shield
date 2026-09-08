import test from 'node:test';
import assert from 'node:assert/strict';
import { CategoryRulesets, CATEGORY_DEFINITIONS } from '../src/categories/category-rulesets.js';

test('CategoryRulesets - retrieves category definitions', () => {
  const adult = CategoryRulesets.getCategory('adult');
  assert.ok(adult);
  assert.equal(adult.name, 'Adult Content');
  assert.ok(adult.domains.length > 0);
});

test('CategoryRulesets - aggregates active category rules correctly', () => {
  const activeState = {
    adult: { enabled: true },
    social: { enabled: true },
    gaming: { enabled: false }
  };

  const compiled = CategoryRulesets.getActiveCategoryRules(activeState);
  assert.ok(compiled.domains.length > 0);
  assert.ok(compiled.domains.includes('facebook.com'));
  assert.ok(compiled.domains.includes('pornhub.com'));
  assert.equal(compiled.domains.includes('steampowered.com'), false);
});
