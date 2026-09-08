/**
 * Storage Schema & Default Configurations
 * Version 2
 */

export const CURRENT_SCHEMA_VERSION = 2;

export const DEFAULT_STORAGE_STATE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  permanentDomains: [],
  protectedKeywords: [],
  categories: {
    adult: { enabled: true, customDomains: [], customKeywords: [] },
    social: { enabled: false, customDomains: [], customKeywords: [] },
    entertainment: { enabled: false, customDomains: [], customKeywords: [] },
    gambling: { enabled: false, customDomains: [], customKeywords: [] },
    shopping: { enabled: false, customDomains: [], customKeywords: [] },
    gaming: { enabled: false, customDomains: [], customKeywords: [] },
    news: { enabled: false, customDomains: [], customKeywords: [] },
    video: { enabled: false, customDomains: [], customKeywords: [] },
    custom: { enabled: false, customDomains: [], customKeywords: [] }
  },
  schedules: [],
  focusSession: {
    active: false,
    startTime: null,
    durationMinutes: 25,
    endTime: null,
    blockCategories: ['adult', 'social', 'entertainment', 'gaming', 'gambling', 'shopping', 'news', 'video'],
    strictLocked: false
  },
  strictMode: {
    enabled: false,
    lockUntil: null, // timestamp or null for permanent
    requirePinForRemoval: true,
    requirePinForSettings: true,
    requirePinForDisable: true
  },
  security: {
    pinHash: null,
    pinSalt: null,
    pinEnabled: false
  },
  insights: {
    totalBlockedAttempts: 0,
    lastBlockedTimestamp: 0,
    domainBlockCounts: {},
    categoryBlockCounts: {}
  },
  filterLists: {
    enabledCategoryAdult: true,
    lastUpdated: 0,
    cachedDomains: []
  },
  statistics: {
    totalBlockedAttempts: 0,
    lastBlockedTimestamp: 0
  },
  settings: {
    searchProtectionEnabled: true,
    redirectMode: 'safe_home', // 'safe_home' | 'block_page'
    incognitoWarningAcknowledged: false
  }
};
