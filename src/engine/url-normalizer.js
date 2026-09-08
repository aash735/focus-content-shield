/**
 * URL Normalizer & Canonicalization Engine
 * Handles URL parsing, domain normalization, percent-decoding,
 * trailing dot stripping, and input validation.
 */

export class UrlNormalizer {
  /**
   * Normalizes raw domain input string to canonical host format.
   */
  static canonicalizeDomain(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      return null;
    }

    let trimmed = rawInput.trim();
    if (!trimmed) return null;

    // Handle missing protocol for URL parser
    if (!trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
      trimmed = 'https://' + trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      let hostname = parsed.hostname;

      if (!hostname) return null;

      // Lowercase hostname
      hostname = hostname.toLowerCase();

      // Strip trailing dots (e.g. "example.com.")
      while (hostname.endsWith('.')) {
        hostname = hostname.slice(0, -1);
      }

      // Strip leading "www." if present
      if (hostname.startsWith('www.')) {
        hostname = hostname.slice(4);
      }

      // Reject if input contains non-root path, query string, or fragment for domain-only fields
      if (parsed.pathname && parsed.pathname !== '/') return null;
      if (parsed.search) return null;
      if (parsed.hash) return null;

      // Validate hostname structure
      if (!this.isValidDomain(hostname)) {
        return null;
      }

      return hostname;
    } catch {
      return null;
    }
  }

  /**
   * Canonicalizes a keyword pattern. Bounded to max 3 percent-decoding passes.
   */
  static canonicalizeKeyword(rawKeyword) {
    if (!rawKeyword || typeof rawKeyword !== 'string') {
      return null;
    }

    let keyword = rawKeyword.trim();
    if (!keyword) return null;

    // Decode percent-encoding (e.g. "%73%65%78" -> "sex") bounded to max 3 passes
    try {
      let decoded = decodeURIComponent(keyword);
      let passes = 0;
      while (decoded !== keyword && passes < 3) {
        keyword = decoded;
        decoded = decodeURIComponent(keyword);
        passes++;
      }
    } catch {
      // Keep best decoded version on malformed percent encoding
    }

    // Lowercase
    keyword = keyword.toLowerCase();

    // Strip leading/trailing slashes if pure keyword
    keyword = keyword.replace(/^\/+|\/+$/g, '');

    if (keyword.length < 2) {
      return null; // Reject single character keywords to prevent excessive false positives
    }

    return keyword;
  }

  /**
   * Generates a strict declarativeNetRequest regex filter string based on match scope and word match mode.
   * Matches against URL components without causing cross-scope false positives.
   *
   * Scopes:
   *  - 'path_query' (default): Matches keyword strictly after origin host slash.
   *  - 'hostname': Matches keyword at domain/subdomain label boundaries.
   *  - 'full_url': Matches keyword anywhere in full URL.
   *
   * WordMatchModes:
   *  - 'contains' (default): Substring match.
   *  - 'whole_word': Bounded match avoiding partial word matches (e.g. "feelapp" vs "feelapplication").
   */
  static buildKeywordRegexFilter(canonicalKeyword, matchScope = 'path_query', wordMatchMode = 'contains', caseSensitive = false) {
    const escaped = this.escapeRegex(canonicalKeyword);
    const wordPattern = wordMatchMode === 'whole_word'
      ? `(?:^|[^a-zA-Z0-9_])${escaped}(?:$|[^a-zA-Z0-9_])`
      : escaped;

    if (matchScope === 'hostname') {
      return `^(https?://(?:[^/:]+\\.)*${wordPattern}(?:\\.[^/:]+)?)(?:[:/].*)?$`;
    }

    if (matchScope === 'full_url') {
      return `^(https?://[^/:]+(?::\\d+)?).*${wordPattern}.*`;
    }

    // Default: 'path_query'
    // Group 1 captures origin (scheme + hostname + port), allowing safe homepage substitution (\1/)
    return `^(https?://[^/:]+(?::\\d+)?)/.*${wordPattern}.*`;
  }

  /**
   * Validates if a hostname string complies with domain naming conventions.
   */
  static isValidDomain(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;

    if (hostname.length > 253) return false;

    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    const isLocalhost = hostname === 'localhost';

    return domainRegex.test(hostname) || isLocalhost;
  }

  /**
   * Escapes special characters for regular expressions.
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Safely decodes a full URL and converts it to lower case. Bounded decoding.
   */
  static normalizeFullUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return '';
    try {
      let decoded = decodeURIComponent(urlStr);
      let passes = 0;
      while (decoded !== urlStr && passes < 3) {
        urlStr = decoded;
        decoded = decodeURIComponent(urlStr);
        passes++;
      }
      return decoded.toLowerCase();
    } catch {
      return urlStr.toLowerCase();
    }
  }
}

export default UrlNormalizer;
