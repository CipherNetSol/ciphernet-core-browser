// Wallet IPC Handlers - Bridge between main process and renderer/webviews
const { ipcMain, BaseWindow } = require('electron')
const walletManager = require('./walletManager')

// Store pending approval requests
const pendingApprovals = new Map()

function setupWalletIPC() {
  console.log('[WalletIPC] Setting up IPC handlers...')

  // Initialize wallet on app start
  ipcMain.handle('wallet:initialize', async () => {
    try {
      const result = walletManager.initialize()
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get public key
  ipcMain.handle('wallet:getPublicKey', async () => {
    try {
      const publicKey = walletManager.getPublicKey()
      return { success: true, data: { publicKey } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get balance
  ipcMain.handle('wallet:getBalance', async () => {
    try {
      const balance = await walletManager.getBalance()
      return { success: true, data: balance }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Export private key (user action from wallet panel)
  ipcMain.handle('wallet:exportPrivateKey', async () => {
    try {
      const secretKey = walletManager.getSecretKey()
      const secretKeyBase58 = walletManager.getSecretKeyBase58()
      return {
        success: true,
        data: {
          secretKeyArray: secretKey,      // Phantom-compatible format
          secretKeyBase58: secretKeyBase58 // Base58 format
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get network
  ipcMain.handle('wallet:getNetwork', async () => {
    try {
      return { success: true, data: { network: walletManager.network } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Switch network
  ipcMain.handle('wallet:switchNetwork', async (event, network) => {
    try {
      const result = walletManager.switchNetwork(network)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Request connection approval from dApp
  ipcMain.handle('wallet:requestConnect', async (event, { origin, tabId }) => {
    try {
      const requestId = `connect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Store pending request WITH the sender webContents so we can respond later
      pendingApprovals.set(requestId, {
        type: 'connect',
        origin,
        tabId,
        sender: event.sender, // Store the webview that made the request
        timestamp: Date.now()
      })

      // Send to renderer to show approval UI
      // Use focused window since webview's parent can't be found via fromWebContents
      const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
      console.log('[WalletIPC] Window found:', !!win)
      if (win) {
        // BaseWindow uses contentView property, not getContentView()
        const contentView = win.contentView
        console.log('[WalletIPC] Content view:', !!contentView)
        console.log('[WalletIPC] Children count:', contentView?.children?.length)
        if (contentView && contentView.children && contentView.children[0]) {
          const mainView = contentView.children[0]
          mainView.webContents.send('wallet:showConnectApproval', {
            requestId,
            origin,
            tabId,
            publicKey: walletManager.getPublicKey()
          })
          console.log('[WalletIPC] Sent showConnectApproval to renderer')
        } else {
          console.error('[WalletIPC] Could not find main view')
        }
      } else {
        console.error('[WalletIPC] Could not find window')
      }

      return { success: true, data: { requestId } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User approves connection
  ipcMain.handle('wallet:approveConnect', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)
      if (!request) {
        return { success: false, error: 'Request not found or expired' }
      }

      const publicKey = walletManager.getPublicKey()

      // Send approval back to the webview that requested it
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:connectApproved', {
          requestId,
          publicKey
        })
      }

      pendingApprovals.delete(requestId)

      return {
        success: true,
        data: {
          publicKey
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User rejects connection
  ipcMain.handle('wallet:rejectConnect', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)

      // Send rejection back to the webview that requested it
      if (request && request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:connectRejected', {
          requestId
        })
      }

      pendingApprovals.delete(requestId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Request transaction signing approval
  ipcMain.handle('wallet:requestSignTransaction', async (event, { transaction, origin, tabId }) => {
    try {
      const requestId = `sign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Decode transaction for display
      const decoded = walletManager.decodeTransaction(transaction)

      // Store pending request WITH sender
      pendingApprovals.set(requestId, {
        type: 'signTransaction',
        transaction,
        decoded,
        origin,
        tabId,
        sender: event.sender,
        timestamp: Date.now()
      })

      // Send to renderer to show approval UI
      const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
      if (win) {
        const contentView = win.contentView
        if (contentView && contentView.children && contentView.children[0]) {
          const mainView = contentView.children[0]
          mainView.webContents.send('wallet:showTransactionApproval', {
            requestId,
            origin,
            tabId,
            decoded
          })
        }
      }

      return { success: true, data: { requestId } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User approves transaction signing
  ipcMain.handle('wallet:approveSignTransaction', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)
      if (!request) {
        return { success: false, error: 'Request not found or expired' }
      }

      const signedTransaction = await walletManager.signTransaction(request.transaction)

      // Send approval back to the webview that requested it
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:transactionApproved', {
          requestId,
          signedTransaction
        })
      }

      pendingApprovals.delete(requestId)

      return {
        success: true,
        data: {
          signedTransaction
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User rejects transaction
  ipcMain.handle('wallet:rejectSignTransaction', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)

      // Send rejection back to the webview
      if (request && request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:transactionRejected', {
          requestId
        })
      }

      pendingApprovals.delete(requestId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Request signing multiple transactions
  ipcMain.handle('wallet:requestSignAllTransactions', async (event, { transactions, origin, tabId }) => {
    try {
      const requestId = `signAll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Decode all transactions
      const decodedTransactions = transactions.map(tx => walletManager.decodeTransaction(tx))

      // Store pending request WITH sender
      pendingApprovals.set(requestId, {
        type: 'signAllTransactions',
        transactions,
        decoded: decodedTransactions,
        origin,
        tabId,
        sender: event.sender,
        timestamp: Date.now()
      })

      // Send to renderer to show approval UI
      const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
      if (win) {
        const contentView = win.contentView
        if (contentView && contentView.children && contentView.children[0]) {
          const mainView = contentView.children[0]
          mainView.webContents.send('wallet:showMultiTransactionApproval', {
            requestId,
            origin,
            tabId,
            decoded: decodedTransactions,
            count: transactions.length
          })
        }
      }

      return { success: true, data: { requestId } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User approves all transactions
  ipcMain.handle('wallet:approveSignAllTransactions', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)
      if (!request) {
        return { success: false, error: 'Request not found or expired' }
      }

      const signedTransactions = await walletManager.signAllTransactions(request.transactions)

      // Send approval back to the webview
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:allTransactionsApproved', {
          requestId,
          signedTransactions
        })
      }

      pendingApprovals.delete(requestId)

      return {
        success: true,
        data: {
          signedTransactions
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User rejects all transactions
  ipcMain.handle('wallet:rejectSignAllTransactions', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)

      // Send rejection back to the webview
      if (request && request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:allTransactionsRejected', {
          requestId
        })
      }

      pendingApprovals.delete(requestId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Request message signing
  ipcMain.handle('wallet:requestSignMessage', async (event, { message, origin, tabId }) => {
    try {
      const requestId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Try to decode message as text
      let messageText
      try {
        messageText = new TextDecoder().decode(new Uint8Array(message))
      } catch {
        messageText = '[Binary data]'
      }

      // Store pending request WITH sender
      pendingApprovals.set(requestId, {
        type: 'signMessage',
        message,
        messageText,
        origin,
        tabId,
        sender: event.sender,
        timestamp: Date.now()
      })

      // Send to renderer to show approval UI
      const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
      if (win) {
        const contentView = win.contentView
        if (contentView && contentView.children && contentView.children[0]) {
          const mainView = contentView.children[0]
          mainView.webContents.send('wallet:showMessageApproval', {
            requestId,
            origin,
            tabId,
            messageText
          })
        }
      }

      return { success: true, data: { requestId } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User approves message signing
  ipcMain.handle('wallet:approveSignMessage', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)
      if (!request) {
        return { success: false, error: 'Request not found or expired' }
      }

      const signature = await walletManager.signMessage(request.message)

      // Send approval back to the webview
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:messageApproved', {
          requestId,
          signature
        })
      }

      pendingApprovals.delete(requestId)

      return {
        success: true,
        data: {
          signature
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User rejects message signing
  ipcMain.handle('wallet:rejectSignMessage', async (event, { requestId }) => {
    try {
      const request = pendingApprovals.get(requestId)

      // Send rejection back to the webview
      if (request && request.sender && !request.sender.isDestroyed()) {
        request.sender.send('wallet:messageRejected', {
          requestId
        })
      }

      pendingApprovals.delete(requestId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Direct sign transaction (from wallet panel, already approved)
  ipcMain.handle('wallet:signTransaction', async (event, { transaction }) => {
    try {
      const signedTransaction = await walletManager.signTransaction(transaction)
      return { success: true, data: { signedTransaction } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Direct sign message (from wallet panel, already approved)
  ipcMain.handle('wallet:signMessage', async (event, { message }) => {
    try {
      const signature = await walletManager.signMessage(message)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Send transaction
  ipcMain.handle('wallet:sendTransaction', async (event, { signedTransaction }) => {
    try {
      const signature = await walletManager.sendTransaction(signedTransaction)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Decode transaction (for inspection)
  ipcMain.handle('wallet:decodeTransaction', async (event, { transaction }) => {
    try {
      const decoded = walletManager.decodeTransaction(transaction)
      return { success: true, data: decoded }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Subscribe to balance changes - sends updates to renderer
  ipcMain.handle('wallet:subscribeBalance', async (event) => {
    try {
      // Set up subscription that sends balance updates to renderer
      const unsubscribe = walletManager.subscribeToBalance((balance) => {
        // Send balance update to the renderer that requested it
        const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
        if (win) {
          const contentView = win.contentView
          if (contentView && contentView.children && contentView.children[0]) {
            const mainView = contentView.children[0]
            mainView.webContents.send('wallet:balanceChanged', balance)
          }
        }
      })

      // Store unsubscribe function (could be used for cleanup)
      console.log('[WalletIPC] Balance subscription started')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get last known balance (synchronous, from cache)
  ipcMain.handle('wallet:getLastKnownBalance', async () => {
    try {
      const balance = walletManager.lastKnownBalance
      return { success: true, data: balance }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Clean up expired pending approvals periodically
  setInterval(() => {
    const now = Date.now()
    const timeout = 5 * 60 * 1000 // 5 minutes

    for (const [requestId, request] of pendingApprovals.entries()) {
      if (now - request.timestamp > timeout) {
        pendingApprovals.delete(requestId)
        console.log(`[WalletIPC] Expired pending request: ${requestId}`)
      }
    }
  }, 60 * 1000) // Check every minute

  console.log('[WalletIPC] IPC handlers ready')
}

function destroyWallet() {
  walletManager.destroy()
  pendingApprovals.clear()
}

module.exports = {
  setupWalletIPC,
  destroyWallet
}
