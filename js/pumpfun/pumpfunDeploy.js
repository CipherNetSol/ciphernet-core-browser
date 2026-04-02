// js/pumpfun/pumpfunDeploy.js
// Main deployment logic for pump.fun tokens
// Orchestrates: generate mint -> upload metadata -> build tx -> sign -> send -> confirm

var { Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js')
var pumpfunMetadata = require('./pumpfunMetadata')
var pumpfunTxBuilder = require('./pumpfunTxBuilder')

var pumpfunDeploy = {
  /**
   * Deploy a token on pump.fun
   * @param {Object} params
   * @param {string} params.name - Token name
   * @param {string} params.symbol - Token symbol
   * @param {string} params.description - Token description
   * @param {Buffer|Uint8Array} params.imageBuffer - Image data
   * @param {string} params.imageName - Image filename
   * @param {string} params.imageMimeType - Image MIME type
   * @param {number} params.devBuy - Dev buy amount in SOL (0 for none)
   * @param {string} [params.twitter] - Twitter handle
   * @param {string} [params.telegram] - Telegram link
   * @param {string} [params.website] - Website URL
   * @param {number} [params.slippage] - Slippage (default 10)
   * @param {number} [params.priorityFee] - Priority fee in SOL (default 0.0005)
   * @param {Keypair} params.walletKeypair - Deployer wallet keypair
   * @param {Connection} params.connection - Solana RPC connection
   * @returns {Promise<Object>} Deployment result
   */
  deploy: async function (params) {
    var walletKeypair = params.walletKeypair
    var connection = params.connection

    if (!walletKeypair || !connection) {
      throw new Error('Wallet keypair and connection are required')
    }

    var walletPubkey = walletKeypair.publicKey.toBase58()

    // Step 1: Check wallet balance
    console.log('[PumpfunDeploy] Step 1: Checking wallet balance...')
    var balance = await connection.getBalance(walletKeypair.publicKey)
    var balanceSol = balance / LAMPORTS_PER_SOL
    console.log('[PumpfunDeploy] Balance:', balanceSol, 'SOL')

    var minRequired = 0.1
    if (balanceSol < minRequired) {
      throw new Error('Insufficient SOL balance. Have ' + balanceSol.toFixed(4) + ' SOL, need at least ' + minRequired + ' SOL for pump.fun deployment.')
    }

    // Step 2: Generate mint keypair
    console.log('[PumpfunDeploy] Step 2: Generating mint keypair...')
    var mintKeypair = Keypair.generate()
    var mintPubkey = mintKeypair.publicKey.toBase58()
    console.log('[PumpfunDeploy] Mint address:', mintPubkey)

    // Step 3: Upload metadata to pump.fun IPFS
    console.log('[PumpfunDeploy] Step 3: Uploading metadata to pump.fun IPFS...')
    var metadataResult = await pumpfunMetadata.uploadMetadata({
      name: params.name,
      symbol: params.symbol,
      description: params.description || '',
      imageBuffer: params.imageBuffer,
      imageName: params.imageName || 'logo.png',
      imageMimeType: params.imageMimeType || 'image/png',
      twitter: params.twitter,
      telegram: params.telegram,
      website: params.website
    })
    console.log('[PumpfunDeploy] Metadata URI:', metadataResult.metadataUri)

    // Step 4: Build pump creation transaction via PumpPortal
    console.log('[PumpfunDeploy] Step 4: Building pump creation transaction...')
    var txResult = await pumpfunTxBuilder.buildCreateTransaction({
      publicKey: walletPubkey,
      mintPublicKey: mintPubkey,
      metadataUri: metadataResult.metadataUri,
      name: params.name,
      symbol: params.symbol,
      devBuyAmount: params.devBuy || 0,
      slippage: params.slippage || 10,
      priorityFee: params.priorityFee || 0.0005
    })

    var tx = txResult.transaction

    // Step 5: Sign transaction with both wallet and mint keypairs
    console.log('[PumpfunDeploy] Step 5: Signing transaction...')
    tx.sign([walletKeypair, mintKeypair])
    console.log('[PumpfunDeploy] Transaction signed')

    // Step 6: Send transaction
    console.log('[PumpfunDeploy] Step 6: Sending transaction...')
    var signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3
    })
    console.log('[PumpfunDeploy] Transaction sent:', signature)

    // Step 7: Wait for confirmation
    console.log('[PumpfunDeploy] Step 7: Waiting for confirmation...')
    var confirmation = await connection.confirmTransaction(signature, 'confirmed')

    if (confirmation.value && confirmation.value.err) {
      throw new Error('Transaction failed on-chain: ' + JSON.stringify(confirmation.value.err))
    }

    console.log('[PumpfunDeploy] Transaction confirmed!')

    // Step 8: Return result
    var pumpUrl = 'https://pump.fun/' + mintPubkey

    return {
      success: true,
      mint: mintPubkey,
      tx: signature,
      pumpUrl: pumpUrl,
      metadataUri: metadataResult.metadataUri,
      name: params.name,
      symbol: params.symbol,
      devBuy: params.devBuy || 0
    }
  }
}

module.exports = pumpfunDeploy
