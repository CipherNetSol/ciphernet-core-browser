// Wallet IPC Handlers - Bridge between main process and renderer/webviews
// Note: ipc (ipc), BaseWindow are available from electron require in main.js
// walletManager is loaded before this file in buildMain.js

// Store pending approval requests
const pendingApprovals = new Map()

function setupWalletIPC() {
  // console.log('[WalletIPC] Setting up IPC handlers...')

  // Initialize wallet on app start
  ipc.handle('wallet:initialize', async () => {
    try {
      const result = walletManager.initialize()
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get public key
  ipc.handle('wallet:getPublicKey', async () => {
    try {
      const publicKey = walletManager.getPublicKey()
      return { success: true, data: { publicKey } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get balance
  ipc.handle('wallet:getBalance', async () => {
    try {
      const balance = await walletManager.getBalance()
      return { success: true, data: balance }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Export private key (user action from wallet panel)
  ipc.handle('wallet:exportPrivateKey', async () => {
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
  ipc.handle('wallet:getNetwork', async () => {
    try {
      return { success: true, data: { network: walletManager.network } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Switch network
  ipc.handle('wallet:switchNetwork', async (event, network) => {
    try {
      const result = walletManager.switchNetwork(network)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Request connection approval from dApp
  ipc.handle('wallet:requestConnect', async (event, { origin, tabId }) => {
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
      // console.log('[WalletIPC] Window found:', !!win)
      if (win) {
        // BaseWindow uses contentView property, not getContentView()
        const contentView = win.contentView
        // console.log('[WalletIPC] Content view:', !!contentView)
        // console.log('[WalletIPC] Children count:', contentView?.children?.length)
        if (contentView && contentView.children && contentView.children[0]) {
          const mainView = contentView.children[0]
          mainView.webContents.send('wallet:showConnectApproval', {
            requestId,
            origin,
            tabId,
            publicKey: walletManager.getPublicKey()
          })
          // console.log('[WalletIPC] Sent showConnectApproval to renderer')
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
  ipc.handle('wallet:approveConnect', async (event, { requestId }) => {
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
  ipc.handle('wallet:rejectConnect', async (event, { requestId }) => {
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
  ipc.handle('wallet:requestSignTransaction', async (event, { transaction, origin, tabId }) => {
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
  ipc.handle('wallet:approveSignTransaction', async (event, { requestId }) => {
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
  ipc.handle('wallet:rejectSignTransaction', async (event, { requestId }) => {
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
  ipc.handle('wallet:requestSignAllTransactions', async (event, { transactions, origin, tabId }) => {
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
  ipc.handle('wallet:approveSignAllTransactions', async (event, { requestId }) => {
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
  ipc.handle('wallet:rejectSignAllTransactions', async (event, { requestId }) => {
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
  ipc.handle('wallet:requestSignMessage', async (event, { message, origin, tabId }) => {
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
  ipc.handle('wallet:approveSignMessage', async (event, { requestId }) => {
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
  ipc.handle('wallet:rejectSignMessage', async (event, { requestId }) => {
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
  ipc.handle('wallet:signTransaction', async (event, { transaction }) => {
    try {
      const signedTransaction = await walletManager.signTransaction(transaction)
      return { success: true, data: { signedTransaction } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Direct sign message (from wallet panel, already approved)
  ipc.handle('wallet:signMessage', async (event, { message }) => {
    try {
      const signature = await walletManager.signMessage(message)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Send transaction
  ipc.handle('wallet:sendTransaction', async (event, { signedTransaction }) => {
    try {
      const signature = await walletManager.sendTransaction(signedTransaction)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Decode transaction (for inspection)
  ipc.handle('wallet:decodeTransaction', async (event, { transaction }) => {
    try {
      const decoded = walletManager.decodeTransaction(transaction)
      return { success: true, data: decoded }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Subscribe to balance changes - sends updates to renderer
  // Uses both WebSocket subscription AND polling as fallback
  let balancePollingInterval = null
  let lastPolledBalance = null

  ipc.handle('wallet:subscribeBalance', async (event) => {
    try {
      // Set up WebSocket subscription that sends balance updates to renderer
      walletManager.subscribeToBalance((balance) => {
        // Send balance update to the renderer that requested it
        const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
        if (win) {
          const contentView = win.contentView
          if (contentView && contentView.children && contentView.children[0]) {
            const mainView = contentView.children[0]
            mainView.webContents.send('wallet:balanceChanged', balance)
            lastPolledBalance = balance.lamports
          }
        }
      })

      // Also start polling as fallback (WebSocket only works for existing accounts)
      // Poll every 5 seconds
      if (balancePollingInterval) {
        clearInterval(balancePollingInterval)
      }

      balancePollingInterval = setInterval(async () => {
        try {
          const balance = await walletManager.getBalance()
          // Only send update if balance actually changed
          if (lastPolledBalance !== balance.lamports) {
            lastPolledBalance = balance.lamports
            const win = BaseWindow.getFocusedWindow() || BaseWindow.getAllWindows()[0]
            if (win) {
              const contentView = win.contentView
              if (contentView && contentView.children && contentView.children[0]) {
                const mainView = contentView.children[0]
                mainView.webContents.send('wallet:balanceChanged', balance)
                // console.log('[WalletIPC] Balance poll update:', balance.sol, 'SOL')
              }
            }
          }
        } catch (error) {
          // Ignore polling errors (network issues, etc.)
        }
      }, 5000) // Poll every 5 seconds

      // console.log('[WalletIPC] Balance subscription + polling started')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get last known balance (synchronous, from cache)
  ipc.handle('wallet:getLastKnownBalance', async () => {
    try {
      const balance = walletManager.lastKnownBalance
      return { success: true, data: balance }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get all token accounts and balances
  ipc.handle('wallet:getTokens', async () => {
    try {
      const tokens = await walletManager.getTokenAccounts()
      return { success: true, data: tokens }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Send SOL to recipient
  ipc.handle('wallet:sendSOL', async (event, { recipient, amount }) => {
    try {
      // Validate address
      if (!walletManager.isValidAddress(recipient)) {
        return { success: false, error: 'Invalid recipient address' }
      }

      const signature = await walletManager.sendSOL(recipient, amount)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Send SPL token to recipient
  ipc.handle('wallet:sendToken', async (event, { mint, recipient, amount, decimals }) => {
    try {
      // Validate address
      if (!walletManager.isValidAddress(recipient)) {
        return { success: false, error: 'Invalid recipient address' }
      }

      const signature = await walletManager.sendToken(mint, recipient, amount, decimals)
      return { success: true, data: { signature } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Validate Solana address
  ipc.handle('wallet:validateAddress', async (event, { address }) => {
    try {
      const isValid = walletManager.isValidAddress(address)
      return { success: true, data: { isValid } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Estimate transaction fee
  ipc.handle('wallet:estimateFee', async () => {
    try {
      const fee = await walletManager.estimateFee()
      return { success: true, data: { fee } }
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
        // console.log(`[WalletIPC] Expired pending request: ${requestId}`)
      }
    }
  }, 60 * 1000) // Check every minute

  // console.log('[WalletIPC] IPC handlers ready')
}

function destroyWallet() {
  walletManager.destroy()
  pendingApprovals.clear()
}

// Functions setupWalletIPC and destroyWallet are available globally in the concatenated bundle
