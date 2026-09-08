/**
 * Storage Manager
 * Manages extension state persistence, schema migrations, and transactional domain locking.
 */

import { UrlNormalizer } from '../engine/url-normalizer.js';
import { DEFAULT_STORAGE_STATE, CURRENT_SCHEMA_VERSION } from './schema.js';
import { browserCompat } from '../utils/browser-compat.js';
import { CryptoUtils } from '../utils/crypto-utils.js';
import { ImportExportService } from '../services/import-export-service.js';

class AsyncMutex {
  constructor() {
    this._queue = Promise.resolve();
  }

  runExclusive(task) {
    const res = this._queue.then(() => task());
    this._queue = res.catch(() => {});
    return res;
  }
}

export class StorageManager {
  constructor(storageDriver = null) {
    this.driver = storageDriver || browserCompat.storage;
    this.mutex = new AsyncMutex();
  }

  /**
   * Reads current storage state, initializing default schema if empty or migrating if legacy.
   */
  async getState() {
    try {
      const data = await this.driver.get(null);
      if (!data || Object.keys(data).length === 0 || !data.schemaVersion) {
        await this.driver.set(DEFAULT_STORAGE_STATE);
        return JSON.parse(JSON.stringify(DEFAULT_STORAGE_STATE));
      }

      if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
        return await this._migrateSchema(data);
      }

      return data;
    } catch (err) {
      console.error('[StorageManager] Error reading storage state:', err);
      return JSON.parse(JSON.stringify(DEFAULT_STORAGE_STATE));
    }
  }

  /**
   * Transactional Addition of Permanent Domain.
   */
  async addPermanentDomainTransactional(rawDomain, syncCallback, source = 'user_permanent') {
    return this.mutex.runExclusive(async () => {
      const canonical = UrlNormalizer.canonicalizeDomain(rawDomain);
      if (!canonical) {
        return { success: false, error: 'INVALID_DOMAIN: Please enter a valid domain name (e.g. example.com).' };
      }

      const state = await this.getState();
      const existing = state.permanentDomains.find((item) => item.domain === canonical);

      if (existing) {
        return { success: true, duplicate: true, entry: existing };
      }

      const newEntry = {
        id: this._generateId(),
        domain: canonical,
        createdAt: Date.now(),
        source
      };

      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.permanentDomains.push(newEntry);

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return {
            success: false,
            error: syncResult.error || 'DNR_SYNC_FAILED: Dynamic rule installation failed; transaction rolled back.'
          };
        }
      }

      await this.driver.set({ permanentDomains: candidateState.permanentDomains });
      return { success: true, duplicate: false, entry: newEntry };
    });
  }

  async addPermanentDomain(rawDomain, source = 'user_permanent') {
    return this.addPermanentDomainTransactional(rawDomain, null, source);
  }

  async addProtectedKeyword(rawKeyword, matchScope = 'path_query', action = 'redirect_safe_home', rawDomain = null) {
    return this.addProtectedKeywordTransactional(rawKeyword, matchScope, action, null, rawDomain);
  }

  /**
   * Transactional Removal of Permanent Domain. Enforces Strict Mode & PIN protection checks.
   */
  async removePermanentDomainTransactional(domainId, pin = null, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      // Check Strict Mode lock
      if (state.strictMode?.enabled) {
        const lockUntil = state.strictMode.lockUntil;
        if (!lockUntil || Date.now() < lockUntil) {
          return { success: false, error: 'STRICT_MODE_ACTIVE: Rule modification is locked under Strict Mode.' };
        }
      }

      // Check PIN Auth if required
      if (state.security?.pinEnabled) {
        const isValid = await CryptoUtils.verifyPin(pin, state.security.pinHash, state.security.pinSalt);
        if (!isValid) {
          return { success: false, error: 'INVALID_PIN: Correct PIN authorization required to remove protected domains.' };
        }
      }

      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.permanentDomains = candidateState.permanentDomains.filter((item) => item.id !== domainId);

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return {
            success: false,
            error: syncResult.error || 'DNR_SYNC_FAILED: Dynamic rule removal failed; transaction rolled back.'
          };
        }
      }

      await this.driver.set({ permanentDomains: candidateState.permanentDomains });
      return { success: true };
    });
  }

  /**
   * Transactional Addition of Protected Keyword / Word Rule.
   */
  async addProtectedKeywordTransactional(rawKeyword, matchScope = 'path_query', action = 'redirect_safe_home', syncCallback = null, rawDomain = null, wordMatchMode = 'contains', caseSensitive = false) {
    return this.mutex.runExclusive(async () => {
      const canonical = UrlNormalizer.canonicalizeKeyword(rawKeyword);
      if (!canonical) {
        return { success: false, error: 'INVALID_KEYWORD: Keyword must be at least 2 characters long.' };
      }

      const canonicalDomain = rawDomain ? UrlNormalizer.canonicalizeDomain(rawDomain) : null;
      if (rawDomain && !canonicalDomain) {
        return { success: false, error: 'INVALID_DOMAIN: Please enter a valid target domain name (e.g. example.com).' };
      }

      const state = await this.getState();
      const existing = state.protectedKeywords.find((item) => {
        const matchPattern = item.pattern === canonical;
        const matchDomain = (item.domain || null) === (canonicalDomain || null);
        const matchScopeEqual = (item.matchScope || item.matchTarget || 'path_query') === matchScope;
        const matchModeEqual = (item.wordMatchMode || 'contains') === wordMatchMode;
        return matchPattern && matchDomain && matchScopeEqual && matchModeEqual;
      });

      if (existing) {
        return { success: true, duplicate: true, entry: existing };
      }

      const newEntry = {
        id: this._generateId(),
        type: 'word',
        scope: canonicalDomain ? 'domain' : 'global',
        domain: canonicalDomain || null,
        pattern: canonical,
        matchScope: matchScope || 'path_query',
        matchTarget: matchScope || 'path_query',
        wordMatchMode: wordMatchMode || 'contains',
        caseSensitive: Boolean(caseSensitive),
        action: action || 'block_page',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.protectedKeywords.push(newEntry);

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return {
            success: false,
            error: syncResult.error || 'DNR_SYNC_FAILED: Dynamic rule installation failed; transaction rolled back.'
          };
        }
      }

      await this.driver.set({ protectedKeywords: candidateState.protectedKeywords });
      return { success: true, duplicate: false, entry: newEntry };
    });
  }

  /**
   * Transactional Removal of Protected Keyword.
   */
  async removeProtectedKeywordTransactional(keywordId, pin = null, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      if (state.strictMode?.enabled) {
        const lockUntil = state.strictMode.lockUntil;
        if (!lockUntil || Date.now() < lockUntil) {
          return { success: false, error: 'STRICT_MODE_ACTIVE: Rule modification is locked under Strict Mode.' };
        }
      }

      if (state.security?.pinEnabled) {
        const isValid = await CryptoUtils.verifyPin(pin, state.security.pinHash, state.security.pinSalt);
        if (!isValid) {
          return { success: false, error: 'INVALID_PIN: Correct PIN authorization required.' };
        }
      }

      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.protectedKeywords = candidateState.protectedKeywords.filter((item) => item.id !== keywordId);

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return {
            success: false,
            error: syncResult.error || 'DNR_SYNC_FAILED; transaction rolled back.'
          };
        }
      }

      await this.driver.set({ protectedKeywords: candidateState.protectedKeywords });
      return { success: true };
    });
  }

  /**
   * Transactional Update of Categories State.
   */
  async updateCategoryStateTransactional(categoryId, enabled, syncCallback = null, pin = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      if (!enabled && state.security?.pinEnabled) {
        const isValid = await CryptoUtils.verifyPin(pin, state.security.pinHash, state.security.pinSalt);
        if (!isValid) {
          return { success: false, error: 'INVALID_PIN: Authentication required to disable category protection.' };
        }
      }

      const candidateState = JSON.parse(JSON.stringify(state));
      if (!candidateState.categories) candidateState.categories = {};
      candidateState.categories[categoryId] = {
        ...(candidateState.categories[categoryId] || {}),
        enabled: Boolean(enabled)
      };

      if (categoryId === 'adult') {
        if (!candidateState.filterLists) candidateState.filterLists = {};
        candidateState.filterLists.enabledCategoryAdult = Boolean(enabled);
      }

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED' };
        }
      }

      await this.driver.set({
        categories: candidateState.categories,
        filterLists: candidateState.filterLists
      });
      return { success: true };
    });
  }

  /**
   * Transactional Save / Update of Schedule.
   */
  async saveScheduleTransactional(scheduleData, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      const candidateState = JSON.parse(JSON.stringify(state));
      if (!Array.isArray(candidateState.schedules)) candidateState.schedules = [];

      let entry;
      if (scheduleData.id) {
        const idx = candidateState.schedules.findIndex((s) => s.id === scheduleData.id);
        if (idx !== -1) {
          candidateState.schedules[idx] = { ...candidateState.schedules[idx], ...scheduleData };
          entry = candidateState.schedules[idx];
        }
      }

      if (!entry) {
        entry = {
          id: scheduleData.id || 'sched_' + Math.random().toString(36).substring(2, 11),
          name: scheduleData.name || 'Custom Schedule',
          enabled: scheduleData.enabled !== false,
          days: scheduleData.days || [1, 2, 3, 4, 5],
          startTime: scheduleData.startTime || '09:00',
          endTime: scheduleData.endTime || '17:00',
          blockCategories: scheduleData.blockCategories || ['social', 'entertainment', 'gaming'],
          blockDomains: scheduleData.blockDomains || [],
          blockKeywords: scheduleData.blockKeywords || []
        };
        candidateState.schedules.push(entry);
      }

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED' };
        }
      }

      await this.driver.set({ schedules: candidateState.schedules });
      return { success: true, schedule: entry };
    });
  }

  /**
   * Transactional Deletion of Schedule.
   */
  async deleteScheduleTransactional(scheduleId, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();
      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.schedules = (candidateState.schedules || []).filter((s) => s.id !== scheduleId);

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED' };
        }
      }

      await this.driver.set({ schedules: candidateState.schedules });
      return { success: true };
    });
  }

  /**
   * Start Focus Session.
   */
  async startFocusSessionTransactional(focusSessionObj, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();
      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.focusSession = focusSessionObj;

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED' };
        }
      }

      await this.driver.set({ focusSession: candidateState.focusSession });
      return { success: true };
    });
  }

  /**
   * Stop Focus Session.
   */
  async stopFocusSessionTransactional(pin = null, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      if (state.focusSession?.strictLocked || state.strictMode?.enabled) {
        if (state.security?.pinEnabled) {
          const isValid = await CryptoUtils.verifyPin(pin, state.security.pinHash, state.security.pinSalt);
          if (!isValid) {
            return { success: false, error: 'INVALID_PIN: PIN authorization required to stop locked Focus Session.' };
          }
        } else if (state.strictMode?.enabled) {
          return { success: false, error: 'STRICT_MODE_ACTIVE: Focus Session cannot be manually stopped during Strict Lockdown.' };
        }
      }

      const candidateState = JSON.parse(JSON.stringify(state));
      candidateState.focusSession = {
        active: false,
        startTime: null,
        durationMinutes: 25,
        endTime: null,
        blockCategories: [],
        strictLocked: false
      };

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED' };
        }
      }

      await this.driver.set({ focusSession: candidateState.focusSession });
      return { success: true };
    });
  }

  /**
   * Set Security PIN.
   */
  async setPinTransactional(newPin, currentPin = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();
      if (state.security?.pinEnabled) {
        const isValid = await CryptoUtils.verifyPin(currentPin, state.security.pinHash, state.security.pinSalt);
        if (!isValid) {
          return { success: false, error: 'INVALID_CURRENT_PIN: Current PIN verification failed.' };
        }
      }

      const salt = CryptoUtils.generateSalt();
      const hash = await CryptoUtils.hashPin(newPin, salt);

      const security = {
        pinHash: hash,
        pinSalt: salt,
        pinEnabled: true
      };

      await this.driver.set({ security });
      return { success: true };
    });
  }

  /**
   * Remove Security PIN.
   */
  async removePinTransactional(currentPin) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();
      if (!state.security?.pinEnabled) {
        return { success: true };
      }

      const isValid = await CryptoUtils.verifyPin(currentPin, state.security.pinHash, state.security.pinSalt);
      if (!isValid) {
        return { success: false, error: 'INVALID_PIN: Incorrect PIN.' };
      }

      const security = {
        pinHash: null,
        pinSalt: null,
        pinEnabled: false
      };

      await this.driver.set({ security });
      return { success: true };
    });
  }

  /**
   * Set Strict Mode lockdown state.
   */
  async setStrictModeTransactional(enabled, durationHours = 0, pin = null) {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();

      if (!enabled && state.strictMode?.enabled) {
        if (state.security?.pinEnabled) {
          const isValid = await CryptoUtils.verifyPin(pin, state.security.pinHash, state.security.pinSalt);
          if (!isValid) {
            return { success: false, error: 'INVALID_PIN: Authentication required to disable Strict Mode.' };
          }
        }
        if (state.strictMode.lockUntil && Date.now() < state.strictMode.lockUntil) {
          return { success: false, error: 'STRICT_LOCK_TIME_REMAINING: Strict Mode lock period has not expired.' };
        }
      }

      const lockUntil = enabled && durationHours > 0 ? Date.now() + durationHours * 3600 * 1000 : null;
      const strictMode = {
        enabled: Boolean(enabled),
        lockUntil,
        requirePinForRemoval: true,
        requirePinForSettings: true,
        requirePinForDisable: true
      };

      await this.driver.set({ strictMode });
      return { success: true, strictMode };
    });
  }

  /**
   * Transactional Import of Full Configuration.
   */
  async importStateTransactional(jsonString, syncCallback = null) {
    return this.mutex.runExclusive(async () => {
      const validateRes = ImportExportService.parseAndValidateImport(jsonString);
      if (!validateRes.success) {
        return validateRes;
      }

      const importedData = validateRes.data;
      const state = await this.getState();

      const candidateState = {
        ...state,
        permanentDomains: importedData.permanentDomains,
        protectedKeywords: importedData.protectedKeywords,
        categories: { ...state.categories, ...importedData.categories },
        schedules: importedData.schedules,
        settings: { ...state.settings, ...importedData.settings }
      };

      if (typeof syncCallback === 'function') {
        const syncResult = await syncCallback(candidateState);
        if (syncResult && syncResult.success === false) {
          return { success: false, error: syncResult.error || 'DNR_SYNC_FAILED: Import failed dynamic rule validation.' };
        }
      }

      await this.driver.set(candidateState);
      return { success: true, data: candidateState };
    });
  }

  /**
   * Increments blocked attempt metrics and local insights.
   */
  async incrementBlockedCount(domain = null, category = null) {
    try {
      const state = await this.getState();
      const stats = state.statistics || { totalBlockedAttempts: 0, lastBlockedTimestamp: 0 };
      const insights = state.insights || { totalBlockedAttempts: 0, domainBlockCounts: {}, categoryBlockCounts: {} };

      const total = (stats.totalBlockedAttempts || 0) + 1;
      const updatedStats = {
        totalBlockedAttempts: total,
        lastBlockedTimestamp: Date.now()
      };

      const domainCounts = { ...(insights.domainBlockCounts || {}) };
      if (domain) {
        const dom = UrlNormalizer.canonicalizeDomain(domain) || domain;
        domainCounts[dom] = (domainCounts[dom] || 0) + 1;
      }

      const catCounts = { ...(insights.categoryBlockCounts || {}) };
      if (category) {
        catCounts[category] = (catCounts[category] || 0) + 1;
      }

      const updatedInsights = {
        totalBlockedAttempts: total,
        lastBlockedTimestamp: Date.now(),
        domainBlockCounts: domainCounts,
        categoryBlockCounts: catCounts,
        focusTimeCompletedMinutes: insights.focusTimeCompletedMinutes || 0
      };

      await this.driver.set({ statistics: updatedStats, insights: updatedInsights });
      return updatedStats;
    } catch (err) {
      console.error('[StorageManager] Failed to increment blocked count:', err);
    }
  }

  /**
   * Clears insights data.
   */
  async clearInsightsTransactional() {
    return this.mutex.runExclusive(async () => {
      const updatedInsights = {
        totalBlockedAttempts: 0,
        lastBlockedTimestamp: 0,
        domainBlockCounts: {},
        categoryBlockCounts: {},
        focusTimeCompletedMinutes: 0
      };
      await this.driver.set({ insights: updatedInsights });
      return { success: true };
    });
  }

  /**
   * Updates cached adult filter list domains in storage.
   */
  async setCachedAdultDomains(domainArray) {
    const state = await this.getState();
    const validDomains = domainArray
      .map((d) => UrlNormalizer.canonicalizeDomain(d))
      .filter((d) => d !== null);

    const filterLists = {
      ...state.filterLists,
      lastUpdated: Date.now(),
      cachedDomains: validDomains
    };

    await this.driver.set({ filterLists });
    return filterLists;
  }

  /**
   * Updates user settings.
   */
  async updateSettings(newSettings) {
    const state = await this.getState();
    const settings = { ...state.settings, ...newSettings };
    await this.driver.set({ settings });
    return settings;
  }

  /**
   * Schema Migration Handler (v1 -> v2)
   */
  async _migrateSchema(oldData) {
    const newData = {
      ...DEFAULT_STORAGE_STATE,
      ...oldData,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };

    if (oldData.filterLists && oldData.filterLists.enabledCategoryAdult !== undefined) {
      newData.categories.adult.enabled = Boolean(oldData.filterLists.enabledCategoryAdult);
    }

    await this.driver.set(newData);
    return newData;
  }

  _generateId() {
    return 'id_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
  }
}

export default StorageManager;
