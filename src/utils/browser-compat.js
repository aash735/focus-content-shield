/**
 * Browser Compatibility Layer (WebExtensions / Manifest V3)
 * Provides unified promise-based access for chrome.* and browser.* APIs
 * Supporting Chrome, Brave, Microsoft Edge, Opera, and Mozilla Firefox.
 */

class BrowserCompat {
  constructor() {
    this.api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    this.isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
  }

  /**
   * Promisified Storage API wrapper
   */
  get storage() {
    const apiStorage = this.api?.storage?.local;
    return {
      get: (keys) => {
        return new Promise((resolve, reject) => {
          if (!apiStorage) return reject(new Error('Storage API unavailable'));
          apiStorage.get(keys, (result) => {
            if (this.api.runtime.lastError) {
              return reject(this.api.runtime.lastError);
            }
            resolve(result);
          });
        });
      },
      set: (items) => {
        return new Promise((resolve, reject) => {
          if (!apiStorage) return reject(new Error('Storage API unavailable'));
          apiStorage.set(items, () => {
            if (this.api.runtime.lastError) {
              return reject(this.api.runtime.lastError);
            }
            resolve();
          });
        });
      },
      clear: () => {
        return new Promise((resolve, reject) => {
          if (!apiStorage) return reject(new Error('Storage API unavailable'));
          apiStorage.clear(() => {
            if (this.api.runtime.lastError) {
              return reject(this.api.runtime.lastError);
            }
            resolve();
          });
        });
      }
    };
  }

  /**
   * DeclarativeNetRequest API Wrapper
   */
  get dnr() {
    const dnrApi = this.api?.declarativeNetRequest;
    return {
      updateDynamicRules: (options) => {
        return new Promise((resolve, reject) => {
          if (!dnrApi) return reject(new Error('declarativeNetRequest API unavailable'));
          dnrApi.updateDynamicRules(options, () => {
            if (this.api.runtime.lastError) {
              return reject(this.api.runtime.lastError);
            }
            resolve();
          });
        });
      },
      getDynamicRules: () => {
        return new Promise((resolve, reject) => {
          if (!dnrApi) return reject(new Error('declarativeNetRequest API unavailable'));
          dnrApi.getDynamicRules((rules) => {
            if (this.api.runtime.lastError) {
              return reject(this.api.runtime.lastError);
            }
            resolve(rules);
          });
        });
      }
    };
  }

  /**
   * Extension runtime helpers
   */
  get runtime() {
    const runtimeApi = this.api?.runtime;
    return {
      getURL: (path) => runtimeApi?.getURL(path) || path,
      sendMessage: (message) => {
        return new Promise((resolve, reject) => {
          if (!runtimeApi) return reject(new Error('Runtime API unavailable'));
          runtimeApi.sendMessage(message, (response) => {
            if (runtimeApi.lastError) {
              return reject(runtimeApi.lastError);
            }
            resolve(response);
          });
        });
      },
      onMessage: runtimeApi?.onMessage
    };
  }

  /**
   * Context Menus API Wrapper
   */
  get contextMenus() {
    const cmApi = this.api?.contextMenus;
    return {
      create: (createProperties, callback) => {
        if (!cmApi) return;
        return cmApi.create(createProperties, callback);
      },
      removeAll: () => {
        return new Promise((resolve) => {
          if (!cmApi) return resolve();
          cmApi.removeAll(() => resolve());
        });
      },
      onClicked: cmApi?.onClicked
    };
  }

  /**
   * Alarms API Wrapper
   */
  get alarms() {
    const alarmsApi = this.api?.alarms;
    return {
      create: (name, alarmInfo) => {
        if (alarmsApi) alarmsApi.create(name, alarmInfo);
      },
      clear: (name) => {
        return new Promise((resolve) => {
          if (!alarmsApi) return resolve(false);
          alarmsApi.clear(name, (wasCleared) => resolve(wasCleared));
        });
      },
      onAlarm: alarmsApi?.onAlarm
    };
  }

  /**
   * Check if Incognito mode access is allowed for this extension
   */
  async isAllowedIncognitoAccess() {
    return new Promise((resolve) => {
      if (this.api?.extension?.isAllowedIncognitoAccess) {
        this.api.extension.isAllowedIncognitoAccess((isAllowed) => {
          resolve(!!isAllowed);
        });
      } else {
        resolve(false);
      }
    });
  }
}

export const browserCompat = new BrowserCompat();
export default browserCompat;
