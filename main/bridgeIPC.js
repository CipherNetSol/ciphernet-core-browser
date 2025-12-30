// main\bridgeIPC.js
// Bridge IPC - Main process API calls to avoid CORS
// Note: ipc (ipc) is available from electron require in main.js

const BRIDGE_API_BASE = 'https://nulltrace.app/api'
const BRIDGE_REF = 'ciphernetsol'

function setupBridgeIPC() {
  ipc.handle('bridge:getCurrencies', async () => {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/currencies`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeIPC] Error fetching currencies:', error)
      return { success: false, error: error.message }
    }
  })

  ipc.handle('bridge:simulate', async (event, params) => {
    try {
      // console.log('[BridgeIPC] Simulate request:', params)
      const response = await fetch(`${BRIDGE_API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromNetwork: params.fromNetwork,
          fromCurrency: params.fromCurrency,
          toNetwork: params.toNetwork,
          toCurrency: params.toCurrency,
          amount: parseFloat(params.amount),
          privacy: params.privacy
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      const data = await response.json()
      // console.log('[BridgeIPC] Simulate response:', JSON.stringify(data, null, 2))
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeIPC] Error simulating:', error)
      return { success: false, error: error.message }
    }
  })

  ipc.handle('bridge:createBridge', async (event, params) => {
    try {
      // console.log('[BridgeIPC] Create bridge request:', params)
      const response = await fetch(`${BRIDGE_API_BASE}/bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromNetwork: params.fromNetwork,
          fromCurrency: params.fromCurrency,
          toNetwork: params.toNetwork,
          toCurrency: params.toCurrency,
          amount: parseFloat(params.amount),
          privacy: params.privacy,
          recipientAddress: params.recipientAddress,
          ref: BRIDGE_REF
        })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      const data = await response.json()
      // console.log('[BridgeIPC] Create bridge response:', JSON.stringify(data, null, 2))
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeIPC] Error creating bridge:', error)
      return { success: false, error: error.message }
    }
  })

  ipc.handle('bridge:getStatus', async (event, orderId) => {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeIPC] Error getting status:', error)
      return { success: false, error: error.message }
    }
  })

  // console.log('[BridgeIPC] Bridge IPC handlers registered')
}

// Function setupBridgeIPC is available globally in the concatenated bundle
