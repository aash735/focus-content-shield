/**
 * Adult Category & Filter List Manager
 * Provides bundled adult domain category entries loaded directly from src/data/adult_domains.json.
 * Normalizes all entries to canonical domain format and deduplicates.
 */

import { UrlNormalizer } from '../engine/url-normalizer.js';
import adultDomainsData from '../data/adult_domains.json' with { type: 'json' };

export class FilterListManager {
  /**
   * Reads, parses, validates, and normalizes the internal bundled adult_domains.json list.
   * Returns a deduplicated array of canonical domain hostnames.
   */
  static getBundledAdultDomains() {
    const rawList = [];

    if (adultDomainsData) {
      if (Array.isArray(adultDomainsData.domains)) {
        rawList.push(...adultDomainsData.domains);
      }
      if (Array.isArray(adultDomainsData.https_urls)) {
        rawList.push(...adultDomainsData.https_urls);
      }
    }

    const domainSet = new Set();
    for (const entry of rawList) {
      const canonical = UrlNormalizer.canonicalizeDomain(entry);
      if (canonical) {
        domainSet.add(canonical);
      }
    }

    return Array.from(domainSet);
  }

  /**
   * Returns default seed domains normalized from the bundled list.
   */
  static getDefaultSeedDomains() {
    return this.getBundledAdultDomains();
  }
}

export const SEED_ADULT_DOMAINS = FilterListManager.getBundledAdultDomains();

export default FilterListManager;
