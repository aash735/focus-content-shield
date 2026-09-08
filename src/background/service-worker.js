/**
 * Extension Background Service Worker
 * Manages extension state, declarativeNetRequest rule synchronization, secure messaging,
 * right-click context menus, and alarms.
 */

import { browserCompat } from '../utils/browser-compat.js';
import { StorageManager } from '../storage/storage-manager.js';
import { RuleCompiler } from '../engine/rule-compiler.js';
import { RuleBudgetManager } from '../engine/rule-budget-manager.js';
import { FilterListManager } from '../services/filter-list-manager.js';
import { ContextMenuHandler } from './context-menu-handler.js';
import { CryptoUtils } from '../utils/crypto-utils.js';
import { ImportExportService } from '../services/import-export-service.js';

const storageManager = new StorageManager();

let lastSyncStatus = 'INITIALIZING';
let lastSyncError = null;
let lastSyncTimestamp = Date.now();

/**
 * Re-compiles active or candidate state and updates Chromium declarativeNetRequest dynamic rules.
 */
async function syncDeclarativeRules(targetState = null) {
  try {
    const state = targetState || (await storageManager.getState());

    const dnrApi = browserCompat.api?.declarativeNetRequest;
    const limits = {
      maxDynamicRules: dnrApi?.MAX_NUMBER_OF_DYNAMIC_RULES || 30000,
      maxUnsafeDynamicRules: dnrApi?.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5000,
      maxRegexRules: dnrApi?.MAX_NUMBER_OF_REGEX_RULES || 1000
    };

    const compilationResult = RuleCompiler.compileRules(state, limits);

    if (!compilationResult || compilationResult.success === false) {
      lastSyncStatus = 'FAILED';
      lastSyncError = compilationResult?.error || 'RULE_ALLOCATION_FAILED';
      lastSyncTimestamp = Date.now();
      return { success: false, error: lastSyncError };
    }

    const {
      allocatedRules,
      categoryTruncatedCount,
      safeCount = 0,
      unsafeCount = 0,
      regexCount = 0
    } = compilationResult;

    const existingRules = await browserCompat.dnr.getDynamicRules();
    const removeRuleIds = existingRules.map((r) => r.id);

    await browserCompat.dnr.updateDynamicRules({
      removeRuleIds,
      addRules: allocatedRules
    });

    const installedRules = await browserCompat.dnr.getDynamicRules();
    const installedIds = new Set(installedRules.map((r) => r.id));
    const allAllocatedPresent = allocatedRules.every((r) => installedIds.has(r.id));

    if (!allAllocatedPresent && allocatedRules.length > 0) {
      lastSyncStatus = 'FAILED';
      lastSyncError = 'INSTALLED_RULE_VERIFICATION_FAILED: Engine rules do not match allocated candidate rules.';
      lastSyncTimestamp = Date.now();
      return { success: false, error: lastSyncError };
    }

    lastSyncStatus = 'SUCCESS';
    lastSyncError = null;
    lastSyncTimestamp = Date.now();

    console.log(`[DNR Sync] Successful. Allocated rules: ${allocatedRules.length} (Safe: ${safeCount}, Unsafe: ${unsafeCount}, Regex: ${regexCount})`);

    return {
      success: true,
      count: allocatedRules.length,
      safeCount,
      unsafeCount,
      regexCount,
      truncated: categoryTruncatedCount
    };
  } catch (err) {
    lastSyncStatus = 'FAILED';
    lastSyncError = err.message || 'DNR_UPDATE_FAILED';
    lastSyncTimestamp = Date.now();
    return { success: false, error: lastSyncError };
  }
}

async function initializeExtension() {
  const seedDomains = FilterListManager.getDefaultSeedDomains();
  await storageManager.setCachedAdultDomains(seedDomains);

  await syncDeclarativeRules();

  // Setup context menu actions
  ContextMenuHandler.setupContextMenus(
    (domain) => storageManager.addPermanentDomainTransactional(domain, (cand) => syncDeclarativeRules(cand)),
    (pattern, scope, action, dom) => storageManager.addProtectedKeywordTransactional(pattern, scope, action, (cand) => syncDeclarativeRules(cand), dom)
  );

  // Setup minute alarm for schedule and focus session checks
  if (browserCompat.alarms) {
    browserCompat.alarms.create('focus_shield_minute_alarm', { periodInMinutes: 1 });
  }
}

// Alarm Listener
if (browserCompat.alarms?.onAlarm?.addListener) {
  browserCompat.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'focus_shield_minute_alarm') {
      await syncDeclarativeRules();
    }
  });
}

// Lifecycle Events
browserCompat.api?.runtime?.onInstalled?.addListener((details) => {
  console.log('[ServiceWorker] Focus Shield Installed/Updated:', details.reason);
  initializeExtension();
});

browserCompat.api?.runtime?.onStartup?.addListener(() => {
  console.log('[ServiceWorker] Focus Shield Browser Startup.');
  initializeExtension();
});

/**
 * Message Handler
 */
browserCompat.api?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || typeof message.action !== 'string') {
        return sendResponse({ success: false, error: 'INVALID_MESSAGE_FORMAT' });
      }

      const extensionOrigin = browserCompat.runtime.getURL('');
      const isInternalSender = sender.url && sender.url.startsWith(extensionOrigin);

      switch (message.action) {
        case 'ADD_PERMANENT_DOMAIN': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.addPermanentDomainTransactional(
            message.domain,
            (cand) => syncDeclarativeRules(cand),
            'user_permanent'
          );
          sendResponse(res);
          break;
        }

        case 'REMOVE_PERMANENT_DOMAIN': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.removePermanentDomainTransactional(
            message.id,
            message.pin,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'ADD_PROTECTED_KEYWORD': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.addProtectedKeywordTransactional(
            message.pattern,
            message.matchScope || 'path_query',
            message.actionType || 'block_page',
            (cand) => syncDeclarativeRules(cand),
            message.domain || null,
            message.wordMatchMode || 'contains',
            Boolean(message.caseSensitive)
          );
          sendResponse(res);
          break;
        }

        case 'REMOVE_PROTECTED_KEYWORD': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.removeProtectedKeywordTransactional(
            message.id,
            message.pin,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'UPDATE_CATEGORY_STATE': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.updateCategoryStateTransactional(
            message.categoryId,
            message.enabled,
            (cand) => syncDeclarativeRules(cand),
            message.pin
          );
          sendResponse(res);
          break;
        }

        case 'SAVE_SCHEDULE': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.saveScheduleTransactional(
            message.schedule,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'DELETE_SCHEDULE': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.deleteScheduleTransactional(
            message.id,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'START_FOCUS_SESSION': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const sessionObj = {
            active: true,
            startTime: Date.now(),
            durationMinutes: message.durationMinutes || 25,
            endTime: Date.now() + (message.durationMinutes || 25) * 60 * 1000,
            blockCategories: message.blockCategories || ['adult', 'social', 'entertainment', 'gaming', 'gambling'],
            strictLocked: Boolean(message.strictLocked)
          };
          const res = await storageManager.startFocusSessionTransactional(
            sessionObj,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'STOP_FOCUS_SESSION': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.stopFocusSessionTransactional(
            message.pin,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'SET_PIN': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.setPinTransactional(message.newPin, message.currentPin);
          sendResponse(res);
          break;
        }

        case 'REMOVE_PIN': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.removePinTransactional(message.currentPin);
          sendResponse(res);
          break;
        }

        case 'VERIFY_PIN': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const state = await storageManager.getState();
          if (!state.security?.pinEnabled) {
            return sendResponse({ success: true, valid: true });
          }
          const valid = await CryptoUtils.verifyPin(message.pin, state.security.pinHash, state.security.pinSalt);
          sendResponse({ success: true, valid });
          break;
        }

        case 'SET_STRICT_MODE': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.setStrictModeTransactional(
            message.enabled,
            message.durationHours,
            message.pin
          );
          sendResponse(res);
          break;
        }

        case 'EXPORT_CONFIG': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const state = await storageManager.getState();
          const jsonStr = ImportExportService.exportConfiguration(state);
          sendResponse({ success: true, jsonConfig: jsonStr });
          break;
        }

        case 'IMPORT_CONFIG': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.importStateTransactional(
            message.jsonString,
            (cand) => syncDeclarativeRules(cand)
          );
          sendResponse(res);
          break;
        }

        case 'CLEAR_INSIGHTS': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const res = await storageManager.clearInsightsTransactional();
          sendResponse(res);
          break;
        }

        case 'GET_STATUS': {
          const state = await storageManager.getState();
          const incognitoAllowed = await browserCompat.isAllowedIncognitoAccess();
          sendResponse({
            success: true,
            state,
            incognitoAllowed
          });
          break;
        }

        case 'GET_DNR_DIAGNOSTICS': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });

          let installedRules = [];
          try {
            installedRules = await browserCompat.dnr.getDynamicRules();
          } catch {}

          const state = await storageManager.getState();
          const installedRuleCount = installedRules.length;
          const safeRuleCount = installedRules.filter((r) => !RuleBudgetManager.isUnsafeRule(r)).length;
          const unsafeRuleCount = installedRules.filter((r) => RuleBudgetManager.isUnsafeRule(r)).length;
          const regexRuleCount = installedRules.filter((r) => RuleBudgetManager.isRegexRule(r)).length;

          sendResponse({
            success: true,
            installedRuleCount,
            totalDynamicRules: installedRuleCount,
            safeDynamicRules: safeRuleCount,
            unsafeDynamicRules: unsafeRuleCount,
            regexRules: regexRuleCount,
            permanentDomainRules: (state.permanentDomains || []).length,
            adultDomainRules: (state.filterLists?.cachedDomains || []).length,
            keywordRules: (state.protectedKeywords || []).length,
            lastSyncStatus,
            lastSyncError,
            lastSyncTimestamp,
            verificationStatus: lastSyncStatus === 'SUCCESS' ? 'VERIFIED' : 'FAILED'
          });
          break;
        }

        case 'INCREMENT_BLOCKED_COUNT': {
          const stats = await storageManager.incrementBlockedCount(message.domain, message.category);
          sendResponse({ success: true, statistics: stats });
          break;
        }

        case 'FORCE_SYNC_RULES': {
          if (!isInternalSender) return sendResponse({ success: false, error: 'UNAUTHORIZED_SENDER' });
          const syncRes = await syncDeclarativeRules();
          sendResponse({ success: syncRes?.success !== false, ...syncRes });
          break;
        }

        default:
          sendResponse({ success: false, error: 'UNKNOWN_ACTION' });
      }
    } catch (err) {
      console.error('[ServiceWorker] Error handling message:', err);
      sendResponse({ success: false, error: err.message || 'INTERNAL_ERROR' });
    }
  })();

  return true;
});

initializeExtension();
