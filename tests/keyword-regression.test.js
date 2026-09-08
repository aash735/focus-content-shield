import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RuleCompiler } from '../src/engine/rule-compiler.js';
import { UrlNormalizer } from '../src/engine/url-normalizer.js';

describe('Word & Keyword Protection Regression Suite — 9 Mandatory Test Cases', () => {

  const keywordState = {
    permanentDomains: [],
    protectedKeywords: [
      {
        id: 'kw_test_1',
        type: 'word',
        scope: 'domain',
        domain: '9xmovies.cologne',
        pattern: 'feelapp',
        matchTarget: 'path_query',
        matchScope: 'path_query',
        wordMatchMode: 'contains',
        action: 'block_page',
        createdAt: Date.now()
      },
      {
        id: 'kw_test_2',
        type: 'word',
        scope: 'global',
        domain: null,
        pattern: 'ullu',
        matchTarget: 'path_query',
        matchScope: 'path_query',
        wordMatchMode: 'contains',
        action: 'block_page',
        createdAt: Date.now()
      }
    ],
    categories: {},
    schedules: [],
    focusSession: { active: false }
  };

  const compiled = RuleCompiler.compileRules(keywordState);

  // Helper to check if a URL matches any compiled rule
  function evaluateUrlAgainstRules(urlStr, rules) {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();

    for (const rule of rules) {
      if (rule.action.type === 'allow') continue;

      const cond = rule.condition;

      // Check domain match
      if (cond.requestDomains && cond.requestDomains.length > 0) {
        const matchesReqDom = cond.requestDomains.some(
          (d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase())
        );
        if (!matchesReqDom) continue;
      }

      // Check urlFilter
      if (cond.urlFilter) {
        if (cond.urlFilter.startsWith('||')) {
          const filterBody = cond.urlFilter.slice(2);
          const slashIdx = filterBody.indexOf('/');
          if (slashIdx !== -1) {
            const filterDom = filterBody.slice(0, slashIdx).toLowerCase();
            const filterPathPattern = filterBody.slice(slashIdx); // e.g. "/*feelapp"
            const matchesDom = host === filterDom || host.endsWith('.' + filterDom);
            if (!matchesDom) continue;

            const pathQuery = (url.pathname + url.search + url.hash).toLowerCase();
            const kwPattern = filterPathPattern.replace(/^\/\*/, '').replace(/\*$/, '').toLowerCase();
            if (pathQuery.includes(kwPattern)) {
              return { blocked: true, rule };
            }
          } else {
            const filterDom = filterBody.replace(/\^$/, '').toLowerCase();
            if (host === filterDom || host.endsWith('.' + filterDom)) {
              return { blocked: true, rule };
            }
          }
        } else if (cond.urlFilter.startsWith('/*')) {
          const kwPattern = cond.urlFilter.slice(2).toLowerCase();
          const fullDecoded = UrlNormalizer.normalizeFullUrl(urlStr);
          if (fullDecoded.includes(kwPattern)) {
            return { blocked: true, rule };
          }
        }
      }

      // Check regexFilter
      if (cond.regexFilter) {
        const flags = cond.isUrlFilterCaseSensitive ? '' : 'i';
        const regex = new RegExp(cond.regexFilter, flags);
        if (regex.test(urlStr)) {
          return { blocked: true, rule };
        }
      }
    }

    return { blocked: false };
  }

  it('Test 1 — ROOT ACCESS: https://9xmovies.cologne/ must be ALLOWED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/', compiled.allocatedRules);
    assert.strictEqual(res.blocked, false, 'Root URL must remain accessible when domain is not permanently blocked');
  });

  it('Test 2 — QUERY BLOCK: https://9xmovies.cologne/?s=feelapp must be BLOCKED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/?s=feelapp', compiled.allocatedRules);
    assert.strictEqual(res.blocked, true, 'URL containing matching keyword in query string must be blocked');
  });

  it('Test 3 — DIFFERENT QUERY: https://9xmovies.cologne/?s=hello must be ALLOWED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/?s=hello', compiled.allocatedRules);
    assert.strictEqual(res.blocked, false, 'URL with unrelated query parameter must be allowed');
  });

  it('Test 4 — UNRELATED PATH: https://9xmovies.cologne/movies must be ALLOWED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/movies', compiled.allocatedRules);
    assert.strictEqual(res.blocked, false, 'Unrelated URL path must be allowed');
  });

  it('Test 5 — PATH MATCH: https://9xmovies.cologne/watch/feelapp must be BLOCKED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/watch/feelapp', compiled.allocatedRules);
    assert.strictEqual(res.blocked, true, 'URL containing matching keyword in path must be blocked');
  });

  it('Test 6 — UNRELATED DOMAIN: https://example.com/?s=feelapp must be ALLOWED', () => {
    const res = evaluateUrlAgainstRules('https://example.com/?s=feelapp', compiled.allocatedRules);
    assert.strictEqual(res.blocked, false, 'Unrelated domain must remain accessible for domain-scoped rule');
  });

  it('Test 7 — CASE INSENSITIVE: https://9xmovies.cologne/?s=FEELAPP must be BLOCKED', () => {
    const res = evaluateUrlAgainstRules('https://9xmovies.cologne/?s=FEELAPP', compiled.allocatedRules);
    assert.strictEqual(res.blocked, true, 'Uppercase query parameter must match under case-insensitive rule');
  });

  it('Test 8 — LOOKALIKE DOMAIN: https://not9xmovies.cologne/?s=feelapp must be ALLOWED', () => {
    const res = evaluateUrlAgainstRules('https://not9xmovies.cologne/?s=feelapp', compiled.allocatedRules);
    assert.strictEqual(res.blocked, false, 'Lookalike domain must not be accidentally matched');
  });

  it('Test 9 — PERMANENT DOMAIN: Adding 9xmovies.cologne permanently blocks ALL URLs on that domain', () => {
    const permState = {
      ...keywordState,
      permanentDomains: [
        { id: 'perm_1', domain: '9xmovies.cologne', createdAt: Date.now() }
      ]
    };

    const permCompiled = RuleCompiler.compileRules(permState);

    const rootRes = evaluateUrlAgainstRules('https://9xmovies.cologne/', permCompiled.allocatedRules);
    assert.strictEqual(rootRes.blocked, true, 'Root homepage must be blocked under Permanent Domain Protection');

    const queryRes = evaluateUrlAgainstRules('https://9xmovies.cologne/?s=hello', permCompiled.allocatedRules);
    assert.strictEqual(queryRes.blocked, true, 'All query URLs must be blocked under Permanent Domain Protection');

    const pathRes = evaluateUrlAgainstRules('https://9xmovies.cologne/movies', permCompiled.allocatedRules);
    assert.strictEqual(pathRes.blocked, true, 'All path URLs must be blocked under Permanent Domain Protection');
  });

  it('Test 10 — GLOBAL WORD: Global word "ullu" protects matching query URL on any host', () => {
    const queryRes = evaluateUrlAgainstRules('https://example.com/?search=ullu', compiled.allocatedRules);
    assert.strictEqual(queryRes.blocked, true, 'Global word rule must block matching URL');

    const rootRes = evaluateUrlAgainstRules('https://example.com/', compiled.allocatedRules);
    assert.strictEqual(rootRes.blocked, false, 'Global word rule must NOT block root homepage');
  });
});
