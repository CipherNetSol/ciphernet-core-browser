// Mixer API Service for CipherNet Browser
// Integrates with ChangeNOW API for crypto mixing/exchange

const BASE_URL = 'https://api.ciphernetsol.xyz/api/ciphernet'

/**
 * Get list of available currencies
 * @param {boolean} fixedRate - Filter for fixed rate exchanges
 * @param {boolean} active - Filter for active currencies only
 * @returns {Promise<Object>} List of available currencies
 */
async function getAvailableCurrencies(fixedRate = false, active = true) {
  try {
    const params = new URLSearchParams()
    if (fixedRate) params.append('fixedRate', 'true')
    if (active) params.append('active', 'true')

    const response = await fetch(
      `${BASE_URL}/currencies?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.success && result.data) {
      return { success: true, data: result.data }
    }
    return result
  } catch (error) {
    console.error('Error fetching currencies:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get minimum exchange amount for a currency pair
 * @param {string} fromCurrency - Source currency ticker
 * @param {string} toCurrency - Target currency ticker
 * @param {string} fromNetwork - Source network
 * @param {string} toNetwork - Target network
 * @returns {Promise<Object>} Minimum exchange amount data
 */
async function getMinimumExchangeAmount(
  fromCurrency,
  toCurrency,
  fromNetwork,
  toNetwork
) {
  try {
    const params = new URLSearchParams({
      fromCurrency: fromCurrency.toLowerCase(),
      toCurrency: toCurrency.toLowerCase(),
      fromNetwork: fromNetwork.toLowerCase(),
      toNetwork: toNetwork.toLowerCase(),
      flow: 'standard'
    })

    const response = await fetch(
      `${BASE_URL}/min-amount?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.success && result.data) {
      return { success: true, data: result.data }
    }
    return result
  } catch (error) {
    console.error('Error getting minimum amount:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get estimated exchange amount
 * @param {string} fromCurrency - Source currency ticker
 * @param {string} toCurrency - Target currency ticker
 * @param {string} fromNetwork - Source network
 * @param {string} toNetwork - Target network
 * @param {number} fromAmount - Amount to exchange
 * @param {string} flow - Exchange flow type
 * @returns {Promise<Object>} Estimated exchange data
 */
async function getEstimatedExchange(
  fromCurrency,
  toCurrency,
  fromNetwork,
  toNetwork,
  fromAmount,
  flow = 'standard'
) {
  try {
    const params = new URLSearchParams({
      fromCurrency: fromCurrency.toLowerCase(),
      toCurrency: toCurrency.toLowerCase(),
      fromNetwork: fromNetwork.toLowerCase(),
      toNetwork: toNetwork.toLowerCase(),
      fromAmount: fromAmount.toString(),
      flow,
      type: 'direct'
    })

    const response = await fetch(
      `${BASE_URL}/estimated-amount?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.success && result.data) {
      return { success: true, data: result.data }
    }
    return result
  } catch (error) {
    console.error('Error getting estimate:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Create exchange transaction
 * @param {Object} params - Transaction parameters
 * @returns {Promise<Object>} Created transaction data
 */
async function createExchange({
  fromCurrency,
  toCurrency,
  fromNetwork,
  toNetwork,
  fromAmount,
  address,
  refundAddress = '',
  contactEmail = ''
}) {
  try {
    const requestBody = {
      fromCurrency: fromCurrency.toLowerCase(),
      toCurrency: toCurrency.toLowerCase(),
      fromNetwork: fromNetwork.toLowerCase(),
      toNetwork: toNetwork.toLowerCase(),
      fromAmount: fromAmount.toString(),
      address,
      flow: 'standard',
      type: 'direct',
      rateId: '',
      ...(refundAddress && { refundAddress }),
      ...(contactEmail && { contactEmail })
    }

    const response = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.success && result.data) {
      return { success: true, data: result.data }
    }
    return result
  } catch (error) {
    console.error('Error creating exchange:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get transaction status
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object>} Transaction status data
 */
async function getTransactionStatus(transactionId) {
  try {
    const response = await fetch(`${BASE_URL}/transaction/${transactionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.success && result.data) {
      return { success: true, data: result.data }
    }
    return result
  } catch (error) {
    console.error('Error fetching transaction status:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Map status to human-readable text
 * @param {string} status - Status from API
 * @returns {string} Human-readable status
 */
function getStatusText(status) {
  const statusMap = {
    new: 'Waiting for deposit',
    waiting: 'Waiting for deposit',
    confirming: 'Confirming transaction',
    exchanging: 'Exchanging',
    sending: 'Sending to your wallet',
    finished: 'Completed',
    failed: 'Failed',
    refunded: 'Refunded',
    expired: 'Expired'
  }

  return statusMap[status] || status
}

/**
 * Get network for a currency
 * @param {string} currency - Currency ticker
 * @returns {string} Network name
 */
function getNetworkForCurrency(currency) {
  const networkMap = {
    sol: 'sol',
    usdt: 'eth',
    eth: 'eth',
    btc: 'btc',
    bnb: 'bsc',
    matic: 'matic',
    usdc: 'eth',
    dai: 'eth'
  }

  return networkMap[currency.toLowerCase()] || currency.toLowerCase()
}

module.exports = {
  getAvailableCurrencies,
  getMinimumExchangeAmount,
  getEstimatedExchange,
  createExchange,
  getTransactionStatus,
  getStatusText,
  getNetworkForCurrency
}
