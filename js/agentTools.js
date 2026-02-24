// js/agentTools.js
// Tool definitions that hook into existing browser APIs

var webviews = require('webviews.js')
var browserUI = require('browserUI.js')
var findinpage = require('findinpage.js')
var places = require('places/places.js')
var urlParser = require('util/urlParser.js')
var mixerAPI = require('mixerAPI.js')
var agentCore = require('agentCore.js')

var ipc = require('electron').ipcRenderer

var agentTools = {
  // Pending confirmation callback
  pendingConfirmation: null,
  // Last image attached by user in chat
  lastAttachedImage: null,

  // Get the OpenAI-formatted tool definitions
  getToolDefinitions: function () {
    return [
      // Navigation & Research
      {
        type: 'function',
        function: {
          name: 'navigate',
          description: 'Navigate the current tab to a URL or search query. If the input looks like a URL (contains dots), navigates directly. Otherwise, searches Google.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL or search query to navigate to' }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'smart_search',
          description: 'Search Google and return extracted results with titles, links, and snippets containing useful data like prices, ratings, dates. Use this to research products, flights, deals, information. Do multiple searches with different queries for comprehensive results.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Google search query — be specific, include prices/locations/dates for better results' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'scrape_url',
          description: 'Fetch and extract text content from any URL directly (bypasses CAPTCHA/login issues). Use this to read flight prices, product listings, article content, etc. from specific URLs found via smart_search. Returns the page text content for analysis.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch and extract text content from' }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'open_tabs',
          description: 'Open multiple URLs in new tabs at once. Use after smart_search to open the best results for the user to browse.',
          parameters: {
            type: 'object',
            properties: {
              urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of URLs to open in new tabs'
              }
            },
            required: ['urls']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'go_back',
          description: 'Navigate back in the current tab\'s history',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'go_forward',
          description: 'Navigate forward in the current tab\'s history',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'reload_page',
          description: 'Reload the current page',
          parameters: { type: 'object', properties: {} }
        }
      },
      // YouTube
      {
        type: 'function',
        function: {
          name: 'play_youtube',
          description: 'Search for a YouTube video and automatically play the first result. The video will start playing directly. Use this for general searches like "lofi music" or "javascript tutorial".',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query for YouTube (e.g., "lofi beats", "javascript tutorial")' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'youtube_channel_popular',
          description: 'Go to a YouTube channel and play their most popular/most watched video. Handles navigation, sorting by popular, and clicking the first video automatically. Use this when the user asks for the most watched/popular/viewed video from a specific creator.',
          parameters: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'YouTube channel handle without @ (e.g., "mkbhd", "pewdiepie", "veritasium", "MrBeast")' }
            },
            required: ['channel']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'wait',
          description: 'Wait for a specified number of seconds. Use this to let a page load before interacting with it.',
          parameters: {
            type: 'object',
            properties: {
              seconds: { type: 'number', description: 'Number of seconds to wait (1-15)' }
            },
            required: ['seconds']
          }
        }
      },
      // Page Interaction
      {
        type: 'function',
        function: {
          name: 'type_text',
          description: 'Type text into an input field on the current page. Use CSS selector to target the input, then type the text. Optionally press Enter to submit.',
          parameters: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector of the input field (e.g., "input[name=q]", "#search-input", "input[type=text]")' },
              text: { type: 'string', description: 'Text to type into the input field' },
              press_enter: { type: 'boolean', description: 'Whether to press Enter after typing (default: false)' }
            },
            required: ['selector', 'text']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'click_element',
          description: 'Click an element on the current page. Can use CSS selector OR text content to find the element. For buttons/links without good selectors, use text_content to match by visible text.',
          parameters: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector of the element to click (e.g., "button#submit", ".my-btn"). Optional if text_content is provided.' },
              text_content: { type: 'string', description: 'Find and click element by its visible text content (e.g., "Connect Wallet", "I\'m ready to pump", "Create coin"). Searches buttons, links, and clickable elements.' }
            }
          }
        }
      },
      // Tab Management
      {
        type: 'function',
        function: {
          name: 'new_tab',
          description: 'Open a new tab, optionally with a URL',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Optional URL to open in the new tab' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'close_tab',
          description: 'Close the current active tab',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'switch_tab',
          description: 'Switch to a tab by its index (0-based) or by matching title text',
          parameters: {
            type: 'object',
            properties: {
              index: { type: 'number', description: 'Zero-based index of the tab to switch to' },
              title_match: { type: 'string', description: 'Partial title text to match against open tabs' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_tabs',
          description: 'List all open tabs with their titles and URLs',
          parameters: { type: 'object', properties: {} }
        }
      },
      // Page Interaction
      {
        type: 'function',
        function: {
          name: 'extract_page_content',
          description: 'Extract the text content of the current page for reading or analysis',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'find_in_page',
          description: 'Find text on the current page (highlights matches)',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to search for on the page' }
            },
            required: ['text']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'scroll_page',
          description: 'Scroll the current page up or down',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction' }
            },
            required: ['direction']
          }
        }
      },
      // Wallet (Solana)
      {
        type: 'function',
        function: {
          name: 'get_wallet_balance',
          description: 'Get the current SOL balance of the session wallet',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_wallet_address',
          description: 'Get the current wallet public address',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_sol',
          description: 'Send SOL to an address. REQUIRES USER CONFIRMATION before executing. Always confirm with the user first.',
          parameters: {
            type: 'object',
            properties: {
              recipient: { type: 'string', description: 'Solana address to send to' },
              amount: { type: 'number', description: 'Amount of SOL to send' }
            },
            required: ['recipient', 'amount']
          }
        }
      },
      // Token Deployment (Devnet)
      {
        type: 'function',
        function: {
          name: 'deploy_token',
          description: 'Deploy a new SPL token on Solana Devnet with full metadata (logo, socials, security options). Creates a mint, metadata account, ATA, and mints initial supply. If liquidity_sol > 0, also creates a Raydium CPMM pool. REQUIRES USER CONFIRMATION. The user must have devnet SOL (use airdrop_devnet_sol if needed).',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Token name (max 32 characters)' },
              symbol: { type: 'string', description: 'Token ticker/symbol (max 10 characters)' },
              description: { type: 'string', description: 'Token description (optional — generate a creative one if not provided)' },
              decimals: { type: 'number', description: 'Token decimals (default 9, range 0-18)' },
              initial_supply: { type: 'string', description: 'Initial supply in human-readable units (e.g. "1000000")' },
              logo_url: { type: 'string', description: 'URL to the token logo image. Can be a web URL (https://...) or will auto-use the image attached in chat if available. Optional.' },
              revoke_mint_authority: { type: 'boolean', description: 'Revoke mint authority — no one can mint more tokens (default true, recommended)' },
              revoke_freeze_authority: { type: 'boolean', description: 'Revoke freeze authority — no one can freeze token accounts (default true, recommended)' },
              make_metadata_immutable: { type: 'boolean', description: 'Make metadata immutable — name, symbol and image cannot be changed (default true, recommended)' },
              max_sol_spend: { type: 'number', description: 'Maximum SOL to spend on fees/rent/liquidity' },
              liquidity_sol: { type: 'number', description: 'SOL to add as liquidity in a Raydium CPMM pool. If > 0, creates a pool making the token immediately tradeable. Omit or 0 for token-only deploy.' },
              lp_percent: { type: 'number', description: 'Percent of total supply to put in liquidity pool (default 20, range 1-100). Only used when liquidity_sol > 0.' },
              website: { type: 'string', description: 'Project website URL (optional)' },
              twitter: { type: 'string', description: 'Twitter/X handle or URL (optional)' },
              telegram: { type: 'string', description: 'Telegram group link (optional)' }
            },
            required: ['name', 'symbol', 'initial_supply']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'airdrop_devnet_sol',
          description: 'Request free devnet SOL airdrop to the wallet. Use this before deploying tokens on devnet if the wallet has insufficient balance. Max 2 SOL per request.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Amount of SOL to airdrop (default 1, max 2)' }
            }
          }
        }
      },
      // Mixer (Crypto Exchange)
      {
        type: 'function',
        function: {
          name: 'mixer_get_currencies',
          description: 'Get a list of all available currencies for mixing/exchanging. Returns tickers and networks.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mixer_estimate',
          description: 'Get an estimated exchange rate and output amount for a mixer swap. Always call this before creating an exchange to show the user what they will receive.',
          parameters: {
            type: 'object',
            properties: {
              from_currency: { type: 'string', description: 'Source currency ticker (e.g., "sol", "btc", "eth", "usdt")' },
              to_currency: { type: 'string', description: 'Destination currency ticker (e.g., "btc", "eth", "sol")' },
              from_network: { type: 'string', description: 'Source network (e.g., "sol", "btc", "eth", "bsc")' },
              to_network: { type: 'string', description: 'Destination network (e.g., "btc", "eth", "sol", "bsc")' },
              amount: { type: 'number', description: 'Amount of source currency to exchange' }
            },
            required: ['from_currency', 'to_currency', 'from_network', 'to_network', 'amount']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mixer_create_exchange',
          description: 'Create a mixer exchange order. REQUIRES USER CONFIRMATION. Always call mixer_estimate first. Returns a deposit address where the user must send funds.',
          parameters: {
            type: 'object',
            properties: {
              from_currency: { type: 'string', description: 'Source currency ticker' },
              to_currency: { type: 'string', description: 'Destination currency ticker' },
              from_network: { type: 'string', description: 'Source network' },
              to_network: { type: 'string', description: 'Destination network' },
              amount: { type: 'number', description: 'Amount of source currency to exchange' },
              recipient_address: { type: 'string', description: 'Destination wallet address to receive exchanged funds' }
            },
            required: ['from_currency', 'to_currency', 'from_network', 'to_network', 'amount', 'recipient_address']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mixer_get_status',
          description: 'Check the status of an existing mixer exchange order',
          parameters: {
            type: 'object',
            properties: {
              transaction_id: { type: 'string', description: 'The transaction/order ID to check' }
            },
            required: ['transaction_id']
          }
        }
      },
      // Bridge (Cross-Chain)
      {
        type: 'function',
        function: {
          name: 'bridge_get_currencies',
          description: 'Get a list of all available currencies and networks for cross-chain bridging via NullTrace Bridge.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'bridge_simulate',
          description: 'Simulate a bridge transfer to see estimated output, fees, and limits. Always call this before creating a bridge order.',
          parameters: {
            type: 'object',
            properties: {
              from_network: { type: 'string', description: 'Source network (e.g., "sol", "eth", "btc", "bsc")' },
              from_currency: { type: 'string', description: 'Source currency ticker (e.g., "sol", "eth", "btc")' },
              to_network: { type: 'string', description: 'Destination network' },
              to_currency: { type: 'string', description: 'Destination currency ticker' },
              amount: { type: 'number', description: 'Amount to bridge' },
              privacy: { type: 'string', enum: ['fast', 'semi', 'full'], description: 'Privacy level: fast (standard), semi (private), full (XMR routing)' }
            },
            required: ['from_network', 'from_currency', 'to_network', 'to_currency', 'amount', 'privacy']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'bridge_create_order',
          description: 'Create a bridge transfer order. REQUIRES USER CONFIRMATION. Always call bridge_simulate first. Returns a deposit address.',
          parameters: {
            type: 'object',
            properties: {
              from_network: { type: 'string', description: 'Source network' },
              from_currency: { type: 'string', description: 'Source currency ticker' },
              to_network: { type: 'string', description: 'Destination network' },
              to_currency: { type: 'string', description: 'Destination currency ticker' },
              amount: { type: 'number', description: 'Amount to bridge' },
              privacy: { type: 'string', enum: ['fast', 'semi', 'full'], description: 'Privacy level' },
              recipient_address: { type: 'string', description: 'Destination wallet address to receive bridged funds' }
            },
            required: ['from_network', 'from_currency', 'to_network', 'to_currency', 'amount', 'privacy', 'recipient_address']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'bridge_get_status',
          description: 'Check the status of an existing bridge order',
          parameters: {
            type: 'object',
            properties: {
              order_id: { type: 'string', description: 'The bridge order ID to check' }
            },
            required: ['order_id']
          }
        }
      },
      // Browser Features
      {
        type: 'function',
        function: {
          name: 'bookmark_page',
          description: 'Bookmark the current page',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'toggle_adblock',
          description: 'Toggle the ad blocker on or off',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_current_page_info',
          description: 'Get the URL and title of the current page',
          parameters: { type: 'object', properties: {} }
        }
      },
      // Utility
      {
        type: 'function',
        function: {
          name: 'summarize_page',
          description: 'Extract the current page content and provide a summary. Use this when user asks to summarize, read, or explain the current page. This reads the ACTIVE TAB — no URL needed.',
          parameters: { type: 'object', properties: {} }
        }
      },
      // Form Discovery & Interaction
      {
        type: 'function',
        function: {
          name: 'get_page_input_fields',
          description: 'Discover all input fields, textareas, selects, and file inputs on the current page. Returns field details including selectors, types, labels, and current values. Use this BEFORE filling any forms to know what fields exist.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'set_input_value',
          description: 'Set the value of an input field using React/Vue/Angular compatible method. Works with modern web frameworks by using native input value setter and dispatching proper events. Use get_page_input_fields first to find the right selector.',
          parameters: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector of the input field' },
              value: { type: 'string', description: 'Value to set in the field' }
            },
            required: ['selector', 'value']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'select_file',
          description: 'Set a file on a file input element. If the user attached an image in the chat (via 📎 button), it will be automatically used. Otherwise downloads from URL or opens file picker. If selector is omitted, automatically finds the first input[type="file"] on the page.',
          parameters: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector of the file input element (optional — auto-detects if omitted)' },
              file_url: { type: 'string', description: 'URL of the file/image to download and attach (optional — if not provided, uses attached image or opens file picker)' }
            },
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_sol_price',
          description: 'Get the current price of SOL (Solana) in USD. Use this when user asks about SOL price, crypto prices, or needs to know the value.',
          parameters: { type: 'object', properties: {} }
        }
      },
      // Website Safety
      {
        type: 'function',
        function: {
          name: 'check_website_safety',
          description: 'Check if a website is safe. Performs multiple security checks: HTTPS, malware databases, domain age, SSL validity, and suspicious patterns. Use this when user asks if a website is safe, trustworthy, or legit.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to check. If omitted, checks the current page.' }
            }
          }
        }
      },
      // Region Detection
      {
        type: 'function',
        function: {
          name: 'get_user_region',
          description: 'Get the user\'s likely region/country based on browser locale and timezone. Useful for localizing shopping searches and product availability.',
          parameters: { type: 'object', properties: {} }
        }
      },
      // Wallet Burn
      {
        type: 'function',
        function: {
          name: 'burn_wallet',
          description: 'Permanently destroy the current wallet and generate a new one. REQUIRES USER CONFIRMATION. If the wallet has any SOL or tokens, warns about permanent fund loss before proceeding.',
          parameters: { type: 'object', properties: {} }
        }
      }
    ]
  },

  // Execute a tool by name with given arguments
  executeTool: async function (toolName, args) {
    switch (toolName) {
      case 'navigate':
        return agentTools.navigate(args.url)
      case 'smart_search':
        return agentTools.smartSearch(args.query)
      case 'scrape_url':
        return agentTools.scrapeUrl(args.url)
      case 'open_tabs':
        return agentTools.openTabs(args.urls)
      case 'go_back':
        return agentTools.goBack()
      case 'go_forward':
        return agentTools.goForward()
      case 'reload_page':
        return agentTools.reloadPage()
      case 'play_youtube':
        return agentTools.playYouTube(args.query)
      case 'youtube_channel_popular':
        return agentTools.youtubeChannelPopular(args.channel)
      case 'wait':
        return agentTools.wait(args.seconds)
      case 'type_text':
        return agentTools.typeText(args.selector, args.text, args.press_enter)
      case 'click_element':
        return agentTools.clickElement(args.selector, args.text_content)
      case 'new_tab':
        return agentTools.newTab(args.url)
      case 'close_tab':
        return agentTools.closeTab()
      case 'switch_tab':
        return agentTools.switchTab(args.index, args.title_match)
      case 'list_tabs':
        return agentTools.listTabs()
      case 'extract_page_content':
        return agentTools.extractPageContent()
      case 'find_in_page':
        return agentTools.findInPage(args.text)
      case 'scroll_page':
        return agentTools.scrollPage(args.direction)
      case 'get_wallet_balance':
        return agentTools.getWalletBalance()
      case 'get_wallet_address':
        return agentTools.getWalletAddress()
      case 'send_sol':
        return agentTools.sendSol(args.recipient, args.amount)
      case 'mixer_get_currencies':
        return agentTools.mixerGetCurrencies()
      case 'mixer_estimate':
        return agentTools.mixerEstimate(args.from_currency, args.to_currency, args.from_network, args.to_network, args.amount)
      case 'mixer_create_exchange':
        return agentTools.mixerCreateExchange(args.from_currency, args.to_currency, args.from_network, args.to_network, args.amount, args.recipient_address)
      case 'mixer_get_status':
        return agentTools.mixerGetStatus(args.transaction_id)
      case 'bridge_get_currencies':
        return agentTools.bridgeGetCurrencies()
      case 'bridge_simulate':
        return agentTools.bridgeSimulate(args.from_network, args.from_currency, args.to_network, args.to_currency, args.amount, args.privacy)
      case 'bridge_create_order':
        return agentTools.bridgeCreateOrder(args.from_network, args.from_currency, args.to_network, args.to_currency, args.amount, args.privacy, args.recipient_address)
      case 'bridge_get_status':
        return agentTools.bridgeGetStatus(args.order_id)
      case 'bookmark_page':
        return agentTools.bookmarkPage()
      case 'toggle_adblock':
        return agentTools.toggleAdblock()
      case 'get_current_page_info':
        return agentTools.getCurrentPageInfo()
      case 'summarize_page':
        return agentTools.summarizePage()
      case 'get_page_input_fields':
        return agentTools.getPageInputFields()
      case 'set_input_value':
        return agentTools.setInputValue(args.selector, args.value)
      case 'select_file':
        return agentTools.selectFile(args.selector, args.file_url)
      case 'get_sol_price':
        return agentTools.getSolPrice()
      case 'deploy_token':
        return agentTools.deployToken(args)
      case 'airdrop_devnet_sol':
        return agentTools.airdropDevnetSol(args.amount)
      case 'check_website_safety':
        return agentTools.checkWebsiteSafety(args.url)
      case 'get_user_region':
        return agentTools.getUserRegion()
      case 'burn_wallet':
        return agentTools.burnWallet()
      default:
        return { error: 'Unknown tool: ' + toolName }
    }
  },

  // --- Tool implementations ---

  navigate: function (url) {
    if (!url) return { error: 'No URL provided' }

    var isURL = url.includes('.') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('localhost')
    var urlToNavigate

    if (isURL) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        urlToNavigate = 'https://' + url
      } else {
        urlToNavigate = url
      }
    } else {
      urlToNavigate = 'https://www.google.com/search?q=' + encodeURIComponent(url)
    }

    var tabId = tabs.getSelected()
    tabs.update(tabId, { url: urlToNavigate })
    webviews.update(tabId, urlToNavigate)

    return { success: true, url: urlToNavigate }
  },

  smartSearch: async function (query) {
    if (!query) return { error: 'No search query provided' }

    try {
      var result = await ipc.invoke('agent:smartSearch', { query: query })
      if (result.error) {
        return { error: result.error }
      }
      return {
        success: true,
        query: query,
        results: result.results || [],
        total: (result.results || []).length
      }
    } catch (e) {
      return { error: e.message || 'Search failed' }
    }
  },

  scrapeUrl: async function (url) {
    if (!url) return { error: 'No URL provided' }

    try {
      var result = await ipc.invoke('agent:scrapeUrl', { url: url })
      if (result.error) {
        return { error: result.error }
      }
      return {
        success: true,
        url: url,
        title: result.title || '',
        text: result.text || '',
        length: (result.text || '').length
      }
    } catch (e) {
      return { error: e.message || 'Failed to scrape URL' }
    }
  },

  openTabs: function (urls) {
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return { error: 'No URLs provided' }
    }

    var opened = []
    for (var i = 0; i < urls.length; i++) {
      var url = urls[i]
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      var tabData = { url: url }
      var newTabId = tabs.add(tabData)
      browserUI.addTab(newTabId, { enterEditMode: false })
      opened.push(url)
    }

    return { success: true, opened: opened, count: opened.length }
  },

  goBack: function () {
    webviews.callAsync(tabs.getSelected(), 'goBack')
    return { success: true }
  },

  goForward: function () {
    webviews.callAsync(tabs.getSelected(), 'goForward')
    return { success: true }
  },

  reloadPage: function () {
    webviews.callAsync(tabs.getSelected(), 'reload')
    return { success: true }
  },

  playYouTube: function (query) {
    if (!query) return { error: 'No search query provided' }

    var ytUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
    var tabId = tabs.getSelected()
    tabs.update(tabId, { url: ytUrl })
    webviews.update(tabId, ytUrl)

    // After the page loads, auto-click the first video result
    return new Promise(function (resolve) {
      setTimeout(function () {
        webviews.callAsync(tabId, 'executeJavaScript', `
          (function() {
            // Try to find and click the first video link in YouTube search results
            var selectors = [
              'ytd-video-renderer a#video-title',
              'ytd-video-renderer a.ytd-video-renderer',
              'a#video-title',
              'ytd-video-renderer h3 a',
              'ytd-rich-item-renderer a#video-title-link',
              'a[href*="/watch?v="]'
            ];
            for (var i = 0; i < selectors.length; i++) {
              var el = document.querySelector(selectors[i]);
              if (el && el.href) {
                window.location.href = el.href;
                return JSON.stringify({ success: true, clicked: el.href, title: el.textContent.trim() });
              }
            }
            return JSON.stringify({ success: false, message: 'Could not find video to click. Results are shown.' });
          })()
        `, function (err, result) {
          if (err) {
            resolve({ success: true, message: 'Navigated to YouTube search for: ' + query + '. Click a video to play it.', url: ytUrl })
          } else {
            try {
              var parsed = JSON.parse(result)
              if (parsed.success) {
                resolve({ success: true, message: 'Playing: ' + (parsed.title || query), url: parsed.clicked })
              } else {
                resolve({ success: true, message: 'Navigated to YouTube search for: ' + query + '. Click a video to play it.', url: ytUrl })
              }
            } catch (e) {
              resolve({ success: true, message: 'Navigated to YouTube search for: ' + query, url: ytUrl })
            }
          }
        })
      }, 4000) // Wait for YouTube search results to load
    })
  },

  youtubeChannelPopular: function (channel) {
    if (!channel) return { error: 'No channel name provided' }

    // Clean up channel name - remove @ if present
    channel = channel.replace(/^@/, '')

    var channelUrl = 'https://www.youtube.com/@' + channel + '/videos'
    var tabId = tabs.getSelected()
    tabs.update(tabId, { url: channelUrl })
    webviews.update(tabId, channelUrl)

    return new Promise(function (resolve) {
      // Step 1: Wait for channel page to load, then click "Popular" sort chip
      setTimeout(function () {
        webviews.callAsync(tabId, 'executeJavaScript', `
          (function() {
            // Find and click the "Popular" chip/tab on the channel videos page
            // YouTube uses yt-chip-cloud-chip-renderer or yt-formatted-string inside chips
            var chips = document.querySelectorAll('yt-chip-cloud-chip-renderer, yt-chip-cloud-renderer yt-formatted-string, iron-selector yt-formatted-string, #chips yt-chip-cloud-chip-renderer');
            for (var i = 0; i < chips.length; i++) {
              var text = chips[i].textContent.trim().toLowerCase();
              if (text === 'popular') {
                chips[i].click();
                return JSON.stringify({ clicked: 'popular', success: true });
              }
            }
            // Fallback: try anchor/button with Popular text
            var allElements = document.querySelectorAll('a, button, [role="tab"]');
            for (var j = 0; j < allElements.length; j++) {
              var t = allElements[j].textContent.trim().toLowerCase();
              if (t === 'popular') {
                allElements[j].click();
                return JSON.stringify({ clicked: 'popular_fallback', success: true });
              }
            }
            return JSON.stringify({ success: false, message: 'Could not find Popular button' });
          })()
        `, function (err, result) {
          if (err) {
            // Even if clicking Popular fails, try to click first video anyway
          }

          // Step 2: Wait for videos to re-sort, then click the first video
          setTimeout(function () {
            webviews.callAsync(tabId, 'executeJavaScript', `
              (function() {
                // Try multiple selectors for YouTube video thumbnails on channel page
                var selectors = [
                  'ytd-rich-item-renderer a#video-title-link',
                  'ytd-rich-item-renderer a#video-title',
                  'ytd-grid-video-renderer a#video-title',
                  'ytd-rich-grid-media a#video-title-link',
                  'a#video-title',
                  'ytd-rich-item-renderer a[href*="/watch?v="]',
                  'a[href*="/watch?v="]'
                ];
                for (var i = 0; i < selectors.length; i++) {
                  var el = document.querySelector(selectors[i]);
                  if (el && el.href) {
                    var title = el.textContent.trim() || el.getAttribute('title') || '';
                    window.location.href = el.href;
                    return JSON.stringify({ success: true, title: title, url: el.href });
                  }
                }
                // Last resort: click any thumbnail image link
                var thumbLink = document.querySelector('ytd-rich-item-renderer a.ytd-thumbnail, ytd-grid-video-renderer a.ytd-thumbnail');
                if (thumbLink && thumbLink.href) {
                  window.location.href = thumbLink.href;
                  return JSON.stringify({ success: true, title: 'video', url: thumbLink.href });
                }
                return JSON.stringify({ success: false, message: 'Could not find a video to play' });
              })()
            `, function (err2, result2) {
              if (err2) {
                resolve({ success: true, message: 'Navigated to ' + channel + ' channel. Could not auto-click video.', url: channelUrl })
                return
              }
              try {
                var parsed = JSON.parse(result2)
                if (parsed.success) {
                  resolve({ success: true, message: 'Playing most popular video by ' + channel + ': ' + (parsed.title || ''), url: parsed.url })
                } else {
                  resolve({ success: true, message: 'Navigated to ' + channel + ' channel sorted by popular. ' + (parsed.message || ''), url: channelUrl })
                }
              } catch (e) {
                resolve({ success: true, message: 'Navigated to ' + channel + ' channel.', url: channelUrl })
              }
            })
          }, 3000) // Wait for Popular sort to take effect
        })
      }, 4000) // Wait for channel page to load
    })
  },

  wait: function (seconds) {
    if (!seconds || seconds < 1) seconds = 1
    if (seconds > 15) seconds = 15

    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ success: true, waited: seconds + ' seconds' })
      }, seconds * 1000)
    })
  },

  typeText: function (selector, text, pressEnter) {
    if (!selector || !text) return { error: 'Selector and text are required' }

    return new Promise(function (resolve) {
      var tabId = tabs.getSelected()
      webviews.callAsync(tabId, 'executeJavaScript', `
        (function() {
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) {
            return JSON.stringify({ error: 'Input field not found: ' + ${JSON.stringify(selector)} });
          }
          el.focus();
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          ${pressEnter ? `
          setTimeout(function() {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            if (el.form) el.form.submit();
          }, 100);
          ` : ''}
          return JSON.stringify({ success: true, typed: ${JSON.stringify(text)}, enter: ${pressEnter ? 'true' : 'false'} });
        })()
      `, function (err, result) {
        if (err) {
          resolve({ error: 'Failed to type text: ' + (err.message || err) })
        } else {
          try {
            resolve(JSON.parse(result))
          } catch (e) {
            resolve({ success: true })
          }
        }
      })
    })
  },

  clickElement: function (selector, textContent) {
    if (!selector && !textContent) return { error: 'Provide either a CSS selector or text_content to find the element' }

    return new Promise(function (resolve) {
      var tabId = tabs.getSelected()

      var script
      if (textContent && !selector) {
        // Text-based search: find the SMALLEST (most specific) element matching the text
        // Uses real mouse events for React compatibility
        script = `
          (function() {
            var searchText = ${JSON.stringify(textContent)}.toLowerCase().trim();

            function simulateClick(el) {
              var rect = el.getBoundingClientRect();
              var x = rect.left + rect.width / 2;
              var y = rect.top + rect.height / 2;
              var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
              el.dispatchEvent(new MouseEvent('pointerdown', opts));
              el.dispatchEvent(new MouseEvent('mousedown', opts));
              el.dispatchEvent(new MouseEvent('pointerup', opts));
              el.dispatchEvent(new MouseEvent('mouseup', opts));
              el.dispatchEvent(new MouseEvent('click', opts));
            }

            // Collect ALL visible matching elements, then pick the smallest one
            var selectors = 'button, a, [role="button"], input[type="submit"], input[type="button"], [onclick], .btn, .button, div, span, p, li, td, label';
            var candidates = document.querySelectorAll(selectors);
            var exactMatches = [];
            var containsMatches = [];

            for (var i = 0; i < candidates.length; i++) {
              var el = candidates[i];
              var elText = (el.textContent || el.value || '').trim().toLowerCase();
              if (!elText) continue;
              var rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) continue;
              var area = rect.width * rect.height;

              if (elText === searchText) {
                exactMatches.push({ el: el, area: area, text: elText });
              } else if (elText.includes(searchText) && elText.length < searchText.length * 3) {
                containsMatches.push({ el: el, area: area, text: elText });
              }
            }

            // Prefer exact matches, then contains matches — always pick smallest (most specific)
            var pool = exactMatches.length > 0 ? exactMatches : containsMatches;
            if (pool.length === 0) {
              return JSON.stringify({ error: 'No element found with text: ' + ${JSON.stringify(textContent)} });
            }

            pool.sort(function(a, b) { return a.area - b.area; });
            var best = pool[0].el;

            simulateClick(best);
            return JSON.stringify({ success: true, tag: best.tagName.toLowerCase(), text: (best.textContent || '').trim().substring(0, 100), area: pool[0].area, matched_by: exactMatches.length > 0 ? 'exact' : 'contains', candidates_found: pool.length });
          })()
        `
      } else {
        // CSS selector based click — also uses real mouse events for React compatibility
        script = `
          (function() {
            var el = document.querySelector(${JSON.stringify(selector || '')});
            if (!el) {
              return JSON.stringify({ error: 'Element not found: ' + ${JSON.stringify(selector || '')} });
            }
            var rect = el.getBoundingClientRect();
            var x = rect.left + rect.width / 2;
            var y = rect.top + rect.height / 2;
            var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
            el.dispatchEvent(new MouseEvent('pointerdown', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            var tag = el.tagName.toLowerCase();
            var text = (el.textContent || '').trim().substring(0, 100);
            var href = el.href || '';
            return JSON.stringify({ success: true, tag: tag, text: text, href: href });
          })()
        `
      }

      webviews.callAsync(tabId, 'executeJavaScript', script, function (err, result) {
        if (err) {
          resolve({ error: 'Failed to click element: ' + (err.message || err) })
        } else {
          try {
            resolve(JSON.parse(result))
          } catch (e) {
            resolve({ success: true })
          }
        }
      })
    })
  },

  newTab: function (url) {
    var tabData = {}
    if (url) {
      var isURL = url.includes('.') || url.startsWith('http')
      if (isURL && !url.startsWith('http')) {
        url = 'https://' + url
      } else if (!isURL) {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url)
      }
      tabData.url = url
    }

    var newTabId = tabs.add(tabData)
    browserUI.addTab(newTabId, { enterEditMode: !url })

    return { success: true, tabId: newTabId, url: url || 'new tab' }
  },

  closeTab: function () {
    browserUI.closeTab(tabs.getSelected())
    return { success: true }
  },

  switchTab: function (index, titleMatch) {
    if (typeof index === 'number') {
      var tab = tabs.getAtIndex(index)
      if (tab) {
        browserUI.switchToTab(tab.id)
        return { success: true, switched_to: { index: index, title: tab.title, url: tab.url } }
      }
      return { error: 'No tab at index ' + index }
    }

    if (titleMatch) {
      var allTabs = tabs.get()
      var lowerMatch = titleMatch.toLowerCase()
      for (var i = 0; i < allTabs.length; i++) {
        if (allTabs[i].title && allTabs[i].title.toLowerCase().includes(lowerMatch)) {
          browserUI.switchToTab(allTabs[i].id)
          return { success: true, switched_to: { index: i, title: allTabs[i].title, url: allTabs[i].url } }
        }
      }
      return { error: 'No tab matching: ' + titleMatch }
    }

    return { error: 'Provide either index or title_match' }
  },

  listTabs: function () {
    var allTabs = tabs.get()
    var result = allTabs.map(function (tab, index) {
      return {
        index: index,
        title: tab.title || '(no title)',
        url: tab.url || '(new tab)',
        active: tab.id === tabs.getSelected()
      }
    })
    return { tabs: result, count: result.length }
  },

  extractPageContent: function () {
    return new Promise(function (resolve) {
      var tabId = tabs.getSelected()
      webviews.callAsync(tabId, 'executeJavaScript', `
        (function() {
          var text = document.body ? document.body.innerText : '';
          var title = document.title || '';
          var meta = document.querySelector('meta[name="description"]');
          var description = meta ? meta.getAttribute('content') : '';
          return JSON.stringify({ title: title, description: description, text: text.substring(0, 15000) });
        })()
      `, function (err, result) {
        if (err) {
          resolve({ error: 'Failed to extract content: ' + (err.message || err) })
        } else {
          try {
            var parsed = JSON.parse(result)
            resolve({ success: true, title: parsed.title, description: parsed.description, text: parsed.text })
          } catch (e) {
            resolve({ success: true, text: result ? result.substring(0, 15000) : '' })
          }
        }
      })
    })
  },

  findInPage: function (text) {
    if (!text) return { error: 'No search text provided' }

    findinpage.start()
    findinpage.input.value = text
    findinpage.input.dispatchEvent(new Event('input'))

    return { success: true, searching_for: text }
  },

  scrollPage: function (direction) {
    var tabId = tabs.getSelected()
    var scrollScript

    switch (direction) {
      case 'up':
        scrollScript = 'window.scrollBy(0, -500)'
        break
      case 'down':
        scrollScript = 'window.scrollBy(0, 500)'
        break
      case 'top':
        scrollScript = 'window.scrollTo(0, 0)'
        break
      case 'bottom':
        scrollScript = 'window.scrollTo(0, document.body.scrollHeight)'
        break
      default:
        return { error: 'Invalid direction: ' + direction }
    }

    webviews.callAsync(tabId, 'executeJavaScript', scrollScript)
    return { success: true, direction: direction }
  },

  getWalletBalance: async function () {
    try {
      var result = await ipc.invoke('wallet:getBalance')
      if (result.success) {
        return { success: true, balance: result.data.sol + ' SOL', lamports: result.data.lamports }
      }
      return { error: result.error || 'Failed to get balance' }
    } catch (e) {
      return { error: e.message }
    }
  },

  getWalletAddress: async function () {
    try {
      var result = await ipc.invoke('wallet:getPublicKey')
      if (result.success) {
        return { success: true, address: result.data.publicKey }
      }
      return { error: result.error || 'Failed to get address' }
    } catch (e) {
      return { error: e.message }
    }
  },

  sendSol: function (recipient, amount) {
    if (!recipient || !amount) {
      return { error: 'Recipient and amount are required' }
    }

    return new Promise(function (resolve) {
      agentTools.pendingConfirmation = {
        action: 'send_sol',
        recipient: recipient,
        amount: amount,
        resolve: resolve
      }

      if (agentTools.onConfirmationNeeded) {
        agentTools.onConfirmationNeeded({
          action: 'send_sol',
          message: 'Send ' + amount + ' SOL to ' + recipient.substring(0, 8) + '...' + recipient.substring(recipient.length - 4),
          details: { recipient: recipient, amount: amount }
        })
      }
    })
  },

  // Called by the panel when user confirms
  handleConfirmation: async function (approved) {
    if (!agentTools.pendingConfirmation) return

    var pending = agentTools.pendingConfirmation
    agentTools.pendingConfirmation = null

    if (!approved) {
      pending.resolve({ cancelled: true, message: 'User cancelled the action' })
      return
    }

    try {
      if (pending.action === 'send_sol') {
        var result = await ipc.invoke('wallet:sendSOL', {
          recipient: pending.recipient,
          amount: pending.amount
        })
        if (result.success) {
          pending.resolve({ success: true, message: 'Sent ' + pending.amount + ' SOL successfully', signature: result.data.signature })
        } else {
          pending.resolve({ error: result.error || 'Transaction failed' })
        }
      } else if (pending.action === 'mixer_create_exchange') {
        var exchangeResult = await mixerAPI.createExchange(pending.params)
        if (exchangeResult.success) {
          pending.resolve({
            success: true,
            message: 'Exchange created. Send funds to the deposit address.',
            order_id: exchangeResult.data.id,
            deposit_address: exchangeResult.data.payinAddress,
            estimated_output: exchangeResult.data.toAmount
          })
        } else {
          pending.resolve({ error: exchangeResult.error || 'Failed to create exchange' })
        }
      } else if (pending.action === 'bridge_create_order') {
        var bridgeResult = await ipc.invoke('bridge:createBridge', pending.params)
        if (bridgeResult.success) {
          var data = bridgeResult.data
          pending.resolve({
            success: true,
            message: 'Bridge order created. Send funds to the deposit address.',
            order_id: data.id || data.orderId || data.order_id,
            deposit_address: data.depositAddress || data.deposit_address || data.address,
            estimated_output: data.toAmount || data.estimatedAmount || data.receiveAmount
          })
        } else {
          pending.resolve({ error: bridgeResult.error || 'Failed to create bridge order' })
        }
      } else if (pending.action === 'burn_wallet') {
        var burnResult = await ipc.invoke('wallet:burnAndRegenerate')
        if (burnResult.success) {
          pending.resolve({
            success: true,
            message: 'Wallet burned and regenerated.',
            new_address: burnResult.data.publicKey,
            network: burnResult.data.network
          })
        } else {
          pending.resolve({ error: burnResult.error || 'Failed to burn wallet' })
        }
      } else if (pending.action === 'deploy_token') {
        // Route to pool creation if liquidity is specified
        var hasLP = pending.params.liquiditySol && pending.params.liquiditySol > 0
        var ipcChannel = hasLP ? 'wallet:deployTokenWithLiquidity' : 'wallet:deployToken'
        var deployResult = await ipc.invoke(ipcChannel, pending.params)
        if (deployResult.success) {
          var d = deployResult.data
          var result = {
            success: true,
            message: 'Token "' + d.name + '" (' + d.symbol + ') deployed on Devnet with metadata!',
            mint_address: d.mint,
            ata_address: d.ata,
            metadata_address: d.metadataAddress || null,
            supply: d.initialSupply,
            decimals: d.decimals,
            mint_authority_revoked: d.revokeMintAuthority,
            freeze_authority_revoked: d.revokeFreezeAuthority,
            metadata_immutable: d.makeMetadataImmutable,
            signatures: d.signatures,
            explorer_links: d.explorerLinks,
            network: 'devnet'
          }
          if (d.pool) {
            result.message += ' Raydium CPMM pool created — token is now tradeable!'
            result.pool = d.pool
          }
          if (d.poolError) {
            result.pool_error = d.poolError
            result.message += ' Warning: pool creation failed — ' + d.poolError
          }
          pending.resolve(result)
        } else {
          pending.resolve({ error: deployResult.error || 'Token deployment failed' })
        }
      } else {
        pending.resolve({ error: 'Unknown confirmation action' })
      }
    } catch (e) {
      pending.resolve({ error: e.message })
    }
  },

  // Confirmation needed callback (set by agentPanel)
  onConfirmationNeeded: null,

  // --- Token Deployment tools ---

  deployToken: function (args) {
    var name = (args.name || '').trim()
    var symbol = (args.symbol || '').trim()
    var initialSupply = args.initial_supply || '0'
    var decimals = typeof args.decimals === 'number' ? args.decimals : 9
    var liquiditySol = typeof args.liquidity_sol === 'number' ? args.liquidity_sol : 0
    var lpPercent = typeof args.lp_percent === 'number' ? args.lp_percent : 20
    var hasLiquidity = liquiditySol > 0
    var maxSolSpend = typeof args.max_sol_spend === 'number' ? args.max_sol_spend : (hasLiquidity ? liquiditySol + 1.5 : 0.5)

    // Security options (all default to true = revoked/immutable)
    var revokeMintAuthority = args.revoke_mint_authority !== false
    var revokeFreezeAuthority = args.revoke_freeze_authority !== false
    var makeMetadataImmutable = args.make_metadata_immutable !== false

    if (!name || name.length > 32) {
      return { error: 'Token name is required and must be 32 characters or fewer' }
    }
    if (!symbol || symbol.length > 10) {
      return { error: 'Token symbol is required and must be 10 characters or fewer' }
    }
    if (!initialSupply || initialSupply === '0') {
      return { error: 'Initial supply is required and must be greater than 0' }
    }
    if (hasLiquidity && (lpPercent < 1 || lpPercent > 100)) {
      return { error: 'lp_percent must be between 1 and 100' }
    }

    var description = args.description || ''
    var socials = {}
    if (args.website) socials.website = args.website
    if (args.twitter) socials.twitter = args.twitter
    if (args.telegram) socials.telegram = args.telegram

    // Logo: determine the best source for the token image
    var logoUrl = args.logo_url || ''

    // If agent passed a bare filename (not a URL), it's the attached image name — ignore it
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('data:') && !logoUrl.startsWith('file://')) {
      console.log('[deploy_token] args.logo_url is bare filename, ignoring: ' + logoUrl)
      logoUrl = ''
    }

    // Try attached image from chat if no valid URL yet
    if (!logoUrl && agentTools.lastAttachedImage) {
      if (agentTools.lastAttachedImage.dataUrl) {
        logoUrl = agentTools.lastAttachedImage.dataUrl
        console.log('[deploy_token] Using dataUrl from attached image (' + logoUrl.length + ' chars)')
      } else if (agentTools.lastAttachedImage.path) {
        logoUrl = 'file://' + agentTools.lastAttachedImage.path
        console.log('[deploy_token] Using file path: ' + logoUrl)
      }
    }

    // Scan conversation history for image URLs or attached image paths
    if (!logoUrl) {
      try {
        var history = agentCore.conversationHistory || []
        for (var hi = history.length - 1; hi >= 0; hi--) {
          var msg = history[hi]
          if (msg.role === 'user' && msg.content) {
            var attachMatch = msg.content.match(/\[ATTACHED IMAGE: .+ at path: (.+?) \(type:/)
            if (attachMatch) {
              logoUrl = 'file://' + attachMatch[1]
              console.log('[deploy_token] Found attached image in history: ' + logoUrl)
              break
            }
            var urlMatch = msg.content.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|gif|webp|svg))/i)
            if (urlMatch) {
              logoUrl = urlMatch[1]
              console.log('[deploy_token] Found image URL in history: ' + logoUrl)
              break
            }
          }
        }
      } catch (histErr) {
        console.log('[deploy_token] Could not scan history: ' + histErr.message)
      }
    }
    console.log('[deploy_token] Final logoUrl:', logoUrl ? (logoUrl.length > 80 ? logoUrl.substring(0, 80) + '...' : logoUrl) : '(none)')

    // Show confirmation dialog before deploying
    return new Promise(function (resolve) {
      var summary =
        'Deploy Token on Devnet' + (hasLiquidity ? ' + Raydium Pool' : '') + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━\n' +
        'Name: ' + name + '\n' +
        'Symbol: ' + symbol + '\n' +
        'Supply: ' + initialSupply + '\n' +
        'Decimals: ' + decimals + '\n'

      if (description) {
        summary += 'Description: ' + description + '\n'
      }
      if (logoUrl) {
        summary += 'Logo: ' + (logoUrl.startsWith('data:') ? 'Attached image' : logoUrl) + '\n'
      }

      summary +=
        '━━━ Security Options ━━━\n' +
        'Revoke Mint Authority: ' + (revokeMintAuthority ? 'YES (no one can mint more)' : 'NO (kept)') + '\n' +
        'Revoke Freeze Authority: ' + (revokeFreezeAuthority ? 'YES (no one can freeze)' : 'NO (kept)') + '\n' +
        'Metadata Immutable: ' + (makeMetadataImmutable ? 'YES (cannot change name/symbol/image)' : 'NO (mutable)') + '\n'

      if (socials.website || socials.twitter || socials.telegram) {
        summary += '━━━ Social Links ━━━\n'
        if (socials.website) summary += 'Website: ' + socials.website + '\n'
        if (socials.twitter) summary += 'Twitter: ' + socials.twitter + '\n'
        if (socials.telegram) summary += 'Telegram: ' + socials.telegram + '\n'
      }

      if (hasLiquidity) {
        summary +=
          '━━━ Liquidity Pool ━━━\n' +
          'Pool type: Raydium CPMM\n' +
          'LP allocation: ' + lpPercent + '% of supply\n' +
          'SOL liquidity: ' + liquiditySol + ' SOL\n' +
          'Token becomes: IMMEDIATELY TRADEABLE\n'
      }

      summary +=
        '━━━━━━━━━━━━━━━━━━━━━━━\n' +
        'Network: Devnet\n' +
        'Max SOL spend: ' + maxSolSpend + ' SOL\n' +
        'Estimated cost: ~' + (hasLiquidity ? (liquiditySol + 0.5).toFixed(2) : '0.003') + ' SOL'

      agentTools.pendingConfirmation = {
        action: 'deploy_token',
        params: {
          name: name,
          symbol: symbol,
          description: description,
          decimals: decimals,
          initialSupply: initialSupply,
          revokeMintAuthority: revokeMintAuthority,
          revokeFreezeAuthority: revokeFreezeAuthority,
          makeMetadataImmutable: makeMetadataImmutable,
          maxSolSpend: maxSolSpend,
          liquiditySol: liquiditySol,
          lpPercent: lpPercent,
          socials: socials,
          logoUrl: logoUrl
        },
        resolve: resolve
      }

      if (agentTools.onConfirmationNeeded) {
        agentTools.onConfirmationNeeded({
          action: 'deploy_token',
          message: summary
        })
      }
    })
  },

  airdropDevnetSol: async function (amount) {
    try {
      var result = await ipc.invoke('wallet:requestAirdrop', { amount: amount || 1 })
      if (result.success) {
        return {
          success: true,
          message: 'Airdropped ' + result.data.amount + ' devnet SOL to ' + result.data.address,
          signature: result.data.signature,
          amount: result.data.amount,
          explorer: 'https://explorer.solana.com/tx/' + result.data.signature + '?cluster=devnet'
        }
      }
      return { error: result.error || 'Airdrop failed' }
    } catch (e) {
      return { error: e.message || 'Airdrop request failed' }
    }
  },

  // --- Mixer tools ---

  mixerGetCurrencies: async function () {
    try {
      var result = await mixerAPI.getAvailableCurrencies()
      if (result.success && result.data) {
        var currencies = result.data.slice(0, 30).map(function (c) {
          return { ticker: c.ticker, name: c.name, network: c.network }
        })
        return { success: true, currencies: currencies, total: result.data.length }
      }
      return { error: result.error || 'Failed to get currencies' }
    } catch (e) {
      return { error: e.message }
    }
  },

  mixerEstimate: async function (fromCurrency, toCurrency, fromNetwork, toNetwork, amount) {
    if (!fromCurrency || !toCurrency || !amount) {
      return { error: 'fromCurrency, toCurrency, and amount are required' }
    }
    fromNetwork = fromNetwork || mixerAPI.getNetworkForCurrency(fromCurrency)
    toNetwork = toNetwork || mixerAPI.getNetworkForCurrency(toCurrency)

    try {
      // Get min amount first
      var minResult = await mixerAPI.getMinimumExchangeAmount(fromCurrency, toCurrency, fromNetwork, toNetwork)
      var minAmount = minResult.success && minResult.data ? minResult.data.minAmount : null

      if (minAmount && amount < minAmount) {
        return { error: 'Amount is below minimum. Minimum: ' + minAmount + ' ' + fromCurrency.toUpperCase() }
      }

      // Get estimate
      var result = await mixerAPI.getEstimatedExchange(fromCurrency, toCurrency, fromNetwork, toNetwork, amount)
      if (result.success && result.data) {
        return {
          success: true,
          from: amount + ' ' + fromCurrency.toUpperCase(),
          estimated_output: (result.data.toAmount || result.data.estimatedAmount) + ' ' + toCurrency.toUpperCase(),
          minimum_amount: minAmount ? minAmount + ' ' + fromCurrency.toUpperCase() : 'unknown'
        }
      }
      return { error: result.error || 'Failed to get estimate' }
    } catch (e) {
      return { error: e.message }
    }
  },

  mixerCreateExchange: function (fromCurrency, toCurrency, fromNetwork, toNetwork, amount, recipientAddress) {
    if (!fromCurrency || !toCurrency || !amount || !recipientAddress) {
      return { error: 'All parameters are required: fromCurrency, toCurrency, amount, recipientAddress' }
    }
    fromNetwork = fromNetwork || mixerAPI.getNetworkForCurrency(fromCurrency)
    toNetwork = toNetwork || mixerAPI.getNetworkForCurrency(toCurrency)

    return new Promise(function (resolve) {
      agentTools.pendingConfirmation = {
        action: 'mixer_create_exchange',
        params: {
          fromCurrency: fromCurrency,
          toCurrency: toCurrency,
          fromNetwork: fromNetwork,
          toNetwork: toNetwork,
          fromAmount: amount,
          address: recipientAddress
        },
        resolve: resolve
      }

      if (agentTools.onConfirmationNeeded) {
        agentTools.onConfirmationNeeded({
          action: 'mixer_create_exchange',
          message: 'Exchange ' + amount + ' ' + fromCurrency.toUpperCase() + ' to ' + toCurrency.toUpperCase() + '\nRecipient: ' + recipientAddress.substring(0, 8) + '...' + recipientAddress.substring(recipientAddress.length - 4)
        })
      }
    })
  },

  mixerGetStatus: async function (transactionId) {
    if (!transactionId) return { error: 'Transaction ID is required' }
    try {
      var result = await mixerAPI.getTransactionStatus(transactionId)
      if (result.success && result.data) {
        return {
          success: true,
          status: result.data.status,
          status_text: mixerAPI.getStatusText(result.data.status),
          output_amount: result.data.toAmount
        }
      }
      return { error: result.error || 'Failed to get status' }
    } catch (e) {
      return { error: e.message }
    }
  },

  // --- Bridge tools ---

  bridgeGetCurrencies: async function () {
    try {
      var result = await ipc.invoke('bridge:getCurrencies')
      if (result.success && result.data) {
        var data = result.data.data || result.data
        var currencies = []
        if (Array.isArray(data)) {
          currencies = data.slice(0, 30).map(function (c) {
            return { ticker: c.ticker || c.currency, name: c.name, network: c.network }
          })
        }
        return { success: true, currencies: currencies }
      }
      return { error: result.error || 'Failed to get currencies' }
    } catch (e) {
      return { error: e.message }
    }
  },

  bridgeSimulate: async function (fromNetwork, fromCurrency, toNetwork, toCurrency, amount, privacy) {
    if (!fromNetwork || !fromCurrency || !toNetwork || !toCurrency || !amount || !privacy) {
      return { error: 'All parameters are required' }
    }
    try {
      var result = await ipc.invoke('bridge:simulate', {
        fromNetwork: fromNetwork,
        fromCurrency: fromCurrency,
        toNetwork: toNetwork,
        toCurrency: toCurrency,
        amount: amount,
        privacy: privacy
      })
      if (result.success && result.data) {
        var d = result.data
        return {
          success: true,
          from: amount + ' ' + fromCurrency.toUpperCase(),
          estimated_output: (d.toAmount || d.estimatedAmount || d.receiveAmount) + ' ' + toCurrency.toUpperCase(),
          fee: d.fee || d.serviceFee || d.totalFee || 'included',
          estimated_time: d.estimatedTime || d.eta || d.duration || 'varies',
          min_amount: d.minInput || d.minAmount || d.min,
          max_amount: d.maxInput || d.maxAmount || d.max,
          warning: d.warningMessage || d.warning || d.message || null
        }
      }
      return { error: result.error || 'Failed to simulate bridge' }
    } catch (e) {
      return { error: e.message }
    }
  },

  bridgeCreateOrder: function (fromNetwork, fromCurrency, toNetwork, toCurrency, amount, privacy, recipientAddress) {
    if (!fromNetwork || !fromCurrency || !toNetwork || !toCurrency || !amount || !privacy || !recipientAddress) {
      return { error: 'All parameters are required' }
    }

    return new Promise(function (resolve) {
      agentTools.pendingConfirmation = {
        action: 'bridge_create_order',
        params: {
          fromNetwork: fromNetwork,
          fromCurrency: fromCurrency,
          toNetwork: toNetwork,
          toCurrency: toCurrency,
          amount: amount,
          privacy: privacy,
          recipientAddress: recipientAddress
        },
        resolve: resolve
      }

      if (agentTools.onConfirmationNeeded) {
        agentTools.onConfirmationNeeded({
          action: 'bridge_create_order',
          message: 'Bridge ' + amount + ' ' + fromCurrency.toUpperCase() + ' (' + fromNetwork + ') to ' + toCurrency.toUpperCase() + ' (' + toNetwork + ')\nPrivacy: ' + privacy + '\nRecipient: ' + recipientAddress.substring(0, 8) + '...' + recipientAddress.substring(recipientAddress.length - 4)
        })
      }
    })
  },

  bridgeGetStatus: async function (orderId) {
    if (!orderId) return { error: 'Order ID is required' }
    try {
      var result = await ipc.invoke('bridge:getStatus', orderId)
      if (result.success && result.data) {
        var d = result.data
        return {
          success: true,
          status: d.status || d.state || 'unknown',
          step: d.step || d.currentStep
        }
      }
      return { error: result.error || 'Failed to get bridge status' }
    } catch (e) {
      return { error: e.message }
    }
  },

  bookmarkPage: function () {
    var tabId = tabs.getSelected()
    var tab = tabs.get(tabId)

    if (!tab || !tab.url) {
      return { error: 'No page to bookmark' }
    }

    places.sendMessage({
      action: 'updatePlace',
      pageData: {
        url: urlParser.getSourceURL(tab.url),
        title: tab.title
      },
      flags: {
        isBookmarked: true
      }
    })

    return { success: true, bookmarked: tab.title || tab.url }
  },

  toggleAdblock: async function () {
    try {
      var result = await ipc.invoke('adblock:toggleGlobal')
      if (result.success) {
        return { success: true, enabled: result.data.enabled, message: 'Ad blocker ' + (result.data.enabled ? 'enabled' : 'disabled') }
      }
      return { error: result.error || 'Failed to toggle ad blocker' }
    } catch (e) {
      return { error: e.message }
    }
  },

  getCurrentPageInfo: function () {
    var tabId = tabs.getSelected()
    var tab = tabs.get(tabId)

    if (!tab) {
      return { error: 'No active tab' }
    }

    return {
      success: true,
      url: tab.url || '(new tab)',
      title: tab.title || '(no title)',
      secure: tab.secure || false
    }
  },

  summarizePage: async function () {
    var content = await agentTools.extractPageContent()

    if (content.error) {
      return content
    }

    var text = content.text || ''
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...(truncated)'
    }

    return {
      success: true,
      title: content.title || '',
      description: content.description || '',
      text: text,
      instruction: 'Please provide a concise summary of this page content in bullet points.'
    }
  },

  getPageInputFields: function () {
    return new Promise(function (resolve) {
      var tabId = tabs.getSelected()
      webviews.callAsync(tabId, 'executeJavaScript', `
        (function() {
          var fields = [];
          var inputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
          for (var i = 0; i < inputs.length; i++) {
            var el = inputs[i];
            if (el.type === 'hidden') continue;
            var rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            var label = '';
            if (el.id) {
              var labelEl = document.querySelector('label[for="' + el.id + '"]');
              if (labelEl) label = labelEl.textContent.trim();
            }
            if (!label && el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
            if (!label && el.placeholder) label = el.placeholder;
            if (!label && el.name) label = el.name;
            if (!label) {
              var parent = el.parentElement;
              if (parent) {
                var prevLabel = parent.querySelector('label');
                if (prevLabel) label = prevLabel.textContent.trim();
              }
            }
            // Get nearby text context (parent and siblings text)
            var nearby = '';
            if (!label || label.length < 3) {
              var p = el.parentElement;
              for (var up = 0; up < 3 && p; up++) {
                var pText = (p.textContent || '').trim().substring(0, 150);
                if (pText && pText.length > label.length) { nearby = pText; break; }
                p = p.parentElement;
              }
            }

            var selector = '';
            if (el.id) selector = '#' + CSS.escape(el.id);
            else if (el.name) selector = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
            else {
              var tag = el.tagName.toLowerCase();
              var type = el.type || '';
              var idx = Array.from(document.querySelectorAll(tag + (type ? '[type="' + type + '"]' : ''))).indexOf(el);
              selector = tag + (type ? '[type="' + type + '"]' : '') + ':nth-of-type(' + (idx + 1) + ')';
            }

            fields.push({
              selector: selector,
              tag: el.tagName.toLowerCase(),
              type: el.type || el.tagName.toLowerCase(),
              name: el.name || '',
              label: label.substring(0, 100),
              nearby_text: nearby.substring(0, 150),
              value: (el.value || '').substring(0, 200),
              placeholder: (el.placeholder || '').substring(0, 100),
              required: el.required || false,
              visible: rect.width > 0 && rect.height > 0
            });
          }

          // Also find file inputs specifically
          var fileInputs = document.querySelectorAll('input[type="file"]');
          for (var f = 0; f < fileInputs.length; f++) {
            var fi = fileInputs[f];
            var fiSelector = '';
            if (fi.id) fiSelector = '#' + CSS.escape(fi.id);
            else fiSelector = 'input[type="file"]:nth-of-type(' + (f + 1) + ')';

            var exists = false;
            for (var e = 0; e < fields.length; e++) {
              if (fields[e].selector === fiSelector) { exists = true; break; }
            }
            if (!exists) {
              fields.push({
                selector: fiSelector,
                tag: 'input',
                type: 'file',
                name: fi.name || '',
                label: fi.getAttribute('accept') || 'file upload',
                value: '',
                placeholder: '',
                required: fi.required || false,
                visible: true
              });
            }
          }

          // Find clickable buttons
          var buttons = [];
          var btnEls = document.querySelectorAll('button, [role="button"], input[type="submit"], a.btn, a.button');
          for (var b = 0; b < btnEls.length; b++) {
            var btn = btnEls[b];
            var bRect = btn.getBoundingClientRect();
            if (bRect.width === 0 && bRect.height === 0) continue;
            var btnText = (btn.textContent || btn.value || '').trim().substring(0, 100);
            if (!btnText) continue;

            var btnSelector = '';
            if (btn.id) btnSelector = '#' + CSS.escape(btn.id);
            else {
              var bIdx = Array.from(document.querySelectorAll(btn.tagName.toLowerCase())).indexOf(btn);
              btnSelector = btn.tagName.toLowerCase() + ':nth-of-type(' + (bIdx + 1) + ')';
            }

            buttons.push({
              selector: btnSelector,
              text: btnText,
              type: btn.type || btn.tagName.toLowerCase()
            });
          }

          return JSON.stringify({ fields: fields, buttons: buttons.slice(0, 20), total_fields: fields.length, total_buttons: buttons.length });
        })()
      `, function (err, result) {
        if (err) {
          resolve({ error: 'Failed to scan page fields: ' + (err.message || err) })
        } else {
          try {
            resolve(JSON.parse(result))
          } catch (e) {
            resolve({ error: 'Failed to parse field data' })
          }
        }
      })
    })
  },

  setInputValue: function (selector, value) {
    if (!selector || value === undefined) return { error: 'Selector and value are required' }

    return new Promise(function (resolve) {
      var tabId = tabs.getSelected()
      webviews.callAsync(tabId, 'executeJavaScript', `
        (function() {
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) {
            return JSON.stringify({ error: 'Element not found: ' + ${JSON.stringify(selector)} });
          }

          // Focus the element
          el.focus();
          el.click();

          // Use native setter to bypass React/Vue controlled components
          var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          var nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');

          if (el.tagName === 'TEXTAREA' && nativeTextareaValueSetter && nativeTextareaValueSetter.set) {
            nativeTextareaValueSetter.set.call(el, ${JSON.stringify(value)});
          } else if (nativeInputValueSetter && nativeInputValueSetter.set) {
            nativeInputValueSetter.set.call(el, ${JSON.stringify(value)});
          } else {
            el.value = ${JSON.stringify(value)};
          }

          // Dispatch all events React/Vue/Angular listen for
          el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          // Also try React synthetic event trigger
          var tracker = el._valueTracker;
          if (tracker) {
            tracker.setValue('');
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));

          return JSON.stringify({ success: true, selector: ${JSON.stringify(selector)}, value_set: ${JSON.stringify(value)}.substring(0, 50) });
        })()
      `, function (err, result) {
        if (err) {
          resolve({ error: 'Failed to set value: ' + (err.message || err) })
        } else {
          try {
            resolve(JSON.parse(result))
          } catch (e) {
            resolve({ success: true })
          }
        }
      })
    })
  },

  selectFile: function (selector, fileUrl) {
    // Default to finding any file input if no selector given
    if (!selector) selector = 'input[type="file"]'

    // Check if user has attached an image in the chat
    var attachedImage = agentTools.lastAttachedImage
    if (attachedImage && attachedImage.path) {
      // Use the user's attached image — set it via IPC to bypass security restrictions
      return new Promise(async function (resolve) {
        try {
          var result = await ipc.invoke('agent:setFileOnInput', {
            tabId: tabs.getSelected(),
            selector: selector,
            filePath: attachedImage.path
          })
          if (result && result.success) {
            agentTools.lastAttachedImage = null // Clear after use
            resolve({ success: true, message: 'Attached image "' + attachedImage.name + '" set on file input', file: attachedImage.name })
          } else {
            // Fallback: open file picker so user can select manually
            var tabId = tabs.getSelected()
            webviews.callAsync(tabId, 'executeJavaScript', `
              (function() {
                var el = document.querySelector(${JSON.stringify(selector)});
                if (!el) return JSON.stringify({ error: 'File input not found' });
                el.click();
                return JSON.stringify({ success: true, message: 'File picker opened — select the attached image: ${attachedImage.name.replace(/'/g, '')}' });
              })()
            `, function (err, res) {
              agentTools.lastAttachedImage = null
              resolve(err ? { error: 'Failed' } : (function () { try { return JSON.parse(res) } catch (e) { return { success: true } } })())
            })
          }
        } catch (e) {
          resolve({ error: e.message || 'Failed to set file' })
        }
      })
    }

    if (fileUrl) {
      // Download file via IPC and set on input
      return new Promise(async function (resolve) {
        try {
          var downloadResult = await ipc.invoke('agent:downloadFile', { url: fileUrl })
          if (downloadResult.error) {
            resolve({ error: downloadResult.error })
            return
          }

          // Try to set file via IPC
          var setResult = await ipc.invoke('agent:setFileOnInput', {
            tabId: tabs.getSelected(),
            selector: selector,
            filePath: downloadResult.filePath
          })
          if (setResult && setResult.success) {
            resolve({ success: true, message: 'Downloaded and set file from URL', file: downloadResult.filePath })
          } else {
            // Fallback: open picker
            var tabId = tabs.getSelected()
            webviews.callAsync(tabId, 'executeJavaScript', `
              (function() {
                var el = document.querySelector(${JSON.stringify(selector)});
                if (!el) return JSON.stringify({ error: 'File input not found' });
                el.click();
                return JSON.stringify({ success: true, message: 'File picker opened. Downloaded file at: ${downloadResult.filePath.replace(/\\/g, '\\\\')}' });
              })()
            `, function (err, res) {
              resolve(err ? { error: 'Failed' } : (function () { try { return JSON.parse(res) } catch (e) { return { success: true } } })())
            })
          }
        } catch (e) {
          resolve({ error: e.message || 'Failed to download/set file' })
        }
      })
    } else {
      // Just click the file input to open picker
      return new Promise(function (resolve) {
        var tabId = tabs.getSelected()
        webviews.callAsync(tabId, 'executeJavaScript', `
          (function() {
            var el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return JSON.stringify({ error: 'File input not found: ' + ${JSON.stringify(selector)} });
            el.click();
            return JSON.stringify({ success: true, message: 'File picker dialog opened. User can select a file.' });
          })()
        `, function (err, result) {
          if (err) {
            resolve({ error: 'Failed to open file picker' })
          } else {
            try {
              resolve(JSON.parse(result))
            } catch (e) {
              resolve({ success: true, message: 'File picker opened' })
            }
          }
        })
      })
    }
  },

  checkWebsiteSafety: async function (url) {
    if (!url) {
      var pageInfo = agentTools.getCurrentPageInfo()
      if (pageInfo.error) return pageInfo
      url = pageInfo.url
      if (!url || url === '(new tab)') return { error: 'No page is currently loaded' }
    }
    try {
      var result = await ipc.invoke('agent:checkWebsiteSafety', { url: url })
      return result
    } catch (e) {
      return { error: e.message || 'Safety check failed' }
    }
  },

  getUserRegion: async function () {
    try {
      var result = await ipc.invoke('agent:getUserRegion')
      if (result && result.success) return result
    } catch (e) {
      // fall through to default
    }
    return {
      success: true,
      country: 'United States',
      country_code: 'US',
      currency: 'USD',
      region: 'US',
      stores: ['Amazon', 'Walmart', 'Best Buy'],
      fallback_urls: ['https://www.amazon.com/s?k=[product]', 'https://www.walmart.com/search?q=[product]', 'https://www.bestbuy.com/site/searchpage.jsp?st=[product]']
    }
  },

  burnWallet: async function () {
    var solBalance = 0
    try {
      var balanceResult = await ipc.invoke('wallet:getBalance')
      if (balanceResult && balanceResult.success && balanceResult.data) {
        solBalance = balanceResult.data.sol || 0
      }
    } catch (e) { /* ignore */ }

    var tokenCount = 0
    var tokenList = []
    try {
      var tokenResult = await ipc.invoke('wallet:getTokens')
      if (tokenResult && tokenResult.success && tokenResult.data) {
        tokenList = tokenResult.data
        tokenCount = tokenList.length
      }
    } catch (e) { /* ignore */ }

    var hasAssets = solBalance > 0 || tokenCount > 0

    var message = 'BURN WALLET\n'
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'

    if (hasAssets) {
      message += 'WARNING: YOUR WALLET HAS FUNDS!\n\n'
      message += 'SOL Balance: ' + solBalance.toFixed(6) + ' SOL\n'
      if (tokenCount > 0) {
        message += 'Token Accounts: ' + tokenCount + '\n'
        for (var i = 0; i < Math.min(tokenList.length, 5); i++) {
          message += '  - ' + tokenList[i].balance + ' ' + tokenList[i].symbol + '\n'
        }
        if (tokenList.length > 5) {
          message += '  ... and ' + (tokenList.length - 5) + ' more\n'
        }
      }
      message += '\nBurning will PERMANENTLY DESTROY access\n'
      message += 'to these funds. They CANNOT be recovered.\n'
    } else {
      message += 'Wallet is empty (no SOL or tokens).\n'
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    message += 'A new wallet will be generated after burn.'

    return new Promise(function (resolve) {
      agentTools.pendingConfirmation = {
        action: 'burn_wallet',
        resolve: resolve
      }

      if (agentTools.onConfirmationNeeded) {
        agentTools.onConfirmationNeeded({
          action: 'burn_wallet',
          message: message
        })
      }
    })
  },

  getSolPrice: async function () {
    try {
      var result = await ipc.invoke('agent:scrapeUrl', { url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true' })
      if (result.error) {
        return { error: result.error }
      }
      try {
        var data = JSON.parse(result.text || result.title || '{}')
        if (data.solana) {
          return {
            success: true,
            price_usd: data.solana.usd,
            change_24h: data.solana.usd_24h_change ? data.solana.usd_24h_change.toFixed(2) + '%' : 'unknown',
            currency: 'SOL'
          }
        }
      } catch (e) {
        // Try parsing the raw text
      }
      return { success: true, raw: result.text, note: 'Parse the SOL price from this data' }
    } catch (e) {
      return { error: e.message || 'Failed to get SOL price' }
    }
  }
}

module.exports = agentTools
