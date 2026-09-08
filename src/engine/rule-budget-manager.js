/**
 * Central Rule-Budget Manager
 * Dynamically calculates browser declarativeNetRequest capacity limits,
 * tracks total dynamic rules, unsafe dynamic rules, and regex rules,
 * prioritizes rule categories in strict protection hierarchy, and truncates filter lists safely.
 *
 * Protection Hierarchy:
 *  1. Extension Safety Rules (Priority 10,000)
 *  2. User Permanent Personal Domains (Priority 7,000)
 *  3. Active Focus Session Rules (Priority 6,500)
 *  4. Active Schedule Rules (Priority 6,200)
 *  5. Category & Adult Filter Domains (Priority 6,000)
 *  6. Keyword Exemption Rules (Priority 4,500)
 *  7. Protected Keyword Rules (Priority 4,000)
 *  8. Search Rules (Priority 1,000)
 */

export const DEFAULT_MAX_DYNAMIC_RULES = 30000;
export const DEFAULT_MAX_UNSAFE_DYNAMIC_RULES = 5000;
export const DEFAULT_MAX_REGEX_RULES = 1000;

export class RuleBudgetManager {
  static isUnsafeRule(rule) {
    if (!rule || !rule.action) return false;
    const type = rule.action.type;
    return ['redirect', 'transformScheme', 'modifyHeaders'].includes(type);
  }

  static isRegexRule(rule) {
    return Boolean(rule && rule.condition && rule.condition.regexFilter);
  }

  static allocateRules(compiledTiers, options = DEFAULT_MAX_DYNAMIC_RULES) {
    let maxDynamicRules = DEFAULT_MAX_DYNAMIC_RULES;
    let maxUnsafeDynamicRules = DEFAULT_MAX_UNSAFE_DYNAMIC_RULES;
    let maxRegexRules = DEFAULT_MAX_REGEX_RULES;

    if (typeof options === 'number') {
      maxDynamicRules = options;
      maxUnsafeDynamicRules = Math.min(options, DEFAULT_MAX_UNSAFE_DYNAMIC_RULES);
    } else if (options && typeof options === 'object') {
      if (typeof options.maxDynamicRules === 'number') maxDynamicRules = options.maxDynamicRules;
      if (typeof options.maxUnsafeDynamicRules === 'number') maxUnsafeDynamicRules = options.maxUnsafeDynamicRules;
      if (typeof options.maxRegexRules === 'number') maxRegexRules = options.maxRegexRules;
    }

    let remainingTotalBudget = maxDynamicRules;
    let remainingUnsafeBudget = maxUnsafeDynamicRules;
    let remainingRegexBudget = maxRegexRules;

    const allocatedRules = [];
    let totalRequestedCount = 0;
    let categoryTruncatedCount = 0;
    let safeCount = 0;
    let unsafeCount = 0;
    let regexCount = 0;

    const canFit = (rule) => {
      if (remainingTotalBudget <= 0) return false;
      const unsafe = RuleBudgetManager.isUnsafeRule(rule);
      const regex = RuleBudgetManager.isRegexRule(rule);
      if (unsafe && remainingUnsafeBudget <= 0) return false;
      if (regex && remainingRegexBudget <= 0) return false;
      return true;
    };

    const consume = (rule) => {
      remainingTotalBudget--;
      const isUnsafe = RuleBudgetManager.isUnsafeRule(rule);
      const isRegex = RuleBudgetManager.isRegexRule(rule);

      if (isUnsafe) {
        remainingUnsafeBudget--;
        unsafeCount++;
      } else {
        safeCount++;
      }

      if (isRegex) {
        remainingRegexBudget--;
        regexCount++;
      }
    };

    // Helper to allocate a tier
    const processTier = (rules, isMandatory = false, isCategory = false) => {
      if (!Array.isArray(rules)) return true;
      totalRequestedCount += rules.length;

      for (let rule of rules) {
        if (!canFit(rule) && RuleBudgetManager.isUnsafeRule(rule) && remainingUnsafeBudget <= 0 && remainingTotalBudget > 0) {
          // Fallback unsafe redirect to safe block action
          rule = JSON.parse(JSON.stringify(rule));
          rule.action = { type: 'block' };
        }

        if (canFit(rule)) {
          allocatedRules.push(rule);
          consume(rule);
        } else if (isMandatory) {
          return false;
        } else if (isCategory) {
          categoryTruncatedCount++;
        }
      }
      return true;
    };

    // Tier 1: Extension Safety Rules (Priority 10,000)
    if (!processTier(compiledTiers.safetyRules, true)) {
      return { success: false, error: 'CAPACITY_EXCEEDED_SAFETY_RULES', allocatedRules: [] };
    }

    // Tier 2: Permanent Personal Domains (Priority 7,000)
    if (!processTier(compiledTiers.permanentDomainRules, true)) {
      return {
        success: false,
        error: 'PERMANENT_DOMAIN_CAPACITY_EXCEEDED: User permanent domains exceed browser dynamic rule budget.',
        allocatedRules: []
      };
    }

    // Tier 3: Active Focus Session Rules (Priority 6,500)
    processTier(compiledTiers.focusRules);

    // Tier 4: Active Schedule Rules (Priority 6,200)
    processTier(compiledTiers.scheduleRules);

    // Tier 5: Category Adult & Managed Rules (Priority 6,000)
    processTier(compiledTiers.categoryAdultRules, false, true);

    // Tier 6: Keyword Exemptions (Priority 4,500) & Protected Keywords (Priority 4,000)
    processTier(compiledTiers.keywordExemptionRules);
    processTier(compiledTiers.keywordRules);

    // Tier 7: Search Engine SafeSearch Enforcement (Priority 1,000)
    processTier(compiledTiers.searchRules);

    // Validate mutual exclusion for all allocated rules
    for (const rule of allocatedRules) {
      const cond = rule.condition || {};
      if (cond.urlFilter && cond.regexFilter) {
        return {
          success: false,
          error: `INVALID_RULE_CONDITION: Rule ${rule.id} contains both urlFilter and regexFilter, which are mutually exclusive.`,
          allocatedRules: []
        };
      }
    }

    return {
      success: true,
      allocatedRules,
      totalRequested: totalRequestedCount,
      totalAllocated: allocatedRules.length,
      safeCount,
      unsafeCount,
      regexCount,
      categoryTruncatedCount,
      remainingBudget: remainingTotalBudget,
      remainingUnsafeBudget,
      remainingRegexBudget,
      limits: { maxDynamicRules, maxUnsafeDynamicRules, maxRegexRules },
      error: null
    };
  }
}

export default RuleBudgetManager;
