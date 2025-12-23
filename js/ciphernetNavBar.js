const webviews = require('webviews.js')
const browserUI = require('browserUI.js')
const tabState = require('tabState.js')
const mixerPanel = require('mixerPanel.js')

const ciphernetNavBar = {
  bar: null,
  searchInput: null,
  mixerButton: null,
  vpnButton: null,
  barHeight: 52,

  initialize: function () {
    console.log('CipherNet NavBar: Initializing...')

    // Get DOM elements
    ciphernetNavBar.bar = document.getElementById('ciphernet-nav-bar')
    ciphernetNavBar.searchInput = document.getElementById('ciphernet-search-input')
    ciphernetNavBar.mixerButton = document.getElementById('mixer-button')
    ciphernetNavBar.vpnButton = document.getElementById('vpn-button')
    var logoContainer = document.getElementById('ciphernet-logo-container')

    // Check if elements exist
    if (!ciphernetNavBar.bar || !ciphernetNavBar.searchInput) {
      console.error('CipherNet NavBar: Required elements not found!')
      return
    }

    // Logo click handler - navigate to welcome page
    if (logoContainer) {
      logoContainer.addEventListener('click', function () {
        if (!tabs) return
        var tabId = tabs.getSelected()
        tabs.update(tabId, { url: 'ciphernet://app/pages/welcome/index.html' })
        webviews.update(tabId, 'ciphernet://app/pages/welcome/index.html')
      })
    }

    // console.log('CipherNet NavBar: Elements found, setting up event listeners...')

    // Initialize search input functionality
    ciphernetNavBar.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault()
        console.log('CipherNet NavBar: Enter key pressed, handling search...')
        ciphernetNavBar.handleSearch()
      } else if (e.key === 'Escape') {
        ciphernetNavBar.searchInput.blur()
      }
    })

    // Mixer button click handler
    if (ciphernetNavBar.mixerButton) {
      ciphernetNavBar.mixerButton.addEventListener('click', function () {
        console.log('CipherNet NavBar: Mixer button clicked')
        ciphernetNavBar.handleMixerClick()
      })
    }

    // VPN button click handler
    if (ciphernetNavBar.vpnButton) {
      ciphernetNavBar.vpnButton.addEventListener('click', function () {
        console.log('CipherNet NavBar: VPN button clicked')
        ciphernetNavBar.handleVPNClick()
      })
    }

    // Adjust webview margin to account for the nav bar
    webviews.adjustMargin([ciphernetNavBar.barHeight, 0, 0, 0])

    // Update search input with current tab URL when tab changes
    tasks.on('tab-selected', function (tabId) {
      if (!tabs) return
      var currentTab = tabs.get(tabId)
      if (currentTab && currentTab.url && !currentTab.url.startsWith('ciphernet://')) {
        ciphernetNavBar.searchInput.value = currentTab.url
      } else {
        ciphernetNavBar.searchInput.value = ''
      }
    })

    // Update search input when tab URL changes
    tasks.on('tab-updated', function (tabId, key) {
      if (!tabs || key !== 'url') return
      if (tabs.getSelected() === tabId) {
        var currentTab = tabs.get(tabId)
        if (currentTab && currentTab.url && !currentTab.url.startsWith('ciphernet://')) {
          ciphernetNavBar.searchInput.value = currentTab.url
        } else {
          ciphernetNavBar.searchInput.value = ''
        }
      }
    })

    // Focus search input when clicking on it
    ciphernetNavBar.searchInput.addEventListener('focus', function () {
      ciphernetNavBar.searchInput.select()
    })

    console.log('CipherNet NavBar: Initialization complete!')
  },

  handleSearch: function () {
    console.log('CipherNet NavBar: handleSearch called')
    var searchText = ciphernetNavBar.searchInput.value.trim()
    console.log('CipherNet NavBar: Search text:', searchText)

    if (!searchText) {
      console.log('CipherNet NavBar: Empty search text, returning')
      return
    }

    // Check if tabs is available
    if (!tabs) {
      console.error('CipherNet NavBar: tabs is not available yet!')
      return
    }

    var currentTab = tabs.get(tabs.getSelected())
    console.log('CipherNet NavBar: Current tab:', currentTab)

    // Determine if it's a URL or search query
    var isURL = searchText.includes('.') || searchText.startsWith('http://') ||
                searchText.startsWith('https://') || searchText.startsWith('localhost')

    var urlToNavigate

    if (isURL) {
      // Add protocol if missing
      if (!searchText.startsWith('http://') && !searchText.startsWith('https://')) {
        urlToNavigate = 'https://' + searchText
      } else {
        urlToNavigate = searchText
      }
    } else {
      // Use default search engine (Google)
      urlToNavigate = 'https://www.google.com/search?q=' + encodeURIComponent(searchText)
    }

    console.log('CipherNet NavBar: Navigating to:', urlToNavigate)

    // Navigate current tab to the URL
    if (currentTab) {
      var tabId = tabs.getSelected()
      tabs.update(tabId, { url: urlToNavigate })
      webviews.update(tabId, urlToNavigate)
      webviews.focus()
      console.log('CipherNet NavBar: Tab updated and webview navigated')
    } else {
      console.error('CipherNet NavBar: No current tab found!')
    }

    // Blur the search input
    ciphernetNavBar.searchInput.blur()
  },

  handleMixerClick: function () {
    console.log('Mixer button clicked - Opening mixer panel')
    if (mixerPanel && mixerPanel.toggle) {
      mixerPanel.toggle()
    } else {
      console.error('Mixer panel not available')
    }
  },

  handleVPNClick: function () {
    console.log('VPN button clicked - Feature to be implemented')
    // TODO: Implement VPN functionality
    // This could include:
    // - Connect to VPN service
    // - Show VPN status
    // - Select VPN server location
    // - etc.

    // For now, show a notification
    alert('VPN Feature\n\nThis feature will allow you to connect to a VPN service for enhanced privacy.\n\nComing soon!')
  },

  updateSearchInput: function (url) {
    // Update search input with current URL
    if (url && !url.startsWith('ciphernet://')) {
      ciphernetNavBar.searchInput.value = url
    } else {
      ciphernetNavBar.searchInput.value = ''
    }
  },

  focusSearchInput: function () {
    ciphernetNavBar.searchInput.focus()
    ciphernetNavBar.searchInput.select()
  }
}

// Handle window resize
window.addEventListener('resize', function () {
  var oldHeight = ciphernetNavBar.barHeight
  ciphernetNavBar.barHeight = ciphernetNavBar.bar.getBoundingClientRect().height
  webviews.adjustMargin([ciphernetNavBar.barHeight - oldHeight, 0, 0, 0])
})

module.exports = ciphernetNavBar
