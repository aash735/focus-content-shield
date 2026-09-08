/**
 * Import & Export Service
 * Manages privacy-preserving local JSON configuration export and transactional import validation.
 */

import { UrlNormalizer } from '../engine/url-normalizer.js';

export class ImportExportService {
  /**
   * Generates exportable JSON configuration object from extension state.
   * Strips sensitive security hashes and private state before exporting.
   */
  static exportConfiguration(state) {
    if (!state || typeof state !== 'object') {
      throw new Error('INVALID_STATE: Cannot export empty state');
    }

    const exportObj = {
      version: 2,
      exportTimestamp: Date.now(),
      permanentDomains: (state.permanentDomains || []).map((d) => ({
        domain: d.domain,
        source: d.source || 'user_permanent'
      })),
      protectedKeywords: (state.protectedKeywords || []).map((k) => ({
        pattern: k.pattern,
        domain: k.domain || null,
        matchScope: k.matchScope || 'path_query',
        action: k.action || 'redirect_safe_home'
      })),
      categories: state.categories || {},
      schedules: (state.schedules || []).map((s) => ({
        name: s.name,
        enabled: s.enabled !== false,
        days: s.days || [1, 2, 3, 4, 5],
        startTime: s.startTime || '09:00',
        endTime: s.endTime || '17:00',
        blockCategories: s.blockCategories || [],
        blockDomains: s.blockDomains || [],
        blockKeywords: s.blockKeywords || []
      })),
      settings: {
        searchProtectionEnabled: state.settings?.searchProtectionEnabled !== false,
        redirectMode: state.settings?.redirectMode || 'safe_home',
        customRedirectUrl: state.settings?.customRedirectUrl || ''
      }
    };

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * Validates and parses imported JSON string string payload.
   * Performs data structure sanitization.
   */
  static parseAndValidateImport(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, error: 'EMPTY_PAYLOAD: Provided file content is empty.' };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return { success: false, error: 'INVALID_JSON: Failed to parse configuration file.' };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'INVALID_FORMAT: Imported root must be a JSON object.' };
    }

    const sanitizedDomains = [];
    if (Array.isArray(parsed.permanentDomains)) {
      for (const item of parsed.permanentDomains) {
        const raw = typeof item === 'string' ? item : item?.domain;
        const canonical = UrlNormalizer.canonicalizeDomain(raw);
        if (canonical && !sanitizedDomains.some((d) => d.domain === canonical)) {
          sanitizedDomains.push({
            id: 'id_' + Math.random().toString(36).substring(2, 11),
            domain: canonical,
            createdAt: Date.now(),
            source: 'imported'
          });
        }
      }
    }

    const sanitizedKeywords = [];
    if (Array.isArray(parsed.protectedKeywords)) {
      for (const item of parsed.protectedKeywords) {
        if (!item || typeof item !== 'object') continue;
        const canonicalPattern = UrlNormalizer.canonicalizeKeyword(item.pattern);
        if (canonicalPattern) {
          const canonicalDomain = item.domain ? UrlNormalizer.canonicalizeDomain(item.domain) : null;
          sanitizedKeywords.push({
            id: 'id_' + Math.random().toString(36).substring(2, 11),
            domain: canonicalDomain,
            pattern: canonicalPattern,
            matchScope: item.matchScope || 'path_query',
            action: item.action || 'redirect_safe_home',
            createdAt: Date.now()
          });
        }
      }
    }

    const sanitizedSchedules = [];
    if (Array.isArray(parsed.schedules)) {
      for (const s of parsed.schedules) {
        if (!s || typeof s !== 'object' || !s.name) continue;
        sanitizedSchedules.push({
          id: 'sched_' + Math.random().toString(36).substring(2, 11),
          name: String(s.name).substring(0, 50),
          enabled: s.enabled !== false,
          days: Array.isArray(s.days) ? s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
          startTime: s.startTime || '09:00',
          endTime: s.endTime || '17:00',
          blockCategories: Array.isArray(s.blockCategories) ? s.blockCategories : [],
          blockDomains: Array.isArray(s.blockDomains) ? s.blockDomains : [],
          blockKeywords: Array.isArray(s.blockKeywords) ? s.blockKeywords : []
        });
      }
    }

    return {
      success: true,
      data: {
        permanentDomains: sanitizedDomains,
        protectedKeywords: sanitizedKeywords,
        categories: parsed.categories && typeof parsed.categories === 'object' ? parsed.categories : {},
        schedules: sanitizedSchedules,
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}
      }
    };
  }
}

export default ImportExportService;
