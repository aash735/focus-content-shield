# Focus & Content Shield Browser Extension

Privacy-first personal distraction protection, website locking, dedicated word blocking, and adult content shield for deep work and focus.

---

## 🛡️ Features & Architecture

1. **Permanent Website Protection**: Blocks entire website domains (`9xmovies.cologne/*`) at Priority 7,000 using native Declarative Net Request (DNR) rules.
2. **Dedicated "Block by Word" System**:
   - **Type 1 — Website Block**: Protects entire domains.
   - **Type 2 — Domain-Specific Word Rule**: `9xmovies.cologne` + `feelapp` blocks ONLY URLs containing `feelapp` in path/query (`/?s=feelapp`, `/watch/feelapp`), leaving root `/` and non-matching paths accessible.
   - **Type 3 — Global Word Rule**: `ullu` protects matching query URLs across any host without creating a domain block on any website.
3. **Word Match Targets & Boundary Modes**:
   - Match Targets: `Path + Query`, `Hostname`, `Full URL`.
   - Word Modes: `Contains` (substring) vs `Whole Word` (bounded word match avoiding partial word false positives like `feelapp` vs `feelapplication`).
   - Case Handling: Default case-insensitive matching (`FEELAPP`, `feelapp`, `FeelApp`).
4. **Bundled Adult Content Shield**:
   - Bundles 79 adult seed domains in `src/data/adult_domains.json`.
   - Hidden from the normal UI: exposed only as a simple `Adult Content [ ON / OFF ]` toggle.
   - Loaded and normalized programmatically on installation/startup.
   - Enforces strict hostname boundary matching (blocks `pornhub.com`, `www.pornhub.com`, `m.pornhub.com`, `pornhub.com/video/123`, but NOT lookalikes like `notpornhub.com` or `pornhub.com.evil.com`).
5. **Local Offline Blocked Page**:
   - Displays a calm, distraction-free local blocked screen (`src/ui/blocked.html`).
   - Safely parses and renders exact reasons (`Reason: Protected Word` and `Word: "feelapp"`) using DOM-safe `textContent`. Zero external server requests.
6. **Search Engine SafeSearch Enforcement**: Native query transformation forcing SafeSearch on Google, Bing, and DuckDuckGo.
7. **SPA Navigation Protection**: Client-side History API (`pushState`/`replaceState`/`popstate`) interception for single-page applications.

---

## ⚙️ Protection Hierarchy & DNR Quotas

Rules are compiled into native browser `declarativeNetRequest` dynamic rulesets in strict priority order:

```text
Safety Rules (Priority 10,000)
       ↓
Permanent Personal Websites (Priority 7,000)
       ↓
Active Focus Session Rules (Priority 6,500)
       ↓
Active Schedule Rules (Priority 6,200)
       ↓
Adult Category Rules (Priority 6,000)
       ↓
Safe Homepage Loop Exemption (Priority 4,500)
       ↓
Word Protection Rules (Priority 4,000)
       ↓
Search Engine SafeSearch (Priority 1,000)
```

---

## 🔒 Local & Privacy-First Design

- **100% Local Processing**: All URL parsing, word matching, storage, and rule evaluation happen on your device.
- **Zero Telemetry / Zero External Requests**: No browsing data or visited URLs are ever transmitted to remote servers.
- **Bundled Application Data**: The Adult category domain list is bundled inside the extension package (`src/data/adult_domains.json`) and requires zero network downloads.

---

## 🧪 Testing & Verification

Run the automated test suite using Node.js:

```bash
npm test
```

46 automated unit and regression tests prove:
- `https://9xmovies.cologne/` -> **ALLOW** (root homepage accessible)
- `https://9xmovies.cologne/?s=feelapp` -> **BLOCK** (query match)
- `https://9xmovies.cologne/?s=FEELAPP` -> **BLOCK** (case-insensitive)
- `https://not9xmovies.cologne/?s=feelapp` -> **ALLOW** (lookalike domain isolated)
- Global word `ullu` -> `https://example.com/?search=ullu` **BLOCK**, `https://example.com/` **ALLOW**

---

## 🌐 Browser Installation

1. Open Chrome, Edge, or Brave and navigate to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** and select this project directory.


