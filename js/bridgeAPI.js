// Bridge API Service - NullTrace Bridge Integration
// REST API wrapper for cross-chain bridging

const BRIDGE_API_BASE = 'https://nulltrace.app/api'
const BRIDGE_REF = 'ciphernetsol'

const bridgeAPI = {
  /**
   * Fetch all supported currencies and networks
   * @returns {Promise<Object>} - { success: boolean, data: Array, error?: string }
   */
  async getCurrencies() {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/currencies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeAPI] Error fetching currencies:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Simulate a bridge transaction to get estimated output, fees, and limits
   * @param {Object} params - Simulation parameters
   * @param {string} params.fromNetwork - Source network
   * @param {string} params.fromCurrency - Source currency
   * @param {string} params.toNetwork - Destination network
   * @param {string} params.toCurrency - Destination currency
   * @param {number} params.amount - Amount to bridge
   * @param {string} params.privacy - Privacy level: 'fast', 'semi', or 'full'
   * @returns {Promise<Object>} - Simulation result
   */
  async simulate(params) {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeAPI] Error simulating bridge:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Create a bridge order
   * @param {Object} params - Order parameters
   * @param {string} params.fromNetwork - Source network
   * @param {string} params.fromCurrency - Source currency
   * @param {string} params.toNetwork - Destination network
   * @param {string} params.toCurrency - Destination currency
   * @param {number} params.amount - Amount to bridge
   * @param {string} params.privacy - Privacy level: 'fast', 'semi', or 'full'
   * @param {string} params.recipientAddress - Destination wallet address
   * @returns {Promise<Object>} - Order creation result
   */
  async createBridge(params) {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/bridge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeAPI] Error creating bridge order:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Get the status of a bridge order
   * @param {string} orderId - The order ID to check
   * @returns {Promise<Object>} - Order status result
   */
  async getStatus(orderId) {
    try {
      const response = await fetch(`${BRIDGE_API_BASE}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: orderId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      console.error('[BridgeAPI] Error fetching bridge status:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Map privacy mode to API value
   * @param {string} mode - 'standard', 'private', or 'xmr'
   * @returns {string} - API privacy value
   */
  mapPrivacyMode(mode) {
    const mapping = {
      'standard': 'fast',
      'private': 'semi',
      'xmr': 'full'
    }
    return mapping[mode] || 'fast'
  },

  /**
   * Get human-readable status text
   * @param {string} status - API status code
   * @returns {string} - Human-readable status
   */
  getStatusText(status) {
    const statusMap = {
      'waiting': 'Waiting for deposit',
      'confirming': 'Confirming deposit',
      'exchanging': 'Processing exchange',
      'sending': 'Sending funds',
      'completed': 'Completed',
      'failed': 'Failed',
      'refunded': 'Refunded',
      'expired': 'Expired'
    }
    return statusMap[status] || status
  },

  /**
   * Check if status is a final state
   * @param {string} status - Order status
   * @returns {boolean}
   */
  isFinalStatus(status) {
    return ['completed', 'failed', 'refunded', 'expired'].includes(status)
  }
}

module.exports = bridgeAPI
