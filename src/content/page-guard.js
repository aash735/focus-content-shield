/**
 * Page Guard & Search Protection Content Script
 * Executes at document_start to provide secondary client-side protection for SPA navigations,
 * percent-encoded URL path detection, search query filtering, focus sessions, and active schedules.
 */

(function () {
  'use strict';

  const EXPLICIT_SEARCH_TERMS = [
    'porn', 'pornhub', 'xxx', 'sex', 'nude', 'hentai', 'erotic', 'adult video', 'nsfw'
  ];

  let cachedPermanentDomains = [];
  let cachedProtectedKeywords = [];
  let cachedActiveCategoryDomains = [];
  let cachedActiveCategoryKeywords = [];
  let isInitialized = false;

  const initPromise = new Promise((resolve) => {
    let resolved = false;
    const done = (response) => {
      if (resolved) return;
      resolved = true;
      if (response && response.success && response.state) {
        const state = response.state;
        cachedPermanentDomains = state.permanentDomains || [];
        cachedProtectedKeywords = state.protectedKeywords || [];

        // Aggregate category, focus, schedule active rules
        const activeDomSet = new Set();
        const activeKwSet = new Set();

        // Cached adult list if adult category enabled
        if (state.categories?.adult?.enabled !== false && state.filterLists?.cachedDomains) {
          state.filterLists.cachedDomains.forEach((d) => activeDomSet.add(d.toLowerCase()));
        }

        cachedActiveCategoryDomains = Array.from(activeDomSet);
        cachedActiveCategoryKeywords = Array.from(activeKwSet);
      }
      isInitialized = true;
      resolve();
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => done(res));
      } else {
        done(null);
      }
    } catch {
      done(null);
    }

    setTimeout(() => done(null), 250);
  });

  function inspectSearchQuery() {
    try {
      const url = new URL(window.location.href);
      const host = url.hostname.toLowerCase();

      const isGoogle = host.includes('google.');
      const isBing = host.includes('bing.com');
      const isDDG = host.includes('duckduckgo.com');
      const isYahoo = host.includes('search.yahoo.com');

      if (!isGoogle && !isBing && !isDDG && !isYahoo) return;

      const queryParam = isYahoo ? 'p' : (isDDG ? 'q' : 'q');
      const searchVal = url.searchParams.get(queryParam);

      if (!searchVal) return;

      const lowerSearch = searchVal.toLowerCase();
      const hasExplicitTerm = EXPLICIT_SEARCH_TERMS.some((term) => lowerSearch.includes(term));

      if (hasExplicitTerm) {
        if (isGoogle && !url.searchParams.has('safe')) {
          url.searchParams.set('safe', 'active');
          window.location.replace(url.toString());
        } else if (isDDG && !url.searchParams.has('kp')) {
          url.searchParams.set('kp', '1');
          window.location.replace(url.toString());
        } else if (isBing && url.searchParams.get('adlt') !== 'strict') {
          url.searchParams.set('adlt', 'strict');
          window.location.replace(url.toString());
        }
      }
    } catch {
      // Ignore
    }
  }

  function safeDecode(str) {
    if (!str) return '';
    try {
      let decoded = decodeURIComponent(str);
      let passes = 0;
      while (decoded !== str && passes < 3) {
        str = decoded;
        decoded = decodeURIComponent(str);
        passes++;
      }
      return decoded.toLowerCase();
    } catch {
      return str.toLowerCase();
    }
  }

  function setupHistoryGuard() {
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    async function checkUrlAndRedirect(urlStr) {
      if (!urlStr) return;
      if (!isInitialized) {
        await initPromise;
      }
      try {
        const targetUrl = new URL(urlStr, window.location.origin);
        const host = targetUrl.hostname.toLowerCase();

        // 1. Permanent & Category Domains Check
        const allBlockedDomains = [...cachedPermanentDomains.map((d) => (d.domain || '').toLowerCase()), ...cachedActiveCategoryDomains];
        for (const dom of allBlockedDomains) {
          if (dom && (host === dom || host.endsWith('.' + dom))) {
            const blockUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
              ? chrome.runtime.getURL('src/ui/blocked.html?reason=domain')
              : window.location.origin + '/';
            window.location.replace(blockUrl);
            return;
          }
        }

        const isRootHomepage = targetUrl.pathname === '/' || targetUrl.pathname === '';
        if (isRootHomepage && !targetUrl.search && !targetUrl.hash) {
          return;
        }

        const decodedPathQuery = safeDecode(targetUrl.pathname + targetUrl.search + targetUrl.hash);
        const decodedFullUrl = safeDecode(targetUrl.href);
        const hostLabels = host.split('.');

        // 2. Protected Keywords / Word Rules
        for (const item of cachedProtectedKeywords) {
          const pattern = (item.pattern || '').toLowerCase();
          if (!pattern) continue;

          if (item.domain) {
            const targetDom = item.domain.toLowerCase();
            const matchesDomain = host === targetDom || host.endsWith('.' + targetDom);
            if (!matchesDomain) continue;
          }

          const scope = item.matchScope || item.matchTarget || 'path_query';
          const mode = item.wordMatchMode || 'contains';
          const action = item.action || 'block_page';
          let isMatch = false;

          let targetStr = decodedPathQuery;
          if (scope === 'hostname') targetStr = host;
          else if (scope === 'full_url') targetStr = decodedFullUrl;

          if (mode === 'whole_word') {
            const re = new RegExp(`(?:^|[^a-z0-9_])${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9_])`, 'i');
            isMatch = re.test(targetStr);
          } else {
            isMatch = targetStr.includes(pattern);
          }

          if (isMatch) {
            if (action === 'block_page') {
              const blockUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
                ? chrome.runtime.getURL(`src/ui/blocked.html?reason=word&word=${encodeURIComponent(item.pattern)}`)
                : window.location.origin + '/';
              window.location.replace(blockUrl);
            } else {
              window.location.replace(targetUrl.origin + '/');
            }
            return;
          }
        }

        // 3. Fallback explicit search terms check
        for (const term of EXPLICIT_SEARCH_TERMS) {
          if (decodedPathQuery.includes(term)) {
            window.location.replace(targetUrl.origin + '/');
            return;
          }
        }
      } catch {
        // Ignore
      }
    }

    history.pushState = function (...args) {
      origPushState.apply(this, args);
      checkUrlAndRedirect(args[2]);
    };

    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      checkUrlAndRedirect(args[2]);
    };

    window.addEventListener('popstate', () => {
      checkUrlAndRedirect(window.location.href);
    });
  }

  inspectSearchQuery();
  setupHistoryGuard();
})();
