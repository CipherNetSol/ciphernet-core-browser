// js/pumpfun/pumpfunTxBuilder.js
// Calls the PumpPortal local transaction API and deserializes the returned transaction

var fetch = require('cross-fetch')
var { VersionedTransaction } = require('@solana/web3.js')

var pumpfunTxBuilder = {
  /**
   * Request a pump.fun token creation transaction from PumpPortal
   * @param {Object} params
   * @param {string} params.publicKey - Deployer wallet public key (base58)
   * @param {string} params.mintPublicKey - New mint keypair public key (base58)
   * @param {string} params.metadataUri - IPFS metadata URI from pump.fun
   * @param {string} params.name - Token name
   * @param {string} params.symbol - Token symbol
   * @param {number} params.devBuyAmount - Amount of SOL for dev buy (0 for no dev buy)
   * @param {number} [params.slippage] - Slippage tolerance (default 10)
   * @param {number} [params.priorityFee] - Priority fee in SOL (default 0.0005)
   * @returns {Promise<{transaction: VersionedTransaction}>}
   */
  buildCreateTransaction: async function (params) {
    console.log('[PumpfunTxBuilder] Building create transaction...')
    console.log('[PumpfunTxBuilder] Deployer:', params.publicKey)
    console.log('[PumpfunTxBuilder] Mint:', params.mintPublicKey)

    var payload = {
      publicKey: params.publicKey,
      action: 'create',
      tokenMetadata: {
        name: params.name,
        symbol: params.symbol,
        uri: params.metadataUri
      },
      mint: params.mintPublicKey,
      denominatedInSol: true,
      amount: params.devBuyAmount || 0,
      slippage: params.slippage || 10,
      priorityFee: params.priorityFee || 0.0005,
      pool: 'pump'
    }

    console.log('[PumpfunTxBuilder] Request payload:', JSON.stringify(payload, null, 2))

    var response = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      var errorText = await response.text()
      throw new Error('PumpPortal API failed (' + response.status + '): ' + errorText)
    }

    // Response is raw binary transaction data
    var txBuffer = await response.arrayBuffer()
    var txBytes = new Uint8Array(txBuffer)

    console.log('[PumpfunTxBuilder] Received transaction bytes:', txBytes.length)

    // Deserialize as VersionedTransaction
    var transaction = VersionedTransaction.deserialize(txBytes)

    console.log('[PumpfunTxBuilder] Transaction deserialized successfully')

    return { transaction: transaction }
  }
}

module.exports = pumpfunTxBuilder
