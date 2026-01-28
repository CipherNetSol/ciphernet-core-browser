// main/adblock/engine.js
// Ghostery/Cliqz ad blocking engine

const { ElectronBlocker } = require('@ghostery/adblocker-electron')

class AdblockEngine {
  constructor(storage, listManager) {
    this.storage = storage
    this.listManager = listManager
    this.blocker = null
    this.session = null
    this.blockedCounts = new Map()
    this.isAttached = false
  }

  async initialize() {
    try {
      console.log('[Adblock Engine] Initializing Ghostery blocker...')

      // Get combined filter lists
      const filterLists = this.listManager.getCombinedLists()

      if (!filterLists) {
        throw new Error('No filter lists available')
      }

      // Create Ghostery blocker
      this.blocker = ElectronBlocker.parse(filterLists, {
        enableCompression: true
      })

      console.log('[Adblock Engine] Ghostery blocker initialized')
      return true
    } catch (error) {
      console.error('[Adblock Engine] Initialization failed:', error)
      return false
    }
  }

  async buildEngine() {
    return this.initialize()
  }

  async attachToSession(session) {
    if (!this.blocker) {
      console.error('[Adblock Engine] Cannot attach: blocker not initialized')
      return false
    }

    try {
      this.session = session

      // Enable Ghostery blocking
      this.blocker.enableBlockingInSession(session)

      this.blocker.on('request-blocked', (details) => {
        this.incrementBlockedCount(details.webContentsId)
        console.log('[Adblock Engine] ✓ BLOCKED:', details.url.substring(0, 80))
      })

      this.blocker.on('request-redirected', (details) => {
        console.log('[Adblock Engine] Redirected:', details.url)
      })

      // UNIVERSAL AD BLOCKER: Add additional webRequest handler to catch anything Ghostery misses
      session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        const url = details.url.toLowerCase();

        // Block if URL contains ad-related patterns
        const adPatterns = [
          '/ads/', '/ad/', '/advert/', '/advertising/', '/banner/', '/banners/',
          '/sponsor/', '/sponsored/', '/promo/', '/promotional/',
          '/popunder/', '/popup/', '/tracking/', '/tracker/', '/analytics/',
          '/clicktracker/', '/adclick/', '/adserver/', '/adservice/', '/adsystem/',
          'doubleclick', 'googlesyndication', 'googleadservices', 'google-analytics',
          'ad.', 'ads.', 'adserver.', 'banner.', 'click.', 'tracker.', 'analytics.',
          '360yield', 'gammaplatform', 'imrworldwide', 'moatads', 'scorecardresearch',
          'criteo', 'adnxs', 'adsafeprotected', 'outbrain', 'taboola'
        ];

        const isAdUrl = adPatterns.some(pattern => url.includes(pattern));

        if (isAdUrl) {
          this.incrementBlockedCount(details.webContentsId);
          console.log('[Adblock Engine] ✓ UNIVERSAL BLOCK:', details.url.substring(0, 80));
          callback({ cancel: true });
        } else {
          callback({});
        }
      });

      this.isAttached = true
      console.log('[Adblock Engine] Attached to session with Ghostery + Universal Blocker')
      return true
    } catch (error) {
      console.error('[Adblock Engine] Error attaching to session:', error)
      return false
    }
  }

  async detachFromSession() {
    if (this.blocker && this.session) {
      try {
        this.blocker.disableBlockingInSession(this.session)
        // Ghostery blocker doesn't have removeAllListeners, skip it
        if (typeof this.blocker.removeAllListeners === 'function') {
          this.blocker.removeAllListeners('request-blocked')
          this.blocker.removeAllListeners('request-redirected')
        }
        this.isAttached = false
        console.log('[Adblock Engine] Detached from session')
      } catch (error) {
        console.error('[Adblock Engine] Error detaching:', error)
      }
    }
  }

  extractHostname(url) {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch (error) {
      return null
    }
  }

  incrementBlockedCount(webContentsId) {
    if (!webContentsId) return
    const current = this.blockedCounts.get(webContentsId) || 0
    this.blockedCounts.set(webContentsId, current + 1)
  }

  getBlockedCount(webContentsId) {
    return this.blockedCounts.get(webContentsId) || 0
  }

  resetBlockedCount(webContentsId) {
    this.blockedCounts.delete(webContentsId)
  }

  clearAllBlockedCounts() {
    this.blockedCounts.clear()
  }

  async rebuild() {
    console.log('[Adblock Engine] Rebuilding engine...')
    await this.detachFromSession()
    await this.buildEngine()
    if (this.session) {
      await this.attachToSession(this.session)
    }
  }

  getCosmeticFilters(url) {
    if (!this.blocker || !this.storage.isEnabled()) {
      return { styles: '', scripts: [] }
    }

    const hostname = this.extractHostname(url)
    if (hostname && this.storage.isSiteAllowlisted(hostname)) {
      return { styles: '', scripts: [] }
    }

    try {
      const { styles = '', scripts = [] } = this.blocker.getCosmeticsFilters({
        url,
        hostname: hostname || '',
        domain: hostname || ''
      })

      return { styles, scripts }
    } catch (error) {
      console.error('[Adblock Engine] Error getting cosmetic filters:', error)
      return { styles: '', scripts: [] }
    }
  }

  isEnabled() {
    return this.storage.isEnabled()
  }

  setEnabled(enabled) {
    return this.storage.setEnabled(enabled)
  }
}

module.exports = AdblockEngine
