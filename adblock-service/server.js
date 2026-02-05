// adblock-service/server.js
// Brave adblock-rs backend service
// This runs as a separate Node.js process and provides ad blocking via HTTP API

const express = require('express');
const cors = require('cors');
const fetch = require('cross-fetch');
const { Engine } = require('adblock-rs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8787;

// Enable CORS for Electron renderer
app.use(cors());
app.use(express.json());

// Brave's actual ad blocking engine
let adblockEngine = null;
let engineReady = false;

// Filter list URLs (same as Brave uses)
const FILTER_LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
  'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt'
];

// YouTube-specific rules
const YOUTUBE_RULES = `
||youtube.com/api/stats/ads$important
||youtube.com/api/stats/qoe?*adformat=$important
||youtube.com/pagead/*$important
||youtube.com/ptracking$important
||youtube.com/get_video_info*&adformat=$important
||youtube.com/youtubei/v1/player/ad_break$important
||youtube.com/get_midroll_info$important
||youtube.com/ad_data_204$important
||googlevideo.com/videoplayback*&oad=$important
||googlevideo.com/videoplayback*&adformat=$important
||googlevideo.com/videoplayback*&ctier=$important
||googlevideo.com/videoplayback*ad_break$important
||googlevideo.com/videoplayback*&ad_cpn=$important
||ads.youtube.com^$important
||imasdk.googleapis.com/js/sdkloader/ima3.js$important
||imasdk.googleapis.com/js/sdkloader/ima3_dai.js$important
||doubleclick.net^$third-party
||googlesyndication.com^$third-party
||googleadservices.com^$third-party
||pagead2.googlesyndication.com^$important
||tpc.googlesyndication.com^$important
||video-ad-stats.googlesyndication.com^$important
||outbrain.com^$third-party
||taboola.com^$third-party
||criteo.com^$third-party
||pubads.g.doubleclick.net^$important
||securepubads.g.doubleclick.net^$important
||googletagmanager.com/gtm.js$third-party
||googletagservices.com/tag/js/gpt.js$important
`.trim();

// Download a filter list
async function downloadFilterList(url) {
  try {
    console.log(`[Adblock Service] Downloading: ${url}`);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CipherNet-AdblockService/1.0' },
      timeout: 60000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    console.log(`[Adblock Service] Downloaded ${content.length} bytes from ${url}`);
    return content;
  } catch (error) {
    console.error(`[Adblock Service] Error downloading ${url}:`, error.message);
    return '';
  }
}

// Initialize the adblock engine
async function initializeEngine() {
  try {
    console.log('[Adblock Service] Initializing Brave adblock engine...');

    // Download all filter lists in parallel
    const downloadPromises = FILTER_LISTS.map(url => downloadFilterList(url));
    const filterContents = await Promise.all(downloadPromises);

    // Combine all filter lists + YouTube rules
    const allRules = filterContents.filter(c => c.length > 0).join('\n') + '\n' + YOUTUBE_RULES;

    // Split into individual rules
    const rulesArray = allRules.split(/[\n\r]+/g).filter(rule => {
      // Filter out comments and empty lines
      const trimmed = rule.trim();
      return trimmed.length > 0 && !trimmed.startsWith('!') && !trimmed.startsWith('#');
    });

    console.log(`[Adblock Service] Loaded ${rulesArray.length} filter rules`);

    // Create Brave's adblock engine
    adblockEngine = new Engine(rulesArray);

    // Serialize to disk for faster startup next time
    const serialized = adblockEngine.serialize();
    const buffer = Buffer.from(serialized);
    fs.writeFileSync(path.join(__dirname, 'engine.dat'), buffer);
    console.log('[Adblock Service] Engine serialized to disk');

    engineReady = true;
    console.log('[Adblock Service] ✓ Brave adblock engine ready!');

    return true;
  } catch (error) {
    console.error('[Adblock Service] Engine initialization failed:', error);
    engineReady = false;
    return false;
  }
}

// Load engine from disk (faster startup)
function loadEngineFromDisk() {
  try {
    const enginePath = path.join(__dirname, 'engine.dat');
    if (fs.existsSync(enginePath)) {
      console.log('[Adblock Service] Loading engine from disk...');
      const buffer = fs.readFileSync(enginePath);
      adblockEngine = Engine.deserialize(buffer);
      engineReady = true;
      console.log('[Adblock Service] ✓ Engine loaded from disk');
      return true;
    }
  } catch (error) {
    console.error('[Adblock Service] Failed to load from disk:', error.message);
  }
  return false;
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    engineReady,
    timestamp: Date.now()
  });
});

// Check if URL should be blocked
app.post('/check', (req, res) => {
  if (!engineReady || !adblockEngine) {
    return res.status(503).json({
      error: 'Engine not ready',
      shouldBlock: false
    });
  }

  try {
    const { url, sourceUrl, resourceType } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check with Brave's engine
    const result = adblockEngine.check(url, sourceUrl || '', resourceType || 'other');

    res.json({
      url,
      shouldBlock: result.matched,
      filter: result.filter || null,
      redirect: result.redirect || null
    });
  } catch (error) {
    console.error('[Adblock Service] Check error:', error);
    res.status(500).json({
      error: error.message,
      shouldBlock: false
    });
  }
});

// Batch check multiple URLs
app.post('/check-batch', (req, res) => {
  if (!engineReady || !adblockEngine) {
    return res.status(503).json({
      error: 'Engine not ready',
      results: []
    });
  }

  try {
    const { urls } = req.body;

    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls must be an array' });
    }

    const results = urls.map(item => {
      try {
        const result = adblockEngine.check(
          item.url,
          item.sourceUrl || '',
          item.resourceType || 'other'
        );

        return {
          url: item.url,
          shouldBlock: result.matched,
          filter: result.filter || null
        };
      } catch (error) {
        return {
          url: item.url,
          shouldBlock: false,
          error: error.message
        };
      }
    });

    res.json({ results });
  } catch (error) {
    console.error('[Adblock Service] Batch check error:', error);
    res.status(500).json({
      error: error.message,
      results: []
    });
  }
});

// Update filter lists
app.post('/update', async (req, res) => {
  try {
    console.log('[Adblock Service] Updating filter lists...');
    await initializeEngine();
    res.json({
      success: true,
      message: 'Filter lists updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
async function start() {
  // Try to load from disk first (faster)
  const loaded = loadEngineFromDisk();

  // If not loaded from disk, download filter lists
  if (!loaded) {
    await initializeEngine();
  }

  app.listen(PORT, () => {
    console.log(`[Adblock Service] Server running on http://localhost:${PORT}`);
    console.log(`[Adblock Service] Engine status: ${engineReady ? 'READY' : 'NOT READY'}`);
  });
}

start();
