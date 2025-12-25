// Wallet Panel UI Controller
const webviews = require('./webviews.js')
const ipc = require('electron').ipcRenderer

const walletPanel = {
  panel: null,
  isOpen: false,
  panelWidth: 400,
  publicKey: null,
  balance: { sol: 0, lamports: 0 },
  network: 'mainnet-beta',
  isExportWarningVisible: false,
  isPrivateKeyVisible: false,

  // Pending approval requests
  pendingConnectRequest: null,
  pendingTransactionRequest: null,
  pendingMessageRequest: null,

  // DOM Elements
  elements: {},

  initialize: function () {
    console.log('[WalletPanel] Initializing... (renderer process)')

    // Get DOM elements
    this.panel = document.getElementById('wallet-panel')
    if (!this.panel) {
      console.error('[WalletPanel] Panel element not found!')
      return
    }

    this.elements = {
      closeBtn: document.getElementById('wallet-panel-close'),
      addressDisplay: document.getElementById('wallet-address-display'),
      copyAddressBtn: document.getElementById('wallet-copy-address'),
      qrCodeContainer: document.getElementById('wallet-qr-code'),
      balanceAmount: document.getElementById('wallet-balance-amount'),
      balanceUsd: document.getElementById('wallet-balance-usd'),
      networkSelect: document.getElementById('wallet-network-select'),
      exportBtn: document.getElementById('wallet-export-btn'),
      refreshBtn: document.getElementById('wallet-refresh-btn'),

      // Export warning
      exportWarning: document.getElementById('wallet-export-warning'),
      exportConfirmBtn: document.getElementById('wallet-export-confirm'),
      exportCancelBtn: document.getElementById('wallet-export-cancel'),

      // Private key display
      privateKeyDisplay: document.getElementById('wallet-private-key-display'),
      privateKeyBox: document.getElementById('wallet-private-key-box'),
      copyPrivateKeyBtn: document.getElementById('wallet-copy-private-key'),
      hidePrivateKeyBtn: document.getElementById('wallet-hide-private-key'),

      // Connection modal
      connectModal: document.getElementById('wallet-connect-modal'),
      connectOrigin: document.getElementById('wallet-connect-origin'),
      connectApproveBtn: document.getElementById('wallet-connect-approve'),
      connectRejectBtn: document.getElementById('wallet-connect-reject'),

      // Transaction modal
      txModal: document.getElementById('wallet-tx-confirmation'),
      txOrigin: document.getElementById('wallet-tx-origin'),
      txWarnings: document.getElementById('wallet-tx-warnings'),
      txDetails: document.getElementById('wallet-tx-details'),
      txApproveBtn: document.getElementById('wallet-tx-approve'),
      txRejectBtn: document.getElementById('wallet-tx-reject'),

      // Message modal
      msgModal: document.getElementById('wallet-msg-modal'),
      msgOrigin: document.getElementById('wallet-msg-origin'),
      msgContent: document.getElementById('wallet-msg-content'),
      msgApproveBtn: document.getElementById('wallet-msg-approve'),
      msgRejectBtn: document.getElementById('wallet-msg-reject')
    }

    // Set up event listeners
    this.setupEventListeners()

    // Initialize wallet data
    this.initializeWallet()

    // Listen for wallet IPC events
    this.setupIPCListeners()

    console.log('[WalletPanel] Initialization complete')
  },

  setupEventListeners: function () {
    // Close button
    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.close()
      })
    }

    // Copy address
    if (this.elements.copyAddressBtn) {
      this.elements.copyAddressBtn.addEventListener('click', () => this.copyAddress())
    }

    // Network select
    if (this.elements.networkSelect) {
      this.elements.networkSelect.addEventListener('change', (e) => this.switchNetwork(e.target.value))
    }

    // Export button
    if (this.elements.exportBtn) {
      this.elements.exportBtn.addEventListener('click', () => this.showExportWarning())
    }

    // Refresh button
    if (this.elements.refreshBtn) {
      this.elements.refreshBtn.addEventListener('click', () => this.refreshBalance())
    }

    // Export warning buttons
    if (this.elements.exportConfirmBtn) {
      this.elements.exportConfirmBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.confirmExport()
      })
    }
    if (this.elements.exportCancelBtn) {
      this.elements.exportCancelBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.hideExportWarning()
      })
    }

    // Private key buttons
    if (this.elements.copyPrivateKeyBtn) {
      this.elements.copyPrivateKeyBtn.addEventListener('click', () => this.copyPrivateKey())
    }
    if (this.elements.hidePrivateKeyBtn) {
      this.elements.hidePrivateKeyBtn.addEventListener('click', () => this.hidePrivateKey())
    }

    // Connection modal buttons
    if (this.elements.connectApproveBtn) {
      this.elements.connectApproveBtn.addEventListener('click', () => this.approveConnect())
    }
    if (this.elements.connectRejectBtn) {
      this.elements.connectRejectBtn.addEventListener('click', () => this.rejectConnect())
    }

    // Transaction modal buttons
    if (this.elements.txApproveBtn) {
      this.elements.txApproveBtn.addEventListener('click', () => this.approveTransaction())
    }
    if (this.elements.txRejectBtn) {
      this.elements.txRejectBtn.addEventListener('click', () => this.rejectTransaction())
    }

    // Message modal buttons
    if (this.elements.msgApproveBtn) {
      this.elements.msgApproveBtn.addEventListener('click', () => this.approveMessage())
    }
    if (this.elements.msgRejectBtn) {
      this.elements.msgRejectBtn.addEventListener('click', () => this.rejectMessage())
    }
  },

  setupIPCListeners: function () {
    console.log('[WalletPanel] Setting up IPC listeners')

    // Connection approval request
    ipc.on('wallet:showConnectApproval', (event, data) => {
      console.log('[WalletPanel] Received wallet:showConnectApproval', data)
      // Flash the wallet button to indicate activity
      const walletBtn = document.getElementById('wallet-button')
      if (walletBtn) {
        walletBtn.style.backgroundColor = '#ff0000'
        setTimeout(() => {
          walletBtn.style.backgroundColor = ''
        }, 1000)
      }
      this.showConnectModal(data)
    })

    // Transaction approval request
    ipc.on('wallet:showTransactionApproval', (event, data) => {
      this.showTransactionModal(data)
    })

    // Multiple transactions approval request
    ipc.on('wallet:showMultiTransactionApproval', (event, data) => {
      this.showMultiTransactionModal(data)
    })

    // Message approval request
    ipc.on('wallet:showMessageApproval', (event, data) => {
      this.showMessageModal(data)
    })
  },

  async initializeWallet() {
    try {
      // Get public key
      const result = await ipc.invoke('wallet:getPublicKey')
      if (result.success && result.data.publicKey) {
        this.publicKey = result.data.publicKey
        this.updateAddressDisplay()
        this.generateQRCode()
      }

      // Get network
      const networkResult = await ipc.invoke('wallet:getNetwork')
      if (networkResult.success) {
        this.network = networkResult.data.network
        if (this.elements.networkSelect) {
          this.elements.networkSelect.value = this.network
        }
      }

      // Get balance
      await this.refreshBalance()
    } catch (error) {
      console.error('[WalletPanel] Error initializing wallet:', error)
    }
  },

  updateAddressDisplay: function () {
    if (this.elements.addressDisplay && this.publicKey) {
      this.elements.addressDisplay.textContent = this.publicKey
    }
  },

  generateQRCode: function () {
    if (!this.elements.qrCodeContainer || !this.publicKey) return

    // Clear existing QR code
    this.elements.qrCodeContainer.innerHTML = ''

    // Generate QR code using simple canvas approach
    const canvas = document.createElement('canvas')
    canvas.width = 150
    canvas.height = 150

    // Use a simple QR code library or placeholder
    // For now, create a simple visual representation
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 150, 150)

    // Draw a placeholder pattern (actual QR would need a library)
    ctx.fillStyle = '#000000'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('QR Code', 75, 75)
    ctx.fillText(this.publicKey.substring(0, 8) + '...', 75, 90)

    this.elements.qrCodeContainer.appendChild(canvas)
  },

  async refreshBalance() {
    try {
      if (this.elements.balanceAmount) {
        this.elements.balanceAmount.textContent = '...'
      }

      const result = await ipc.invoke('wallet:getBalance')
      if (result.success) {
        this.balance = result.data
        this.updateBalanceDisplay()
      }
    } catch (error) {
      console.error('[WalletPanel] Error refreshing balance:', error)
      if (this.elements.balanceAmount) {
        this.elements.balanceAmount.textContent = '0.00'
      }
    }
  },

  updateBalanceDisplay: function () {
    if (this.elements.balanceAmount) {
      this.elements.balanceAmount.textContent = this.balance.sol.toFixed(4) + ' SOL'
    }
    if (this.elements.balanceUsd) {
      // Simple USD estimate (would need price feed for accuracy)
      const usdValue = this.balance.sol * 100 // Placeholder rate
      this.elements.balanceUsd.textContent = '≈ $' + usdValue.toFixed(2)
    }
  },

  async switchNetwork(network) {
    try {
      const result = await ipc.invoke('wallet:switchNetwork', network)
      if (result.success) {
        this.network = result.data.network
        await this.refreshBalance()
      }
    } catch (error) {
      console.error('[WalletPanel] Error switching network:', error)
    }
  },

  copyAddress: async function () {
    if (!this.publicKey) return

    try {
      await navigator.clipboard.writeText(this.publicKey)
      if (this.elements.copyAddressBtn) {
        this.elements.copyAddressBtn.classList.add('copied')
        this.elements.copyAddressBtn.textContent = 'Copied!'
        setTimeout(() => {
          this.elements.copyAddressBtn.classList.remove('copied')
          this.elements.copyAddressBtn.innerHTML = '<span class="i carbon:copy"></span> Copy'
        }, 2000)
      }
    } catch (error) {
      console.error('[WalletPanel] Error copying address:', error)
    }
  },

  showExportWarning: function () {
    if (this.elements.exportWarning) {
      this.elements.exportWarning.classList.add('active')
      this.isExportWarningVisible = true
    }
  },

  hideExportWarning: function () {
    if (this.elements.exportWarning) {
      this.elements.exportWarning.classList.remove('active')
      this.isExportWarningVisible = false
    }
  },

  async confirmExport() {
    console.log('[WalletPanel] confirmExport called')
    this.hideExportWarning()

    try {
      const result = await ipc.invoke('wallet:exportPrivateKey')
      console.log('[WalletPanel] Export result:', result)
      if (result.success) {
        // Show private key
        if (this.elements.privateKeyBox) {
          // Display as Base58 format
          this.elements.privateKeyBox.textContent = result.data.secretKeyBase58
          console.log('[WalletPanel] Private key set in box (Base58)')
        }
        if (this.elements.privateKeyDisplay) {
          this.elements.privateKeyDisplay.classList.add('active')
          this.isPrivateKeyVisible = true
          console.log('[WalletPanel] Private key display shown')
        } else {
          console.error('[WalletPanel] privateKeyDisplay element not found')
        }
      } else {
        console.error('[WalletPanel] Export failed:', result.error)
      }
    } catch (error) {
      console.error('[WalletPanel] Error exporting private key:', error)
    }
  },

  hidePrivateKey: function () {
    if (this.elements.privateKeyDisplay) {
      this.elements.privateKeyDisplay.classList.remove('active')
      this.isPrivateKeyVisible = false
    }
    if (this.elements.privateKeyBox) {
      this.elements.privateKeyBox.textContent = ''
    }
  },

  async copyPrivateKey() {
    const keyText = this.elements.privateKeyBox?.textContent
    if (!keyText) return

    try {
      await navigator.clipboard.writeText(keyText)
      if (this.elements.copyPrivateKeyBtn) {
        this.elements.copyPrivateKeyBtn.textContent = 'Copied!'
        setTimeout(() => {
          this.elements.copyPrivateKeyBtn.textContent = 'Copy Key'
        }, 2000)
      }
    } catch (error) {
      console.error('[WalletPanel] Error copying private key:', error)
    }
  },

  // Connection approval
  showConnectModal: function (data) {
    console.log('[WalletPanel] showConnectModal called with:', data)
    this.pendingConnectRequest = data

    console.log('[WalletPanel] connectOrigin element:', this.elements.connectOrigin)
    console.log('[WalletPanel] connectModal element:', this.elements.connectModal)

    if (this.elements.connectOrigin) {
      this.elements.connectOrigin.textContent = data.origin
    }
    if (this.elements.connectModal) {
      this.elements.connectModal.classList.add('active')
      console.log('[WalletPanel] Connect modal activated')
    } else {
      console.error('[WalletPanel] Connect modal element not found!')
    }
  },

  async approveConnect() {
    if (!this.pendingConnectRequest) return

    try {
      await ipc.invoke('wallet:approveConnect', {
        requestId: this.pendingConnectRequest.requestId
      })
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error approving connect:', error)
    }

    this.hideConnectModal()
  },

  async rejectConnect() {
    if (!this.pendingConnectRequest) return

    try {
      await ipc.invoke('wallet:rejectConnect', {
        requestId: this.pendingConnectRequest.requestId
      })
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error rejecting connect:', error)
    }

    this.hideConnectModal()
  },

  hideConnectModal: function () {
    if (this.elements.connectModal) {
      this.elements.connectModal.classList.remove('active')
    }
    this.pendingConnectRequest = null
  },

  // Transaction approval
  showTransactionModal: function (data) {
    this.pendingTransactionRequest = data

    if (this.elements.txOrigin) {
      this.elements.txOrigin.textContent = data.origin
    }

    // Display warnings
    if (this.elements.txWarnings && data.decoded.warnings) {
      this.elements.txWarnings.innerHTML = ''
      data.decoded.warnings.forEach(warning => {
        const div = document.createElement('div')
        div.className = 'wallet-tx-warning-item'
        div.textContent = warning.message
        this.elements.txWarnings.appendChild(div)
      })
    }

    // Display transaction details
    if (this.elements.txDetails && data.decoded) {
      let detailsHtml = ''

      data.decoded.instructions.forEach((inst, idx) => {
        detailsHtml += `<div style="margin-bottom: 12px;">
          <strong>Instruction ${idx + 1}:</strong> ${inst.programName}<br>
          Program: ${inst.programId.substring(0, 20)}...<br>`

        if (inst.type === 'Transfer') {
          detailsHtml += `Type: ${inst.type}<br>
          Amount: ${inst.amountSOL} SOL<br>
          From: ${inst.from?.substring(0, 20)}...<br>
          To: ${inst.to?.substring(0, 20)}...<br>`
        }

        detailsHtml += `</div>`
      })

      this.elements.txDetails.innerHTML = detailsHtml
    }

    if (this.elements.txModal) {
      this.elements.txModal.classList.add('active')
    }
  },

  showMultiTransactionModal: function (data) {
    // For multiple transactions, show count and combined warnings
    this.pendingTransactionRequest = { ...data, isMulti: true }

    if (this.elements.txOrigin) {
      this.elements.txOrigin.textContent = `${data.origin} (${data.count} transactions)`
    }

    // Combine all warnings
    if (this.elements.txWarnings) {
      this.elements.txWarnings.innerHTML = ''
      const allWarnings = []
      data.decoded.forEach((tx, idx) => {
        tx.warnings?.forEach(w => {
          allWarnings.push({ ...w, tx: idx + 1 })
        })
      })

      allWarnings.forEach(warning => {
        const div = document.createElement('div')
        div.className = 'wallet-tx-warning-item'
        div.textContent = `TX ${warning.tx}: ${warning.message}`
        this.elements.txWarnings.appendChild(div)
      })
    }

    if (this.elements.txDetails) {
      this.elements.txDetails.innerHTML = `<strong>${data.count} transactions</strong> require your signature.`
    }

    if (this.elements.txModal) {
      this.elements.txModal.classList.add('active')
    }
  },

  async approveTransaction() {
    if (!this.pendingTransactionRequest) return

    try {
      if (this.pendingTransactionRequest.isMulti) {
        await ipc.invoke('wallet:approveSignAllTransactions', {
          requestId: this.pendingTransactionRequest.requestId
        })
      } else {
        await ipc.invoke('wallet:approveSignTransaction', {
          requestId: this.pendingTransactionRequest.requestId
        })
      }
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error approving transaction:', error)
    }

    this.hideTransactionModal()
  },

  async rejectTransaction() {
    if (!this.pendingTransactionRequest) return

    try {
      if (this.pendingTransactionRequest.isMulti) {
        await ipc.invoke('wallet:rejectSignAllTransactions', {
          requestId: this.pendingTransactionRequest.requestId
        })
      } else {
        await ipc.invoke('wallet:rejectSignTransaction', {
          requestId: this.pendingTransactionRequest.requestId
        })
      }
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error rejecting transaction:', error)
    }

    this.hideTransactionModal()
  },

  hideTransactionModal: function () {
    if (this.elements.txModal) {
      this.elements.txModal.classList.remove('active')
    }
    this.pendingTransactionRequest = null
  },

  // Message signing approval
  showMessageModal: function (data) {
    this.pendingMessageRequest = data

    if (this.elements.msgOrigin) {
      this.elements.msgOrigin.textContent = data.origin
    }

    if (this.elements.msgContent) {
      this.elements.msgContent.textContent = data.messageText
    }

    if (this.elements.msgModal) {
      this.elements.msgModal.classList.add('active')
    }
  },

  async approveMessage() {
    if (!this.pendingMessageRequest) return

    try {
      await ipc.invoke('wallet:approveSignMessage', {
        requestId: this.pendingMessageRequest.requestId
      })
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error approving message:', error)
    }

    this.hideMessageModal()
  },

  async rejectMessage() {
    if (!this.pendingMessageRequest) return

    try {
      await ipc.invoke('wallet:rejectSignMessage', {
        requestId: this.pendingMessageRequest.requestId
      })
      // Response is sent directly to webview by main process
    } catch (error) {
      console.error('[WalletPanel] Error rejecting message:', error)
    }

    this.hideMessageModal()
  },

  hideMessageModal: function () {
    if (this.elements.msgModal) {
      this.elements.msgModal.classList.remove('active')
    }
    this.pendingMessageRequest = null
  },

  // Panel open/close
  open: function () {
    if (!this.panel) return

    this.panel.classList.add('active')
    this.isOpen = true
    webviews.adjustMargin([0, this.panelWidth, 0, 0])

    // Refresh balance when opening
    this.refreshBalance()
  },

  close: function () {
    if (!this.panel) return

    this.panel.classList.remove('active')
    this.isOpen = false
    webviews.adjustMargin([0, -this.panelWidth, 0, 0])

    // Hide any open modals/displays
    this.hideExportWarning()
    this.hidePrivateKey()
  },

  toggle: function () {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }
}

module.exports = walletPanel
