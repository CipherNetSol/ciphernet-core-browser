// main/adblock/inject.js
// Production YouTube Ad Handler - Electron/Chromium Safe

const UNIVERSAL_AD_BLOCKING_CSS = `
/* Hide ad elements */
ytd-display-ad-renderer,
ytd-promoted-video-renderer,
ytd-ad-slot-renderer,
#panels.ytd-watch-flexy { display: none !important; }
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
    '#panels.ytd-watch-flexy'
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

    // CRITICAL: Wait at least 5 seconds into the ad before trying to skip
    // YouTube has server-side skip timer that must expire first
    const adElapsed = (Date.now() - adStartTime) / 1000;
    if (adElapsed < 5.0) {
      return false; // Too early - server-side timer hasn't expired
    }

    // Check video is actually playing (player readiness)
    if (video.paused || video.seeking || video.readyState < 3) {
      return false;
    }

    // Check video has progressed (not frozen at 0:00)
    if (video.currentTime < 0.5) {
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

    console.log('[YT-AdBlock] Attempting skip at', adElapsed.toFixed(1), 'seconds');

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

      // Mute video - ALWAYS mute during ads
      if (video) {
        originalMuted = video.muted;
        video.muted = true;
        console.log('[YT-AdBlock] Video muted (was:', originalMuted, ')');
      }
    }
    // Ad is still active - ENFORCE mute continuously
    else if (nowAdActive && adActive) {
      // Continuously enforce mute state during ad playback
      if (video && !video.muted) {
        video.muted = true;
        console.log('[YT-AdBlock] Re-muting video (YouTube tried to unmute)');
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

      // Restore video state - unmute if it wasn't muted before
      if (video) {
        video.muted = originalMuted;
        console.log('[YT-AdBlock] Video unmuted (restored to:', originalMuted, ')');
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
