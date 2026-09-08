/**
 * declarativeNetRequest (DNR) Rule Compiler
 * Translates stored domain blocklists, category managed rulesets, schedule rules, focus sessions,
 * and keyword patterns into high-performance native browser rules.
 *
 * Tier Hierarchy:
 *  - Priority 10,000: Internal Extension Resource Safety
 *  - Priority 7,000: Tier 1 Permanent Personal Block Domains
 *  - Priority 6,500: Tier 2 Active Focus Session Block Rules
 *  - Priority 6,200: Tier 3 Active Recurring Schedule Block Rules
 *  - Priority 6,000: Tier 4 Category Managed Rulesets (Adult, Social, Gaming, etc.)
 *  - Priority 4,500: Tier 5 Keyword Safe Homepage Loop Exemption
 *  - Priority 4,000: Tier 5 Custom Protected Keywords / Patterns
 *  - Priority 1,000: Tier 6 Search Engine SafeSearch Enforcement
 */

import { UrlNormalizer } from './url-normalizer.js';
import { RuleBudgetManager, DEFAULT_MAX_DYNAMIC_RULES } from './rule-budget-manager.js';
import { CategoryRulesets } from '../categories/category-rulesets.js';
import { ScheduleEngine } from './schedule-engine.js';
import { FocusEngine } from './focus-engine.js';

export class RuleCompiler {
  /**
   * Compiles complete declarativeNetRequest dynamic rule set from state.
   */
  static compileRules(state, limits = DEFAULT_MAX_DYNAMIC_RULES) {
    const tiers = {
      safetyRules: [],
      permanentDomainRules: [],
      focusRules: [],
      scheduleRules: [],
      categoryAdultRules: [],
      keywordExemptionRules: [],
      keywordRules: [],
      searchRules: []
    };

    let currentId = 100;
    const extensionBlockedPageUrl = '/src/ui/blocked.html';
    const seenDomains = new Set();
    const seenKeywords = new Set();

    // Tier 0. Internal Extension Resource Safety (Priority 10,000)
    tiers.safetyRules.push({
      id: currentId++,
      priority: 10000,
      action: { type: 'allow' },
      condition: {
        urlFilter: 'chrome-extension://*',
        resourceTypes: ['main_frame', 'sub_frame']
      }
    });

    // Tier 1. Permanent Personal Blocklist Domains (Priority 7,000)
    const permanentDomains = state.permanentDomains || [];
    for (const entry of permanentDomains) {
      const canonical = UrlNormalizer.canonicalizeDomain(entry.domain);
      if (canonical && !seenDomains.has(canonical)) {
        seenDomains.add(canonical);
        tiers.permanentDomainRules.push({
          id: currentId++,
          priority: 7000,
          action: {
            type: 'redirect',
            redirect: { extensionPath: extensionBlockedPageUrl }
          },
          condition: {
            urlFilter: `||${canonical}^`,
            resourceTypes: ['main_frame', 'sub_frame'],
            isUrlFilterCaseSensitive: false
          }
        });
      }
    }

    // Tier 2. Active Focus Session Rules (Priority 6,500)
    const focusEval = FocusEngine.evaluateFocusSession(state.focusSession);
    if (focusEval.active) {
      const focusCatRules = CategoryRulesets.getActiveCategoryRules(
        focusEval.blockCategories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {})
      );

      for (const dom of focusCatRules.domains) {
        const canonical = UrlNormalizer.canonicalizeDomain(dom);
        if (canonical && !seenDomains.has(canonical)) {
          seenDomains.add(canonical);
          tiers.focusRules.push({
            id: currentId++,
            priority: 6500,
            action: { type: 'block' },
            condition: {
              urlFilter: `||${canonical}^`,
              resourceTypes: ['main_frame', 'sub_frame'],
              isUrlFilterCaseSensitive: false
            }
          });
        }
      }

      for (const kw of focusCatRules.keywords) {
        const keyword = UrlNormalizer.canonicalizeKeyword(kw);
        if (keyword && !seenKeywords.has(`focus|${keyword}`)) {
          seenKeywords.add(`focus|${keyword}`);
          tiers.focusRules.push({
            id: currentId++,
            priority: 6500,
            action: { type: 'block' },
            condition: {
              urlFilter: `/*${keyword}`,
              resourceTypes: ['main_frame', 'sub_frame'],
              isUrlFilterCaseSensitive: false
            }
          });
        }
      }
    }

    // Tier 3. Active Recurring Schedule Rules (Priority 6,200)
    const scheduleEval = ScheduleEngine.evaluateSchedules(state.schedules);
    if (scheduleEval.active) {
      const schedCatRules = CategoryRulesets.getActiveCategoryRules(
        scheduleEval.activeCategories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {})
      );

      const allSchedDomains = [...scheduleEval.activeDomains, ...schedCatRules.domains];
      const allSchedKeywords = [...scheduleEval.activeKeywords, ...schedCatRules.keywords];

      for (const dom of allSchedDomains) {
        const canonical = UrlNormalizer.canonicalizeDomain(dom);
        if (canonical && !seenDomains.has(canonical)) {
          seenDomains.add(canonical);
          tiers.scheduleRules.push({
            id: currentId++,
            priority: 6200,
            action: { type: 'block' },
            condition: {
              urlFilter: `||${canonical}^`,
              resourceTypes: ['main_frame', 'sub_frame'],
              isUrlFilterCaseSensitive: false
            }
          });
        }
      }

      for (const kw of allSchedKeywords) {
        const keyword = UrlNormalizer.canonicalizeKeyword(kw);
        if (keyword && !seenKeywords.has(`sched|${keyword}`)) {
          seenKeywords.add(`sched|${keyword}`);
          tiers.scheduleRules.push({
            id: currentId++,
            priority: 6200,
            action: { type: 'block' },
            condition: {
              urlFilter: `/*${keyword}`,
              resourceTypes: ['main_frame', 'sub_frame'],
              isUrlFilterCaseSensitive: false
            }
          });
        }
      }
    }

    // Tier 4. Category & Adult Filter Domains (Priority 6,000)
    const activeCatRules = CategoryRulesets.getActiveCategoryRules(state.categories || {});
    const cachedAdultDomains = state.filterLists?.cachedDomains || [];
    const allCatDomains = [...activeCatRules.domains, ...cachedAdultDomains];

    for (const domain of allCatDomains) {
      const canonical = UrlNormalizer.canonicalizeDomain(domain);
      if (canonical && !seenDomains.has(canonical)) {
        seenDomains.add(canonical);
        tiers.categoryAdultRules.push({
          id: currentId++,
          priority: 6000,
          action: { type: 'block' },
          condition: {
            urlFilter: `||${canonical}^`,
            resourceTypes: ['main_frame', 'sub_frame'],
            isUrlFilterCaseSensitive: false
          }
        });
      }
    }

    for (const kw of activeCatRules.keywords) {
      const keyword = UrlNormalizer.canonicalizeKeyword(kw);
      if (keyword && !seenKeywords.has(`cat|${keyword}`)) {
        seenKeywords.add(`cat|${keyword}`);
        tiers.categoryAdultRules.push({
          id: currentId++,
          priority: 6000,
          action: { type: 'block' },
          condition: {
            urlFilter: `/*${keyword}`,
            resourceTypes: ['main_frame', 'sub_frame'],
            isUrlFilterCaseSensitive: false
          }
        });
      }
    }

    // Tier 5. Custom Protected Keywords & Path Patterns
    const protectedKeywords = state.protectedKeywords || [];
    let hasSafeHomeRedirectRule = false;

    for (const item of protectedKeywords) {
      const keyword = UrlNormalizer.canonicalizeKeyword(item.pattern);
      if (keyword) {
        const matchScope = item.matchScope || item.matchTarget || 'path_query';
        const actionType = item.action || 'redirect_safe_home';
        const targetDomain = item.domain ? UrlNormalizer.canonicalizeDomain(item.domain) : null;
        const wordMatchMode = item.wordMatchMode || 'contains';
        const isCaseSensitive = Boolean(item.caseSensitive);

        const key = `${targetDomain || '*'}|${keyword}|${matchScope}|${wordMatchMode}|${actionType}`;

        if (!seenKeywords.has(key)) {
          seenKeywords.add(key);

          const condition = {
            resourceTypes: ['main_frame', 'sub_frame'],
            isUrlFilterCaseSensitive: isCaseSensitive
          };

          if (targetDomain) {
            condition.requestDomains = [targetDomain];
          }

          if (actionType === 'block_page') {
            const blockPagePath = `${extensionBlockedPageUrl}?reason=word&word=${encodeURIComponent(item.pattern)}`;

            if (matchScope === 'path_query' && wordMatchMode === 'contains') {
              if (targetDomain) {
                condition.urlFilter = `||${targetDomain}/*${keyword}`;
              } else {
                condition.regexFilter = UrlNormalizer.buildKeywordRegexFilter(keyword, 'path_query', wordMatchMode, isCaseSensitive);
              }
            } else if (matchScope === 'full_url' && wordMatchMode === 'contains') {
              if (targetDomain) {
                condition.urlFilter = `||${targetDomain}/*${keyword}*`;
              } else {
                condition.urlFilter = keyword;
              }
            } else {
              condition.regexFilter = UrlNormalizer.buildKeywordRegexFilter(keyword, matchScope, wordMatchMode, isCaseSensitive);
            }

            tiers.keywordRules.push({
              id: currentId++,
              priority: 4000,
              action: {
                type: 'redirect',
                redirect: { extensionPath: blockPagePath }
              },
              condition
            });
          } else {
            condition.regexFilter = UrlNormalizer.buildKeywordRegexFilter(keyword, matchScope, wordMatchMode, isCaseSensitive);

            tiers.keywordRules.push({
              id: currentId++,
              priority: 4000,
              action: {
                type: 'redirect',
                redirect: {
                  regexSubstitution: '\\1/'
                }
              },
              condition
            });

            hasSafeHomeRedirectRule = true;
          }
        }
      }
    }

    // Tier 5 Exemption: Safe Homepage Loop Exemption (Priority 4,500)
    if (hasSafeHomeRedirectRule) {
      tiers.keywordExemptionRules.push({
        id: currentId++,
        priority: 4500,
        action: { type: 'allow' },
        condition: {
          regexFilter: `^https?://[^/:]+(?::\\d+)?/(?:#.*)?$`,
          resourceTypes: ['main_frame', 'sub_frame']
        }
      });
    }

    // Tier 6. Search Engine SafeSearch Enforcement (Priority 1,000)
    tiers.searchRules.push({
      id: currentId++,
      priority: 1000,
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: [{ key: 'safe', value: 'active' }]
            }
          }
        }
      },
      condition: {
        urlFilter: '||google.*/search*',
        resourceTypes: ['main_frame']
      }
    });

    tiers.searchRules.push({
      id: currentId++,
      priority: 1000,
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: [{ key: 'kp', value: '1' }]
            }
          }
        }
      },
      condition: {
        urlFilter: '||duckduckgo.com/*',
        resourceTypes: ['main_frame']
      }
    });

    tiers.searchRules.push({
      id: currentId++,
      priority: 1000,
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: [{ key: 'adlt', value: 'strict' }]
            }
          }
        }
      },
      condition: {
        urlFilter: '||bing.com/search*',
        resourceTypes: ['main_frame']
      }
    });

    return RuleBudgetManager.allocateRules(tiers, limits);
  }
}

export default RuleCompiler;
