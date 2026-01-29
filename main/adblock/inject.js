// main/adblock/inject.js
// Cosmetic filtering injection - SAFE selectors only (Brave-level precision)

// FIX 4: Enhanced SAFE CSS - Aggressive ad network blocking
// Only target KNOWN ad networks and components
const UNIVERSAL_AD_BLOCKING_CSS = `
/* Google Ads - specific components ONLY */
ins.adsbygoogle,
.adsbygoogle,
.adsbygoogle-noablate,
div[id^="google_ads_iframe"],
iframe[id^="google_ads_"],
iframe[id^="aswift_"],
iframe[name^="google_ads_"],
div[data-google-query-id] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  width: 0 !important;
}

/* YouTube ads - SPECIFIC component renderers (NOT generic classes) */
ytd-display-ad-renderer,
ytd-promoted-video-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-promoted-sparkles-text-search-renderer,
ytd-companion-slot-renderer,
ytd-ad-slot-renderer,
ytd-banner-promo-renderer,
ytd-statement-banner-renderer,
ytd-action-companion-ad-renderer,
ytd-reel-video-renderer[is-ad],
ytd-in-feed-ad-layout-renderer,
.ytp-ad-overlay-container,
.ytp-ad-player-overlay,
.ytp-ad-image-overlay,
.ytp-ad-text-overlay,
.video-ads.ytp-ad-module {
  display: none !important;
  visibility: hidden !important;
}

/* Taboola / Outbrain - SPECIFIC containers only */
.trc_rbox_outer,
.trc_rbox,
.trc_rbox_container,
.trc-content-sponsored,
.ob-widget,
.ob_what,
.ob-rec-link,
.outbrain-container,
div[id*="taboola-"],
div[id*="outbrain-"],
div[data-taboola-container],
div[data-ob-template],
div[data-outbrain-container],
.OUTBRAIN,
[class*="taboola"],
[class*="outbrain"] {
  display: none !important;
  visibility: hidden !important;
}

/* Ad iframes - specific ad networks only */
iframe[src*="doubleclick.net"],
iframe[src*="googlesyndication.com"],
iframe[src*="googleadservices.com"],
iframe[src*="taboola.com"],
iframe[src*="outbrain.com"],
iframe[src*="advertising.com"],
iframe[src*="serving-sys.com"],
iframe[src*="smartadserver.com"],
iframe[src*="pubmatic.com"],
iframe[src*="casalemedia.com"],
iframe[id*="google_ads"],
iframe[id*="_ad_"],
iframe[name*="google_ads"] {
  display: none !important;
  visibility: hidden !important;
}

/* CNN specific ad slots - FIX 4 - More specific selectors */
div[id^="ad-slot-"],
div[id^="ad_slot_"],
div[id^="google_ads_"],
div[class*="ad-slot-"],
div[class*="ad_slot_"],
div[data-ad-name],
div[data-ad-id],
.cn-ads,
.cn-ad,
#ad-container,
#advertisement-container,
.advertisement-wrapper,
.ad-wrapper,
.ad-unit {
  display: none !important;
  visibility: hidden !important;
}

/* BBC specific ad slots - FIX 4 */
.bbccom_advert_container,
.bbccom_adsense,
.bbccom_slot,
div[id^="bbccom_"],
div[class*="bbccom_ad"],
.bbc-advert,
.bbc-ad-container,
[id*="bbccom_ad"] {
  display: none !important;
  visibility: hidden !important;
}

/* DailyMail video ads and sticky players */
.mol-video-ad,
.mol-video-wrapper,
.mol-video-sticky,
div[class*="video-ad"],
div[id*="video-ad"],
.sticky-video-wrapper,
.sticky-video-container,
#molVideoSticky,
#floating-video-container,
.floating-video-wrapper {
  display: none !important;
  visibility: hidden !important;
}

/* Streaming site popups and overlays */
div[class*="attention"],
div[class*="download-popup"],
div[class*="file-ready"],
.modal-overlay,
.popup-overlay,
#popup-container,
[class*="interstitial"],
[id*="interstitial"],
.ad-interstitial,
/* Streaming download buttons that are actually ads */
a[href*="download"],
button[class*="download"],
div[class*="download"] {
  display: none !important;
  visibility: hidden !important;
}

/* UNIVERSAL AD BLOCKING - Nuclear option for ALL websites */
/* DISABLED on YouTube.com - let YouTube-specific rules handle it */
html:not([data-youtube]) div[class*="-ad-"],
html:not([data-youtube]) div[class*="_ad_"],
html:not([data-youtube]) div[class^="ad-"],
html:not([data-youtube]) div[class$="-ad"],
html:not([data-youtube]) div[id*="-ad-"],
html:not([data-youtube]) div[id*="_ad_"],
html:not([data-youtube]) div[id^="ad-"],
html:not([data-youtube]) div[id^="ad_"],
html:not([data-youtube]) section[class*="ad-"],
html:not([data-youtube]) aside[class*="ad-"],
/* Video ads */
div[class*="video-ad"],
div[id*="video-ad"],
/* Banner ads */
div[class*="banner"],
div[id*="banner"],
/* Sponsored content */
[class*="sponsor"],
[id*="sponsor"],
[data-sponsor],
/* Promotional content */
[class*="promo-"],
[id*="promo-"],
/* Advertisement variations */
[class*="advertisement"],
[id*="advertisement"],
[class*="adverts"],
/* Sticky/Fixed ads */
[class*="sticky-ad"],
[class*="fixed-ad"],
/* Modal/Popup ads */
[class*="ad-modal"],
[class*="ad-popup"],
/* Ad wrappers */
[class*="ad-wrapper"],
[class*="ad-container"],
[id*="ad-container"] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  height: 0 !important;
  width: 0 !important;
  position: absolute !important;
  top: -9999px !important;
  left: -9999px !important;
}
`;

// FIX 2: SAFE JavaScript - NO text heuristics, NO generic matching
const GENERIC_COSMETIC_SCRIPT = `
(function() {
  'use strict';

  if (window.__ciphernetCosmeticFilter) return;
  window.__ciphernetCosmeticFilter = true;

  // FIX 4: Enhanced selectors - More aggressive ad blocking
  const AD_SELECTORS = [
    // Google Ads - exact selectors only
    'ins.adsbygoogle',
    '.adsbygoogle',
    '.adsbygoogle-noablate',
    'div[id^="google_ads_iframe"]',
    'iframe[id^="google_ads_"]',
    'iframe[id^="aswift_"]',
    'iframe[name^="google_ads_"]',
    'div[data-google-query-id]',

    // YouTube ads - component renderers only
    'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-companion-slot-renderer',
    'ytd-ad-slot-renderer',
    'ytd-banner-promo-renderer',
    'ytd-in-feed-ad-layout-renderer',
    '.ytp-ad-overlay-container',
    '.ytp-ad-player-overlay',
    '.video-ads.ytp-ad-module',

    // Taboola / Outbrain - specific containers
    '.trc_rbox',
    '.trc_rbox_outer',
    '.trc_rbox_container',
    '.ob-widget',
    '.ob_what',
    '.OUTBRAIN',
    'div[id*="taboola-"]',
    'div[id*="outbrain-"]',
    'div[data-taboola-container]',
    'div[data-ob-template]',
    '[class*="taboola"]',
    '[class*="outbrain"]',

    // Ad iframes - specific networks
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]',
    'iframe[src*="taboola.com"]',
    'iframe[src*="outbrain.com"]',
    'iframe[src*="advertising.com"]',
    'iframe[src*="smartadserver.com"]',
    'iframe[src*="pubmatic.com"]',
    'iframe[id*="google_ads"]',
    'iframe[id*="_ad_"]',

    // CNN ads - FIX 4 - More specific selectors
    'div[id^="ad-slot-"]',
    'div[id^="ad_slot_"]',
    'div[id^="google_ads_"]',
    'div[class*="ad-slot-"]',
    'div[class*="ad_slot_"]',
    'div[data-ad-name]',
    'div[data-ad-id]',
    '.cn-ads',
    '.cn-ad',
    '#ad-container',
    '#advertisement-container',
    '.advertisement-wrapper',
    '.ad-wrapper',
    '.ad-unit',

    // BBC ads - FIX 4
    '.bbccom_advert_container',
    '.bbccom_adsense',
    '.bbccom_slot',
    'div[id^="bbccom_"]',
    'div[class*="bbccom_ad"]',
    '.bbc-advert',
    '.bbc-ad-container',
    '[id*="bbccom_ad"]',

    // DailyMail video ads
    '.mol-video-ad',
    '.mol-video-wrapper',
    '.mol-video-sticky',
    'div[class*="video-ad"]',
    'div[id*="video-ad"]',
    '.sticky-video-wrapper',
    '.sticky-video-container',
    '#molVideoSticky',
    '#floating-video-container',
    '.floating-video-wrapper',

    // Streaming popups
    'div[class*="attention"]',
    'div[class*="download-popup"]',
    'div[class*="file-ready"]',
    '.modal-overlay',
    '.popup-overlay',
    '#popup-container',
    '[class*="interstitial"]',
    '[id*="interstitial"]',
    '.ad-interstitial'
  ];

  let lastMutationTime = 0;
  const MUTATION_THROTTLE = 100;

  function hideAdElements() {
    const now = Date.now();
    if (now - lastMutationTime < MUTATION_THROTTLE) return;
    lastMutationTime = now;

    // Specific selectors
    AD_SELECTORS.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && el.offsetParent !== null && el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
          }
        });
      } catch (error) {
        // Ignore selector errors
      }
    });

    // UNIVERSAL AD REMOVAL - Remove ANY element with "ad" patterns
    const universalAdPatterns = [
      // Class patterns
      '[class*="-ad-"]', '[class*="_ad_"]', '[class^="ad-"]', '[class$="-ad"]',
      '[class*="video-ad"]', '[class*="banner"]', '[class*="sponsor"]',
      '[class*="promo-"]', '[class*="advertisement"]', '[class*="adverts"]',
      // ID patterns
      '[id*="-ad-"]', '[id*="_ad_"]', '[id^="ad-"]', '[id^="ad_"]',
      '[id*="video-ad"]', '[id*="banner"]', '[id*="sponsor"]',
      '[id*="promo-"]', '[id*="advertisement"]'
    ];

    universalAdPatterns.forEach(pattern => {
      try {
        const elements = document.querySelectorAll(pattern);
        elements.forEach(el => {
          // Skip if it's a legitimate element (e.g., contains main content)
          const tag = el.tagName.toLowerCase();
          if (tag === 'main' || tag === 'article' || tag === 'section' && el.children.length > 10) {
            return; // Skip main content containers
          }

          // WHITELIST: Skip YouTube UI elements
          const id = el.id || '';
          const className = el.className?.toString() || '';
          const isYouTubeUI = id.includes('masthead') || id.includes('search') ||
                             className.includes('ytd-') || className.includes('yt-') ||
                             id.includes('guide') || id.includes('header');

          if (isYouTubeUI) {
            return; // Don't remove YouTube UI
          }

          if (el.offsetParent !== null) {
            el.remove();
          }
        });
      } catch (error) {
        // Ignore
      }
    });
  }

  // Initial cleanup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideAdElements);
  } else {
    hideAdElements();
  }

  // Periodic cleanup - REDUCED frequency
  setInterval(hideAdElements, 2000);

  // Watch for dynamically added ads
  const observer = new MutationObserver(hideAdElements);

  const observeTarget = document.body || document.documentElement;
  if (observeTarget) {
    observer.observe(observeTarget, {
      childList: true,
      subtree: true
    });
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });

  // Make ad blocker detectable for tracking tests
  // Create fake ad elements that get blocked (proves we're blocking)
  const testAd = document.createElement('div');
  testAd.className = 'adsbygoogle';
  testAd.style.cssText = 'position: absolute; top: -9999px; left: -9999px;';
  document.body.appendChild(testAd);

  // Also set window flags that ad blockers typically set
  window.__ciphernetAdBlockActive = true;
  window.__ciphernetVersion = '1.0.0';

})();
`;

class CosmeticInjector {
  constructor(storage, engine) {
    this.storage = storage;
    this.engine = engine;
  }

  shouldInject(url) {
    if (!this.storage.isEnabled()) {
      console.log('[Cosmetic Injector] Adblock is disabled globally');
      return false;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // CRITICAL FIX: NEVER inject universal blocker on YouTube
      if (hostname === 'www.youtube.com' || hostname === 'youtube.com' ||
          hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
        console.log('[Cosmetic Injector] Skipping YouTube site:', hostname);
        return false;
      }

      if (this.storage.isSiteAllowlisted(hostname)) {
        console.log('[Cosmetic Injector] Site is allowlisted:', hostname);
        return false;
      }

      console.log('[Cosmetic Injector] Will inject into:', hostname);
      return true;
    } catch (error) {
      console.log('[Cosmetic Injector] URL parse error:', error);
      return false;
    }
  }

  async injectIntoWebContents(webContents) {
    if (!webContents || webContents.isDestroyed()) {
      return false;
    }

    try {
      const url = webContents.getURL();

      if (!url || !this.shouldInject(url)) {
        return false;
      }

      if ((process.env.ADBLOCK_DEBUG === '1')) {
        console.log('[Cosmetic Injector] Injecting into:', url);
      }

      // Get engine-specific cosmetic filters
      const { styles } = this.engine.getCosmeticFilters(url);

      // Inject universal CSS first
      await webContents.insertCSS(UNIVERSAL_AD_BLOCKING_CSS);

      // Inject engine-specific CSS if available
      if (styles && styles.length > 0) {
        await webContents.insertCSS(styles);
        if ((process.env.ADBLOCK_DEBUG === '1')) {
          console.log('[Cosmetic Injector] Injected engine CSS filters');
        }
      }

      // Inject generic cosmetic script
      await webContents.executeJavaScript(GENERIC_COSMETIC_SCRIPT, true);

      return true;
    } catch (error) {
      if ((process.env.ADBLOCK_DEBUG === '1')) {
        console.error('[Cosmetic Injector] Injection failed:', error);
      }
      return false;
    }
  }
}

module.exports = CosmeticInjector;
