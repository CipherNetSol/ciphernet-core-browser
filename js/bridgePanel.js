// js\bridgePanel.js
// Bridge Panel - NullTrace Bridge Integration
// Cross-chain bridging with privacy modes

const webviews = require('webviews.js')

// Get IPC from electron
let ipc
try {
  ipc = require('electron').ipcRenderer
} catch (e) {
  console.warn('[BridgePanel] IPC not available')
}

// Privacy mode mapping
const privacyModeMap = {
  'standard': 'fast',
  'private': 'semi',
  'xmr': 'full'
}

// Status text mapping
const statusTextMap = {
  'waiting': 'Waiting for deposit',
  'confirming': 'Confirming deposit',
  'exchanging': 'Processing exchange',
  'sending': 'Sending funds',
  'completed': 'Completed',
  'failed': 'Failed',
  'refunded': 'Refunded',
  'expired': 'Expired'
}

const finalStatuses = ['completed', 'failed', 'refunded', 'expired']

const bridgePanel = {
  panel: null,
  isOpen: false,
  panelWidth: 450,

  // State
  currencies: [],
  selectedPrivacy: 'standard', // 'standard', 'private', 'xmr'
  fromNetwork: '',
  fromCurrency: '',
  toNetwork: '',
  toCurrency: '',
  amount: '',
  recipientAddress: '',
  simulation: null,
  currentOrder: null,
  statusPollingInterval: null,

  // DOM Elements
  elements: {},

  /**
   * Initialize the bridge panel
   */
  initialize: function () {
    // console.log('[BridgePanel] Initializing...')

    this.panel = document.getElementById('bridge-panel')
    if (!this.panel) {
      console.error('[BridgePanel] Panel element not found')
      return
    }

    // Cache DOM elements
    this.elements = {
      closeBtn: document.getElementById('bridge-panel-close'),
      errorMessage: document.getElementById('bridge-error-message'),

      // Form view
      formView: document.getElementById('bridge-form-view'),
      privacyModes: document.querySelectorAll('.bridge-privacy-mode'),

      // From section
      fromNetworkSelect: document.getElementById('bridge-from-network'),
      fromCurrencySelect: document.getElementById('bridge-from-currency'),
      fromAmountInput: document.getElementById('bridge-from-amount'),

      // To section
      toNetworkSelect: document.getElementById('bridge-to-network'),
      toCurrencySelect: document.getElementById('bridge-to-currency'),

      // Swap button
      swapBtn: document.getElementById('bridge-swap-direction-btn'),

      // Recipient
      recipientInput: document.getElementById('bridge-recipient-address'),

      // Simulation
      simulationSection: document.getElementById('bridge-simulation-section'),
      estimatedOutput: document.getElementById('bridge-estimated-output'),
      bridgeFee: document.getElementById('bridge-fee'),
      estimatedTime: document.getElementById('bridge-estimated-time'),
      minInput: document.getElementById('bridge-min-input'),
      maxInput: document.getElementById('bridge-max-input'),
      warningMessage: document.getElementById('bridge-warning-message'),

      // Create button
      createBtn: document.getElementById('bridge-create-btn'),

      // Order view
      orderView: document.getElementById('bridge-order-view'),
      orderId: document.getElementById('bridge-order-id'),
      copyOrderIdBtn: document.getElementById('bridge-copy-order-id'),
      depositAddress: document.getElementById('bridge-deposit-address'),
      copyDepositBtn: document.getElementById('bridge-copy-deposit'),
      depositAmount: document.getElementById('bridge-deposit-amount'),
      statusBadge: document.getElementById('bridge-status-badge'),
      progressSteps: document.querySelectorAll('.bridge-progress-step'),
      orderFromAmount: document.getElementById('bridge-order-from-amount'),
      orderToAmount: document.getElementById('bridge-order-to-amount'),
      newOrderBtn: document.getElementById('bridge-new-order-btn')
    }

    this.setupEventListeners()
    this.loadCurrencies()
    this.loadSavedOrder()
    // this.prefillRecipientAddress()

    // console.log('[BridgePanel] Initialized')
  },

  /**
   * Set up event listeners
   */
  setupEventListeners: function () {
    // Close button
    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', () => this.close())
    }

    // Privacy mode selection
    this.elements.privacyModes.forEach(mode => {
      mode.addEventListener('click', () => {
        const privacy = mode.dataset.privacy
        this.selectPrivacyMode(privacy)
      })
    })

    // Network/Currency selects
    if (this.elements.fromNetworkSelect) {
      this.elements.fromNetworkSelect.addEventListener('change', (e) => {
        this.fromNetwork = e.target.value
        this.updateCurrencyOptions('from')
        this.runSimulation()
      })
    }

    if (this.elements.fromCurrencySelect) {
      this.elements.fromCurrencySelect.addEventListener('change', (e) => {
        this.fromCurrency = e.target.value
        this.runSimulation()
      })
    }

    if (this.elements.toNetworkSelect) {
      this.elements.toNetworkSelect.addEventListener('change', (e) => {
        this.toNetwork = e.target.value
        this.updateCurrencyOptions('to')
        this.runSimulation()
      })
    }

    if (this.elements.toCurrencySelect) {
      this.elements.toCurrencySelect.addEventListener('change', (e) => {
        this.toCurrency = e.target.value
        this.runSimulation()
      })
    }

    // Amount input with debounce
    if (this.elements.fromAmountInput) {
      let debounceTimer
      this.elements.fromAmountInput.addEventListener('input', (e) => {
        this.amount = e.target.value
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => this.runSimulation(), 500)
      })
    }

    // Swap direction button
    if (this.elements.swapBtn) {
      this.elements.swapBtn.addEventListener('click', () => this.swapDirection())
    }

    // Recipient address
    if (this.elements.recipientInput) {
      this.elements.recipientInput.addEventListener('input', (e) => {
        this.recipientAddress = e.target.value
        this.validateForm()
      })
    }

    // Create bridge button
    if (this.elements.createBtn) {
      this.elements.createBtn.addEventListener('click', () => this.createBridgeOrder())
    }

    // Copy deposit address
    if (this.elements.copyDepositBtn) {
      this.elements.copyDepositBtn.addEventListener('click', () => this.copyDepositAddress())
    }

    // Copy order ID
    if (this.elements.copyOrderIdBtn) {
      this.elements.copyOrderIdBtn.addEventListener('click', () => this.copyOrderId())
    }

    // New order button
    if (this.elements.newOrderBtn) {
      this.elements.newOrderBtn.addEventListener('click', () => this.startNewOrder())
    }
  },

  /**
   * Load supported currencies from API via IPC
   */
  async loadCurrencies() {
    if (!ipc) {
      this.showError('IPC not available')
      return
    }
    try {
      const result = await ipc.invoke('bridge:getCurrencies')
      if (result.success && result.data) {
        this.currencies = Array.isArray(result.data?.data)
          ? result.data.data
          : []
        this.populateNetworkSelects()
        this.hideError()
      } else {
        this.showError('Failed to load currencies: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[BridgePanel] Error loading currencies:', error)
      this.showError('Failed to load currencies')
    }
  },

  /**
   * Populate network dropdown selects
   */
  populateNetworkSelects() {
    // Get unique networks from currencies
    const networks = [...new Set(this.currencies.map(c => c.network))].sort()

    const createOptions = (select, selectedValue) => {
      if (!select) return
      select.innerHTML = '<option value="">Select Network</option>'
      networks.forEach(network => {
        const option = document.createElement('option')
        option.value = network
        option.textContent = network.toUpperCase()
        if (network === selectedValue) option.selected = true
        select.appendChild(option)
      })
    }

    createOptions(this.elements.fromNetworkSelect, this.fromNetwork)
    createOptions(this.elements.toNetworkSelect, this.toNetwork)

    // Set default networks if not set
    if (!this.fromNetwork && networks.length > 0) {
      // Try to default to SOL or ETH
      this.fromNetwork = networks.includes('sol') ? 'sol' : networks[0]
      if (this.elements.fromNetworkSelect) {
        this.elements.fromNetworkSelect.value = this.fromNetwork
      }
      this.updateCurrencyOptions('from')
    }

    if (!this.toNetwork && networks.length > 0) {
      // Try to default to different network
      this.toNetwork = networks.includes('eth') ? 'eth' : networks.filter(n => n !== this.fromNetwork)[0] || networks[0]
      if (this.elements.toNetworkSelect) {
        this.elements.toNetworkSelect.value = this.toNetwork
      }
      this.updateCurrencyOptions('to')
    }
  },

  /**
   * Update currency options based on selected network
   */
  updateCurrencyOptions(direction) {
    const network = direction === 'from' ? this.fromNetwork : this.toNetwork
    const select = direction === 'from' ? this.elements.fromCurrencySelect : this.elements.toCurrencySelect

    if (!select || !network) return

    // Filter currencies for this network
    const networkCurrencies = this.currencies.filter(c => c.network === network)

    select.innerHTML = '<option value="">Select Currency</option>'
    networkCurrencies.forEach(currency => {
      const option = document.createElement('option')
      option.value = currency.ticker || currency.symbol
      option.textContent = (currency.ticker || currency.symbol).toUpperCase()
      select.appendChild(option)
    })

    // Auto-select first currency if available
    if (networkCurrencies.length > 0) {
      const firstCurrency = networkCurrencies[0].ticker || networkCurrencies[0].symbol
      select.value = firstCurrency
      if (direction === 'from') {
        this.fromCurrency = firstCurrency
      } else {
        this.toCurrency = firstCurrency
      }
    }
  },

  /**
   * Select privacy mode
   */
  selectPrivacyMode(mode) {
    this.selectedPrivacy = mode

    // Update UI
    this.elements.privacyModes.forEach(el => {
      if (el.dataset.privacy === mode) {
        el.classList.add('active')
      } else {
        el.classList.remove('active')
      }
    })

    this.runSimulation()
  },

  /**
   * Swap from/to direction
   */
  swapDirection() {
    // Swap networks
    const tempNetwork = this.fromNetwork
    this.fromNetwork = this.toNetwork
    this.toNetwork = tempNetwork

    // Swap currencies
    const tempCurrency = this.fromCurrency
    this.fromCurrency = this.toCurrency
    this.toCurrency = tempCurrency

    // Update selects
    if (this.elements.fromNetworkSelect) {
      this.elements.fromNetworkSelect.value = this.fromNetwork
    }
    if (this.elements.toNetworkSelect) {
      this.elements.toNetworkSelect.value = this.toNetwork
    }

    this.updateCurrencyOptions('from')
    this.updateCurrencyOptions('to')

    // Set the swapped currencies
    if (this.elements.fromCurrencySelect) {
      this.elements.fromCurrencySelect.value = this.fromCurrency
    }
    if (this.elements.toCurrencySelect) {
      this.elements.toCurrencySelect.value = this.toCurrency
    }

    this.runSimulation()
  },

  /**
   * Run simulation via IPC
   */
  async runSimulation() {
    if (!ipc) return

    // Validate inputs
    if (!this.fromNetwork || !this.fromCurrency || !this.toNetwork || !this.toCurrency || !this.amount) {
      this.hideSimulation()
      return
    }

    const amountNum = parseFloat(this.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      this.hideSimulation()
      return
    }

    try {
      const result = await ipc.invoke('bridge:simulate', {
        fromNetwork: this.fromNetwork,
        fromCurrency: this.fromCurrency,
        toNetwork: this.toNetwork,
        toCurrency: this.toCurrency,
        amount: amountNum,
        privacy: privacyModeMap[this.selectedPrivacy] || 'fast'
      })

      // console.log('[BridgePanel] Simulation result:', result)

      if (result.success && result.data) {
        // Handle nested data structure from API
        const simData = result.data.data || result.data
        this.simulation = simData
        // console.log('[BridgePanel] Simulation data:', simData)
        this.showSimulation()
      } else {
        this.showError(result.error || 'Simulation failed')
        this.hideSimulation()
      }
    } catch (error) {
      console.error('[BridgePanel] Simulation error:', error)
      this.hideSimulation()
    }
  },

  /**
   * Show simulation results
   */
  showSimulation() {
    if (!this.simulation) return

    if (this.elements.simulationSection) {
      this.elements.simulationSection.style.display = 'block'
    }

    // API might use different field names: toAmount, estimatedAmount, receiveAmount, etc.
    const outputAmount = this.simulation.toAmount || this.simulation.estimatedAmount ||
                         this.simulation.receiveAmount || this.simulation.amount || '0'
    if (this.elements.estimatedOutput) {
      this.elements.estimatedOutput.textContent = `${outputAmount} ${this.toCurrency.toUpperCase()}`
    }

    // Fee might be: fee, serviceFee, networkFee, etc.
    const fee = this.simulation.fee || this.simulation.serviceFee || this.simulation.totalFee
    if (this.elements.bridgeFee) {
      this.elements.bridgeFee.textContent = fee ? `${fee}%` : 'N/A'
    }

    // Time might be: estimatedTime, eta, duration, etc.
    const time = this.simulation.estimatedTime || this.simulation.eta || this.simulation.duration
    if (this.elements.estimatedTime) {
      this.elements.estimatedTime.textContent = time || '10-60 min'
    }

    // Min/Max might be: minInput, minAmount, min, etc.
    const minVal = this.simulation.minInput || this.simulation.minAmount || this.simulation.min
    const maxVal = this.simulation.maxInput || this.simulation.maxAmount || this.simulation.max

    if (this.elements.minInput) {
      this.elements.minInput.textContent = minVal ?
        `${minVal} ${this.fromCurrency.toUpperCase()}` : 'N/A'
    }

    if (this.elements.maxInput) {
      this.elements.maxInput.textContent = maxVal ?
        `${maxVal} ${this.fromCurrency.toUpperCase()}` : 'N/A'
    }

    // Show warning if present
    const warning = this.simulation.warningMessage || this.simulation.warning || this.simulation.message
    if (warning && this.elements.warningMessage) {
      this.elements.warningMessage.textContent = warning
      this.elements.warningMessage.classList.remove('hidden')
    } else if (this.elements.warningMessage) {
      this.elements.warningMessage.classList.add('hidden')
    }

    this.validateForm()
  },

  /**
   * Hide simulation section
   */
  hideSimulation() {
    if (this.elements.simulationSection) {
      this.elements.simulationSection.style.display = 'none'
    }
    this.simulation = null
    this.validateForm()
  },

  /**
   * Validate form and enable/disable create button
   */
  validateForm() {
    const amountNum = parseFloat(this.amount) || 0

    // Check if amount is below minimum
    let isBelowMinimum = false
    if (this.simulation) {
      const minVal = parseFloat(this.simulation.minInput || this.simulation.minAmount || this.simulation.min || 0)
      if (minVal > 0 && amountNum < minVal) {
        isBelowMinimum = true
      }
    }

    const isValid = this.fromNetwork &&
      this.fromCurrency &&
      this.toNetwork &&
      this.toCurrency &&
      this.amount &&
      amountNum > 0 &&
      this.recipientAddress &&
      this.simulation &&
      !isBelowMinimum

    if (this.elements.createBtn) {
      this.elements.createBtn.disabled = !isValid

      // Update button text to show why disabled
      if (isBelowMinimum) {
        this.elements.createBtn.innerHTML = '<i class="i carbon:warning"></i> Amount below minimum'
      } else {
        this.elements.createBtn.innerHTML = '<i class="i carbon:arrow-right"></i> Create Bridge'
      }
    }
  },

  /**
   * Pre-fill recipient address with CipherNet wallet
   */
  // async prefillRecipientAddress() {
  //   if (!ipc) return

  //   try {
  //     const result = await ipc.invoke('wallet:getPublicKey')
  //     if (result.success && result.data && result.data.publicKey) {
  //       this.recipientAddress = result.data.publicKey
  //       if (this.elements.recipientInput) {
  //         this.elements.recipientInput.value = this.recipientAddress
  //       }
  //     }
  //   } catch (error) {
  //     console.error('[BridgePanel] Error getting wallet address:', error)
  //   }
  // },

  /**
   * Create bridge order via IPC
   */
  async createBridgeOrder() {
    if (!ipc || !this.simulation) {
      this.showError('Please wait for simulation to complete')
      return
    }

    // Disable button and show loading
    if (this.elements.createBtn) {
      this.elements.createBtn.disabled = true
      this.elements.createBtn.innerHTML = '<div class="bridge-loading-spinner"></div> Creating...'
    }

    try {
      const result = await ipc.invoke('bridge:createBridge', {
        fromNetwork: this.fromNetwork,
        fromCurrency: this.fromCurrency,
        toNetwork: this.toNetwork,
        toCurrency: this.toCurrency,
        amount: parseFloat(this.amount),
        privacy: privacyModeMap[this.selectedPrivacy] || 'fast',
        recipientAddress: this.recipientAddress
      })

      // console.log('[BridgePanel] Create bridge result:', result)

      if (result.success && result.data) {
        // Handle nested data structure from API
        const orderData = result.data.data || result.data

        // Get the estimated output amount from simulation
        const outputAmount = this.simulation.toAmount || this.simulation.estimatedAmount ||
                            this.simulation.receiveAmount || this.simulation.amount || this.amount

        this.currentOrder = {
          id: orderData.id || orderData.orderId || orderData.order_id,
          depositAddress: orderData.depositAddress || orderData.deposit_address || orderData.address,
          status: orderData.status || 'waiting',
          step: orderData.step || 1,
          fromAmount: this.amount,
          fromCurrency: this.fromCurrency,
          toAmount: outputAmount,
          toCurrency: this.toCurrency,
          createdAt: Date.now()
        }

        // console.log('[BridgePanel] Created order:', this.currentOrder)

        // Save order to localStorage
        this.saveOrder()

        // Show order view
        this.showOrderView()

        // Start status polling
        this.startStatusPolling()

        this.hideError()
      } else {
        this.showError(result.error || 'Failed to create bridge order')
      }
    } catch (error) {
      console.error('[BridgePanel] Error creating order:', error)
      this.showError('Failed to create bridge order')
    } finally {
      // Reset button
      if (this.elements.createBtn) {
        this.elements.createBtn.disabled = false
        this.elements.createBtn.innerHTML = '<i class="i carbon:arrow-right"></i> Create Bridge'
      }
    }
  },

  /**
   * Show order view
   */
  showOrderView() {
    if (this.elements.formView) {
      this.elements.formView.classList.add('hidden')
    }
    if (this.elements.orderView) {
      this.elements.orderView.classList.add('active')
    }

    this.updateOrderDisplay()
  },

  /**
   * Update order display
   */
  updateOrderDisplay() {
    if (!this.currentOrder) return

    if (this.elements.orderId) {
      this.elements.orderId.innerHTML = `Order: <span>${this.currentOrder.id}</span>`
    }

    if (this.elements.depositAddress) {
      this.elements.depositAddress.textContent = this.currentOrder.depositAddress
    }

    if (this.elements.depositAmount) {
      this.elements.depositAmount.innerHTML = `Send <strong>${this.currentOrder.fromAmount} ${this.currentOrder.fromCurrency.toUpperCase()}</strong> to this address`
    }

    if (this.elements.statusBadge) {
      this.elements.statusBadge.textContent = statusTextMap[this.currentOrder.status] || this.currentOrder.status
      this.elements.statusBadge.className = `bridge-status-badge ${this.currentOrder.status}`
    }

    if (this.elements.orderFromAmount) {
      this.elements.orderFromAmount.textContent = `${this.currentOrder.fromAmount} ${this.currentOrder.fromCurrency.toUpperCase()}`
    }

    if (this.elements.orderToAmount) {
      this.elements.orderToAmount.textContent = `${this.currentOrder.toAmount} ${this.currentOrder.toCurrency.toUpperCase()}`
    }

    // Update progress steps
    this.updateProgressSteps()
  },

  /**
   * Update progress steps display
   */
  updateProgressSteps() {
    const statusToStep = {
      'waiting': 1,
      'confirming': 2,
      'exchanging': 3,
      'sending': 4,
      'completed': 5
    }

    const currentStep = statusToStep[this.currentOrder?.status] || 1

    this.elements.progressSteps.forEach((step, index) => {
      step.classList.remove('active', 'completed')
      if (index + 1 < currentStep) {
        step.classList.add('completed')
      } else if (index + 1 === currentStep) {
        step.classList.add('active')
      }
    })
  },

  /**
   * Start status polling
   */
  startStatusPolling() {
    // Clear any existing interval
    this.stopStatusPolling()

    // Poll every 10 seconds
    this.statusPollingInterval = setInterval(() => this.pollStatus(), 10000)

    // Also poll immediately
    this.pollStatus()
  },

  /**
   * Stop status polling
   */
  stopStatusPolling() {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval)
      this.statusPollingInterval = null
    }
  },

  /**
   * Poll order status via IPC
   */
  async pollStatus() {
    if (!ipc || !this.currentOrder || !this.currentOrder.id) return

    try {
      const result = await ipc.invoke('bridge:getStatus', this.currentOrder.id)
      // console.log('[BridgePanel] Status poll result:', result)

      if (result.success && result.data) {
        // Handle nested data structure from API
        const statusData = result.data.data || result.data
        // console.log('[BridgePanel] Status data:', statusData)

        // Get the actual status field
        const newStatus = statusData.status || statusData.state || this.currentOrder.status
        this.currentOrder.status = newStatus
        this.currentOrder.step = statusData.step || statusData.currentStep || this.currentOrder.step

        // Update display
        this.updateOrderDisplay()

        // Save updated order
        this.saveOrder()

        // Stop polling and handle completion if final status
        if (finalStatuses.includes(newStatus)) {
          this.stopStatusPolling()

          // If completed, show success and auto-return to form after delay
          if (newStatus === 'completed') {
            setTimeout(() => {
              this.startNewOrder()
            }, 5000) // Return to form after 5 seconds
          }
        }
      }
    } catch (error) {
      console.error('[BridgePanel] Error polling status:', error)
    }
  },

  /**
   * Copy deposit address to clipboard
   */
  async copyDepositAddress() {
    if (!this.currentOrder || !this.currentOrder.depositAddress) return

    try {
      await navigator.clipboard.writeText(this.currentOrder.depositAddress)

      // Show feedback
      if (this.elements.copyDepositBtn) {
        const originalText = this.elements.copyDepositBtn.innerHTML
        this.elements.copyDepositBtn.innerHTML = '<i class="i carbon:checkmark"></i> Copied!'
        setTimeout(() => {
          this.elements.copyDepositBtn.innerHTML = originalText
        }, 2000)
      }
    } catch (error) {
      console.error('[BridgePanel] Error copying address:', error)
    }
  },

  /**
   * Copy order ID to clipboard
   */
  async copyOrderId() {
    if (!this.currentOrder || !this.currentOrder.id) return

    try {
      await navigator.clipboard.writeText(this.currentOrder.id)

      // Show feedback on the order ID element
      if (this.elements.orderId) {
        const originalHtml = this.elements.orderId.innerHTML
        this.elements.orderId.innerHTML = `Order: <span style="color: #00ff00;">Copied!</span>`
        setTimeout(() => {
          this.elements.orderId.innerHTML = originalHtml
        }, 2000)
      }
    } catch (error) {
      console.error('[BridgePanel] Error copying order ID:', error)
    }
  },

  /**
   * Start a new order
   */
  startNewOrder() {
    // Stop polling
    this.stopStatusPolling()

    // Clear current order
    this.currentOrder = null
    localStorage.removeItem('bridge_order')

    // Reset form
    this.amount = ''
    if (this.elements.fromAmountInput) {
      this.elements.fromAmountInput.value = ''
    }

    this.hideSimulation()
    this.hideError()

    // Show form view
    if (this.elements.orderView) {
      this.elements.orderView.classList.remove('active')
    }
    if (this.elements.formView) {
      this.elements.formView.classList.remove('hidden')
    }
  },

  /**
   * Save order to localStorage
   */
  saveOrder() {
    if (this.currentOrder) {
      localStorage.setItem('bridge_order', JSON.stringify(this.currentOrder))
    }
  },

  /**
   * Load saved order from localStorage
   */
  loadSavedOrder() {
    try {
      const saved = localStorage.getItem('bridge_order')
      if (saved) {
        this.currentOrder = JSON.parse(saved)

        // Check if order is still active (not final status)
        if (this.currentOrder && !finalStatuses.includes(this.currentOrder.status)) {
          this.showOrderView()
          this.startStatusPolling()
        } else if (this.currentOrder && finalStatuses.includes(this.currentOrder.status)) {
          // Show completed order
          this.showOrderView()
        }
      }
    } catch (error) {
      console.error('[BridgePanel] Error loading saved order:', error)
    }
  },

  /**
   * Show error message
   */
  showError(message) {
    if (this.elements.errorMessage) {
      this.elements.errorMessage.innerHTML = `<i class="i carbon:warning"></i> ${message}`
      this.elements.errorMessage.classList.remove('hidden')
    }
  },

  /**
   * Hide error message
   */
  hideError() {
    if (this.elements.errorMessage) {
      this.elements.errorMessage.classList.add('hidden')
    }
  },

  /**
   * Open the panel
   */
  open: function () {
    if (!this.panel) return

    this.panel.classList.add('active')
    this.isOpen = true

    // Adjust webview margins
    if (typeof webviews !== 'undefined' && webviews.adjustMargin) {
      webviews.adjustMargin([0, this.panelWidth, 0, 0])
    }

    // Refresh wallet address
    // this.prefillRecipientAddress()

    // console.log('[BridgePanel] Opened')
  },

  /**
   * Close the panel
   */
  close: function () {
    if (!this.panel) return

    this.panel.classList.remove('active')
    this.isOpen = false

    // Reset webview margins
    if (typeof webviews !== 'undefined' && webviews.adjustMargin) {
      webviews.adjustMargin([0, -this.panelWidth, 0, 0])
    }

    // console.log('[BridgePanel] Closed')
  },

  /**
   * Toggle the panel
   */
  toggle: function () {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  },

  /**
   * Destroy panel and cleanup
   */
  destroy: function () {
    this.stopStatusPolling()
    this.close()
  }
}

module.exports = bridgePanel
