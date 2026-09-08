/**
 * Managed Category Rulesets & Definitions
 * Scalable category protection architecture for Focus & Content Shield.
 */

import { SEED_ADULT_DOMAINS } from '../services/filter-list-manager.js';

export const CATEGORY_DEFINITIONS = {
  adult: {
    id: 'adult',
    name: 'Adult Content',
    description: 'Blocks explicit and adult content websites and keyword patterns.',
    domains: SEED_ADULT_DOMAINS,
    keywords: ['porn', 'pornhub', 'xxx', 'hentai', 'xvideos', 'xnxx', 'erotic', 'adult-video']
  },
  social: {
    id: 'social',
    name: 'Social Media',
    description: 'Blocks major social networks and community feed platforms.',
    domains: [
      'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
      'reddit.com', 'linkedin.com', 'snapchat.com', 'pinterest.com', 'discord.com',
      'tumblr.com', 'threads.net'
    ],
    keywords: ['facebook', 'instagram', 'tiktok', 'twitter', 'reddit']
  },
  entertainment: {
    id: 'entertainment',
    name: 'Entertainment & Streaming',
    description: 'Blocks movies, TV shows, meme portals, and streaming media platforms.',
    domains: [
      'netflix.com', 'hulu.com', 'disneyplus.com', 'primevideo.com', 'twitch.tv',
      'imdb.com', '9gag.com', 'buzzfeed.com', 'hbo.com', 'max.com', 'vudu.com'
    ],
    keywords: ['netflix', 'hulu', 'disneyplus', 'primevideo', 'streaming']
  },
  gambling: {
    id: 'gambling',
    name: 'Gambling & Betting',
    description: 'Blocks online casinos, sports betting, lottery, and gambling portals.',
    domains: [
      'bet365.com', 'draftkings.com', 'fanduel.com', 'pokerstars.com',
      '888poker.com', 'stake.com', 'bovada.lv', 'betonline.ag', 'slotomania.com'
    ],
    keywords: ['casino', 'betting', 'poker', 'gambling', 'slot-machine', 'sportsbook']
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping & E-Commerce',
    description: 'Blocks online retail marketplaces and shopping platforms.',
    domains: [
      'amazon.com', 'ebay.com', 'aliexpress.com', 'etsy.com', 'walmart.com',
      'target.com', 'shein.com', 'temu.com', 'bestbuy.com', 'wayfair.com'
    ],
    keywords: ['shopping', 'buy-now', 'discount-deals', 'e-commerce']
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    description: 'Blocks online game servers, store fronts, and gaming communities.',
    domains: [
      'steampowered.com', 'store.epicgames.com', 'roblox.com', 'minecraft.net',
      'leagueoflegends.com', 'battle.net', 'ea.com', 'ubisoft.com', 'ign.com'
    ],
    keywords: ['online-game', 'game-play', 'steam-store', 'epic-games']
  },
  news: {
    id: 'news',
    name: 'News & Media',
    description: 'Blocks breaking news portals and gossip blogs.',
    domains: [
      'cnn.com', 'bbc.com', 'foxnews.com', 'nytimes.com', 'dailymail.co.uk',
      'buzzfeednews.com', 'huffpost.com', 'washingtonpost.com'
    ],
    keywords: ['breaking-news', 'daily-news', 'tabloid']
  },
  video: {
    id: 'video',
    name: 'Video Platforms',
    description: 'Blocks general video sharing and streaming portals.',
    domains: [
      'youtube.com', 'vimeo.com', 'dailymotion.com', 'twitch.tv', 'rumble.com'
    ],
    keywords: ['watch-video', 'funny-videos', 'video-stream']
  },
  custom: {
    id: 'custom',
    name: 'Custom Categories',
    description: 'User-managed category definitions.',
    domains: [],
    keywords: []
  }
};

export class CategoryRulesets {
  static getCategory(categoryId) {
    return CATEGORY_DEFINITIONS[categoryId] || null;
  }

  static getAllCategories() {
    return Object.values(CATEGORY_DEFINITIONS);
  }

  /**
   * Compiles active domain and keyword rule list for a set of enabled category IDs.
   */
  static getActiveCategoryRules(enabledCategoriesState = {}) {
    const activeDomains = new Set();
    const activeKeywords = new Set();

    for (const [catId, config] of Object.entries(enabledCategoriesState)) {
      const isEnabled = typeof config === 'boolean' ? config : config?.enabled;
      if (!isEnabled) continue;

      const def = CATEGORY_DEFINITIONS[catId];
      if (def) {
        (def.domains || []).forEach((d) => activeDomains.add(d));
        (def.keywords || []).forEach((k) => activeKeywords.add(k));
      }

      if (config && typeof config === 'object') {
        (config.customDomains || []).forEach((d) => activeDomains.add(d));
        (config.customKeywords || []).forEach((k) => activeKeywords.add(k));
      }
    }

    return {
      domains: Array.from(activeDomains),
      keywords: Array.from(activeKeywords)
    };
  }
}

export default CategoryRulesets;
