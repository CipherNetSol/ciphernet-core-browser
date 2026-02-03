// main/adblock/inject.js
// Production YouTube Ad Handler - Electron/Chromium Safe

const UNIVERSAL_AD_BLOCKING_CSS = `
/* Hide ad elements */
ytd-display-ad-renderer,
ytd-promoted-video-renderer,
ytd-ad-slot-renderer,
#panels.ytd-watch-flexy,
ytd-companion-slot-renderer,
ytd-player-legacy-desktop-watch-ads-renderer,
.ytwTopBannerImageTextIconButtonedLayoutViewModelHost { display: none !important; }
`;

const GENERIC_COSMETIC_SCRIPT = `
(function() {
  'use strict';
  if (window.__ciphernetCosmeticFilter) return;
  window.__ciphernetCosmeticFilter = true;

  const AD_SELECTORS = [
    'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer',
    'ytd-ad-slot-renderer',
    '#panels.ytd-watch-flexy',
    'ytd-companion-slot-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.ytwTopBannerImageTextIconButtonedLayoutViewModelHost'
  ];

  function hideAds() {
    AD_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el && el.offsetParent !== null) {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    });
  }

  setInterval(hideAds, 2000);
  if (document.readyState !== 'loading') hideAds();

  // === POPUP AD BLOCKER (all sites) ===
  if (!window.__ciphernetPopupBlocker) {
    window.__ciphernetPopupBlocker = true;

    var currentHost = window.location.hostname.toLowerCase();

    // Helper: check if a URL is an ad
    function isAdUrl(url) {
      if (!url) return false;
      var urlStr = String(url);
      // Tracking params = ad
      if (/aff_id=|affiliate=|clickid=|pbref=|tracking=|clid=|click_id=/i.test(urlStr)) return true;
      try {
        var host = new URL(urlStr).hostname.toLowerCase();
        // Same domain = not an ad (real navigation)
        if (host === currentHost || host.endsWith('.' + currentHost) || currentHost.endsWith('.' + host)) return false;
        // Known ad domains
        var adDomains = [
          'adcash.com','adcolony.com','admeld.com','adnetik.com','adpop.com',
          'adpopup.com','adserve.me','adsterra.com','adtelligent.com','adtarget.com',
          'clickbooth.com','clickdealer.com','doubleclick.net','exoclick.com',
          'exoclick.net','googlesyndication.com','googleadservices.com',
          'inmobi.com','leadflash.com','mobovida.com','popads.net','popcash.net',
          'propellerads.com','propellerads.net','pubmatic.com','smartadserver.com',
          'taboola.com','trafficjunky.com','trafficleader.com','widgetbucks.com',
          'yieldmo.com','appnexus.com','casalemedia.com','outbrain.com',
          'advertising.com','serving-sys.com','vserv.com','bidtellect.com',
          'adspush.com','iclick.com','zumobi.com','videofactory.com',
          'admob.com','adreactor.com','adknowledge.com','adlifetech.com',
          'admix.in','adware.com','adMedia.com','trafficstar.net',
          'adnow.com','adnow.ru','mgid.com','revcontent.com',
          'criteo.com','33across.com','somoaudience.com','conversant.com'
        ];
        for (var i = 0; i < adDomains.length; i++) {
          if (host === adDomains[i] || host.endsWith('.' + adDomains[i])) return true;
        }
      } catch (e) {}
      return false;
    }

    // 1. Override window.open - catches window.open() calls
    var _origOpen = window.open;
    window.open = function (url, target, features) {
      if (url && isAdUrl(String(url))) {
        console.log('[CipherNet-PopupBlock] Blocked window.open:', String(url).substring(0, 100));
        return null;
      }
      return _origOpen.apply(this, arguments);
    };

    // 2. Click interceptor - catches <a target="_blank"> and click-handler redirects
    // This runs at capture phase so it fires BEFORE the site's own handlers
    document.addEventListener('click', function (e) {
      // Walk up from the clicked element to find an <a> tag
      var el = e.target;
      var link = null;
      for (var i = 0; i < 5; i++) {
        if (!el) break;
        if (el.tagName === 'A' && el.href) { link = el; break; }
        el = el.parentElement;
      }
      if (link && link.href) {
        var href = link.href;
        // Block if it's a target="_blank" link to an ad domain
        if (link.target === '_blank' && isAdUrl(href)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.log('[CipherNet-PopupBlock] Blocked <a target=_blank>:', href.substring(0, 100));
          return false;
        }
      }
    }, true); // capture phase

    // 3. Remove fake overlay popups (Download buttons, close-X popups, etc.)
    // Only active on non-YouTube pages — YouTube's own UI uses overlays legitimately
    function removePopupOverlays() {
      if (window.location.hostname.includes('youtube.com')) return;

      var allEls = document.querySelectorAll('*');
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        if (!el || !el.style) continue;
        var style = window.getComputedStyle(el);
        var pos = style.position;
        // Target fixed/absolute overlays that are not part of the page layout
        if (pos !== 'fixed' && pos !== 'absolute') continue;
        // Must be high z-index or cover a large area
        var zIndex = parseInt(style.zIndex) || 0;
        var rect = el.getBoundingClientRect();
        var isLargeOverlay = rect.width > window.innerWidth * 0.3 && rect.height > 50;
        if (zIndex < 100 && !isLargeOverlay) continue;
        // Skip known legit elements
        if (el.id === 'movie_player' || el.id === 'yt-ad-overlay') continue;
        var tag = el.tagName.toLowerCase();
        if (tag === 'video' || tag === 'canvas' || tag === 'iframe') continue;
        // Check if it looks like an ad popup: has Download text or ad-specific keywords
        var text = (el.textContent || '').toLowerCase();
        var cls = (el.className || '').toLowerCase();
        var hasAdKeyword = /\bdownload\b|\bclick here\b|\badblock\b|\badpopup\b|\bbanner ad\b|\bsponsored\b/i.test(text + ' ' + cls);
        // Has a close button (X) and looks like an ad overlay (not a normal UI element)
        var hasCloseBtn = el.querySelector('.fa-times, [aria-label*="close"], [class*="closeBtn"], [class*="close-btn"]');
        if (hasAdKeyword || (hasCloseBtn && zIndex >= 100 && isLargeOverlay)) {
          el.style.setProperty('display', 'none', 'important');
          console.log('[CipherNet-PopupBlock] Removed overlay:', el.tagName, el.className ? el.className.substring(0, 60) : '');
        }
      }

      // Also remove ad iframes directly
      document.querySelectorAll('iframe').forEach(function (iframe) {
        try {
          var src = iframe.src || '';
          if (isAdUrl(src)) {
            iframe.style.setProperty('display', 'none', 'important');
            console.log('[CipherNet-PopupBlock] Hidden ad iframe:', src.substring(0, 100));
          }
        } catch (e) {}
      });
    }

    // Run overlay removal on load and periodically
    if (document.readyState !== 'loading') removePopupOverlays();
    setInterval(removePopupOverlays, 1500);
  }

  // === YOUTUBE AD HANDLER ===
  if (!window.location.hostname.includes('youtube.com')) return;
  if (window.__ytAdHandler) return;
  window.__ytAdHandler = true;

  console.log('[YT-AdBlock] Initializing...');

  let adActive = false;
  let overlay = null;
  let checkInterval = null;
  let video = null;
  let originalMuted = false;
  let originalPlaybackRate = 1;
  let skipClicked = false;
  let skipAttempts = 0;
  let adStartTime = 0;

  // Create overlay (appended to #movie_player)
  function createOverlay() {
    if (overlay) return overlay;

    const player = document.querySelector('#movie_player');
    if (!player) return null;

    overlay = document.createElement('div');
    overlay.id = 'yt-ad-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:#000;z-index:999999;pointer-events:none;display:none;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s';

    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:48px;height:48px;border:4px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite';
    overlay.appendChild(spinner);

    const style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    player.appendChild(overlay);
    return overlay;
  }

  // Check if ad is active
  function isAdActive() {
    const player = document.querySelector('#movie_player');
    if (!player) return false;
    return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  }

  // Try to click skip button (scoped to #movie_player)
  function trySkip() {
    const player = document.querySelector('#movie_player');
    if (!player) return false;

    const video = player.querySelector('video');
    if (!video) return false;

    // Skip very early frames - give player a moment to initialize
    const adElapsed = (Date.now() - adStartTime) / 1000;
    if (adElapsed < 0.5) {
      return false;
    }

    // Check video is actually playing (player readiness)
    if (video.paused || video.seeking || video.readyState < 2) {
      return false;
    }

    // Primary target: .ytp-skip-ad button inside container
    const skipContainer = player.querySelector('.ytp-skip-ad');
    if (!skipContainer || skipContainer.offsetParent === null) return false;

    const btn = skipContainer.querySelector('button.ytp-skip-ad-button');
    if (!btn || btn.offsetParent === null) return false;

    // Check if button is truly clickable (allow opacity 0.5 for YouTube's styling)
    const style = window.getComputedStyle(btn);
    if (parseFloat(style.opacity) < 0.3 || style.pointerEvents === 'none') {
      return false;
    }

    // CRITICAL: Check countdown timer has expired
    const skipText = btn.querySelector('.ytp-skip-ad-button__text');
    if (skipText && skipText.textContent) {
      const text = skipText.textContent.trim().toLowerCase();
      // Must say "skip" not "skip in X"
      if (!text.includes('skip') || text.includes('in ') || /\d/.test(text)) {
        console.log('[YT-AdBlock] Skip timer still counting:', text);
        return false;
      }
    }

    console.log('[YT-AdBlock] Attempting skip at', adElapsed.toFixed(2), 'seconds (real time)');

    // Get button position for system-level click
    const rect = btn.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    // Send request to main process for system-level click
    if (window.ipc && window.ipc.send) {
      console.log('[YT-AdBlock] Requesting system click at', x, y);
      window.ipc.send('youtube-skip-click', { x, y });
    } else {
      // Fallback: try programmatic click (likely won't work)
      console.log('[YT-AdBlock] IPC not available, trying fallback click');
      btn.click();
      btn.focus();
      btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }

    return true;
  }

  // Handle ad state changes
  function handleAd() {
    const player = document.querySelector('#movie_player');
    if (!player) return;

    const nowAdActive = isAdActive();
    video = player.querySelector('video');

    // Ad started
    if (nowAdActive && !adActive) {
      adStartTime = Date.now();
      console.log('[YT-AdBlock] Ad detected');
      adActive = true;

      // Mute and speed up video during ads
      if (video) {
        originalMuted = video.muted;
        originalPlaybackRate = video.playbackRate;
        video.muted = true;
        video.playbackRate = 16;
        console.log('[YT-AdBlock] Video muted (was:', originalMuted, ') and sped up to 16x');
      }
    }
    // Ad is still active - ENFORCE mute and speed continuously
    else if (nowAdActive && adActive) {
      if (video) {
        if (!video.muted) {
          video.muted = true;
          console.log('[YT-AdBlock] Re-muting video (YouTube tried to unmute)');
        }
        if (video.playbackRate !== 16) {
          video.playbackRate = 16;
          console.log('[YT-AdBlock] Re-applying 16x speed (YouTube tried to reset)');
        }
      }

      // Show overlay
      createOverlay();
      if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => {
          if (overlay && adActive) overlay.style.opacity = '1';
        }, 50);
      }

      // Reset skip state
      skipClicked = false;
      skipAttempts = 0;

      // Start checking for skip button every 200ms
      if (checkInterval) clearInterval(checkInterval);
      checkInterval = setInterval(() => {
        if (!adActive || skipClicked) {
          clearInterval(checkInterval);
          checkInterval = null;
          return;
        }

        skipAttempts++;

        // Timeout after 30 seconds (150 attempts at 200ms)
        if (skipAttempts >= 150) {
          console.log('[YT-AdBlock] Skip timeout (30s)');
          clearInterval(checkInterval);
          checkInterval = null;
          return;
        }

        if (trySkip()) {
          skipClicked = true;
          clearInterval(checkInterval);
          checkInterval = null;
        }
      }, 200);
    }
    // Ad ended
    else if (!nowAdActive && adActive) {
      console.log('[YT-AdBlock] Ad ended');
      adActive = false;

      // Stop checking
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }

      // Restore video state - unmute and reset speed
      if (video) {
        video.muted = originalMuted;
        video.playbackRate = originalPlaybackRate;
        console.log('[YT-AdBlock] Restored: muted=' + originalMuted + ', speed=' + originalPlaybackRate + 'x');
      }

      // Hide overlay
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
          if (overlay && !adActive) overlay.style.display = 'none';
        }, 300);
      }
    }
  }

  // Poll for ad state every 250ms
  setInterval(handleAd, 250);

  // MutationObserver on #movie_player for class changes
  const player = document.querySelector('#movie_player');
  if (player) {
    const observer = new MutationObserver(handleAd);
    observer.observe(player, { attributes: true, attributeFilter: ['class'] });
  }

  console.log('[YT-AdBlock] Ready');
})();
`;

class CosmeticInjector {
  constructor(storage, engine) {
    this.storage = storage;
    this.engine = engine;
  }

  shouldInject(url) {
    if (!this.storage.isEnabled()) return false;
    try {
      const hostname = new URL(url).hostname;
      if (this.storage.isSiteAllowlisted(hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  async injectIntoWebContents(webContents) {
    if (!webContents || webContents.isDestroyed()) return false;

    try {
      const url = webContents.getURL();
      if (!url || !this.shouldInject(url)) return false;

      await webContents.insertCSS(UNIVERSAL_AD_BLOCKING_CSS);

      const { styles } = this.engine.getCosmeticFilters(url);
      if (styles && styles.length > 0) {
        await webContents.insertCSS(styles);
      }

      await webContents.executeJavaScript(GENERIC_COSMETIC_SCRIPT, true);
      return true;
    } catch (error) {
      console.error('[Cosmetic Injector] Error:', error);
      return false;
    }
  }
}

module.exports = CosmeticInjector;
