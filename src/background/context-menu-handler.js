/**
 * Context Menu Protection Handler
 * Creates right-click context menu options for blocking websites and links.
 */

import { browserCompat } from '../utils/browser-compat.js';
import { UrlNormalizer } from '../engine/url-normalizer.js';

export class ContextMenuHandler {
  static setupContextMenus(onBlockDomain, onBlockKeyword) {
    if (!browserCompat.contextMenus) return;

    try {
      browserCompat.contextMenus.removeAll().then(() => {
        // Page Context Menu: Block This Website
        browserCompat.contextMenus.create({
          id: 'focus_shield_block_website',
          title: '🛡️ Block this website',
          contexts: ['page']
        });

        // Link Context Menu: Block This Link Domain
        browserCompat.contextMenus.create({
          id: 'focus_shield_block_link_domain',
          title: '🛡️ Block this link (Entire Domain)',
          contexts: ['link']
        });

        // Link Context Menu: Block Link Path Keyword
        browserCompat.contextMenus.create({
          id: 'focus_shield_block_link_page',
          title: '🛡️ Block this specific link page',
          contexts: ['link']
        });
      });

      if (browserCompat.contextMenus.onClicked?.addListener) {
        browserCompat.contextMenus.onClicked.addListener(async (info, tab) => {
          try {
            if (info.menuItemId === 'focus_shield_block_website') {
              const urlStr = info.pageUrl || tab?.url;
              const canonical = UrlNormalizer.canonicalizeDomain(urlStr);
              if (canonical && typeof onBlockDomain === 'function') {
                await onBlockDomain(canonical);
              }
            } else if (info.menuItemId === 'focus_shield_block_link_domain') {
              const urlStr = info.linkUrl;
              const canonical = UrlNormalizer.canonicalizeDomain(urlStr);
              if (canonical && typeof onBlockDomain === 'function') {
                await onBlockDomain(canonical);
              }
            } else if (info.menuItemId === 'focus_shield_block_link_page') {
              const urlStr = info.linkUrl;
              if (urlStr) {
                const parsed = new URL(urlStr);
                const domain = UrlNormalizer.canonicalizeDomain(parsed.origin);
                const keyword = UrlNormalizer.canonicalizeKeyword(parsed.pathname + parsed.search);
                if (keyword && typeof onBlockKeyword === 'function') {
                  await onBlockKeyword(keyword, 'path_query', 'redirect_safe_home', domain);
                }
              }
            }
          } catch (err) {
            console.error('[ContextMenuHandler] Action failed:', err);
          }
        });
      }
    } catch (err) {
      console.warn('[ContextMenuHandler] Setup failed:', err.message);
    }
  }
}

export default ContextMenuHandler;
