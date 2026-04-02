// main/pumpfunDeploy.js
// Pump.fun token deployment via PumpDev API (pumpdev.io)
// PumpDev builds the create_v2 + buy transaction server-side
// We just sign locally and send — no on-chain instruction building needed
// This file is concatenated into the main process bundle and uses the global walletManager

var pumpfunWeb3 = require('@solana/web3.js')
var pumpfunKeypair = pumpfunWeb3.Keypair
var pumpfunPublicKey = pumpfunWeb3.PublicKey
var pumpfunVersionedTransaction = pumpfunWeb3.VersionedTransaction
var pumpfunLAMPORTS_PER_SOL = pumpfunWeb3.LAMPORTS_PER_SOL
var pumpfunBs58Raw = require('bs58')
var pumpfunBs58 = pumpfunBs58Raw.default || pumpfunBs58Raw

// PumpDev API config
var PUMPDEV_API_URL = 'https://pumpdev.io'
var PUMPDEV_API_KEY = 'jAi34jZ6mVxnibh7VMkIevhELzy8HKyE8x5VyaWQ3M_kb63xZY6mbX4xyGSvmetD'

// Use native fetch with cross-fetch fallback
function pumpfunFetch (url, options) {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(url, options)
  }
  var crossFetch = require('cross-fetch')
  return crossFetch(url, options)
}

/**
 * Resolve image data from various sources (dataUrl, file path, http URL)
 */
async function pumpfunResolveImage (imageSource) {
  var fs = require('fs')
  var path = require('path')

  if (!imageSource) {
    throw new Error('Image is required for pump.fun deployment')
  }

  if (imageSource.startsWith('data:')) {
    var matches = imageSource.match(/^data:([^;]+);base64,(.+)$/)
    if (!matches) throw new Error('Invalid data URL format')
    var mimeType = matches[1]
    var base64Data = matches[2]
    var buffer = Buffer.from(base64Data, 'base64')
    var ext = mimeType.split('/')[1] || 'png'
    return { buffer: buffer, name: 'logo.' + ext, mimeType: mimeType }
  }

  if (imageSource.startsWith('file://')) {
    var filePath = imageSource.replace('file://', '')
    if (!fs.existsSync(filePath)) throw new Error('Image file not found: ' + filePath)
    var buffer = fs.readFileSync(filePath)
    var ext = path.extname(filePath).replace('.', '').toLowerCase()
    var mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
    return { buffer: buffer, name: path.basename(filePath), mimeType: mimeMap[ext] || 'image/png' }
  }

  if (imageSource.startsWith('http')) {
    var response = await pumpfunFetch(imageSource)
    if (!response.ok) throw new Error('Failed to download image: ' + response.status)
    var contentType = response.headers.get('content-type') || 'image/png'
    var arrayBuffer = await response.arrayBuffer()
    var buffer = Buffer.from(arrayBuffer)
    var ext = contentType.split('/')[1] || 'png'
    return { buffer: buffer, name: 'logo.' + ext, mimeType: contentType }
  }

  throw new Error('Unsupported image source format. Provide a data URL, file:// path, or http(s) URL.')
}

/**
 * Upload metadata to pump.fun IPFS
 */
async function pumpfunUploadMetadata (params) {
  console.log('[PumpfunDeploy] Uploading metadata to pump.fun IPFS...')

  var boundary = '----PumpfunBoundary' + Date.now()
  var parts = []

  function addField (name, value) {
    parts.push(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
      value + '\r\n'
    )
  }

  addField('name', params.name)
  addField('symbol', params.symbol)
  addField('description', params.description || '')
  addField('showName', 'true')
  if (params.twitter) addField('twitter', params.twitter)
  if (params.telegram) addField('telegram', params.telegram)
  if (params.website) addField('website', params.website)

  var fileHeader =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="' + params.imageName + '"\r\n' +
    'Content-Type: ' + params.imageMimeType + '\r\n\r\n'

  var ending = '\r\n--' + boundary + '--\r\n'

  var textBuffer = Buffer.from(parts.join(''), 'utf-8')
  var headerBuffer = Buffer.from(fileHeader, 'utf-8')
  var endBuffer = Buffer.from(ending, 'utf-8')
  var body = Buffer.concat([textBuffer, headerBuffer, params.imageBuffer, endBuffer])

  var response = await pumpfunFetch('https://pump.fun/api/ipfs', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body: body
  })

  if (!response.ok) {
    var errorText = await response.text()
    throw new Error('Pump.fun IPFS upload failed (' + response.status + '): ' + errorText)
  }

  var result = await response.json()
  console.log('[PumpfunDeploy] IPFS result:', JSON.stringify(result))

  if (!result.metadataUri) {
    throw new Error('Pump.fun IPFS upload did not return metadataUri')
  }

  return result.metadataUri
}

/**
 * Main deployment function — called via IPC from the agent
 * Uses PumpDev API to build the transaction, signs locally, sends via our RPC
 */
async function deployPumpfunToken (params) {
  if (!walletManager || !walletManager.keypair || !walletManager.connection) {
    throw new Error('Wallet not initialized')
  }

  // Pump.fun only works on mainnet
  if (walletManager.network === 'devnet') {
    throw new Error('Pump.fun only works on mainnet. Please switch your wallet to mainnet before deploying.')
  }

  var wKeypair = walletManager.keypair
  var connection = walletManager.connection
  var walletPubkey = wKeypair.publicKey
  var devBuySol = parseFloat(params.devBuy) || 0
  var slippagePct = parseFloat(params.slippage) || 30
  var priorityFee = parseFloat(params.priorityFee) || 0.0005

  // Step 1: Check balance
  console.log('[PumpfunDeploy] Step 1: Checking wallet balance...')
  var balance = await connection.getBalance(walletPubkey)
  var balanceSol = balance / pumpfunLAMPORTS_PER_SOL
  console.log('[PumpfunDeploy] Balance:', balanceSol, 'SOL')

  var minRequired = 0.02 + devBuySol
  if (balanceSol < minRequired) {
    throw new Error('Insufficient SOL balance. Have ' + balanceSol.toFixed(4) + ' SOL, need at least ' + minRequired.toFixed(4) + ' SOL (0.02 fees + ' + devBuySol + ' dev buy).')
  }

  // Step 2: Resolve image
  console.log('[PumpfunDeploy] Step 2: Resolving image...')
  var imageData = await pumpfunResolveImage(params.image)
  console.log('[PumpfunDeploy] Image resolved:', imageData.name, imageData.mimeType, imageData.buffer.length, 'bytes')

  // Step 3: Upload metadata to pump.fun IPFS
  console.log('[PumpfunDeploy] Step 3: Uploading metadata...')
  var metadataUri = await pumpfunUploadMetadata({
    name: params.name,
    symbol: params.symbol,
    description: params.description || '',
    imageBuffer: imageData.buffer,
    imageName: imageData.name,
    imageMimeType: imageData.mimeType,
    twitter: params.twitter,
    telegram: params.telegram,
    website: params.website
  })
  console.log('[PumpfunDeploy] Metadata URI:', metadataUri)

  // Step 4: Call PumpDev API to build the transaction
  console.log('[PumpfunDeploy] Step 4: Requesting transaction from PumpDev API...')
  var createPayload = {
    publicKey: walletPubkey.toBase58(),
    name: params.name,
    symbol: params.symbol,
    uri: metadataUri,
    slippage: slippagePct,
    priorityFee: priorityFee
  }

  // Add dev buy if specified
  if (devBuySol > 0) {
    createPayload.buyAmountSol = devBuySol
  }

  console.log('[PumpfunDeploy] API payload:', JSON.stringify(createPayload))

  var apiResponse = await pumpfunFetch(PUMPDEV_API_URL + '/api/create?api-key=' + PUMPDEV_API_KEY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createPayload)
  })

  if (!apiResponse.ok) {
    var errorBody = await apiResponse.text()
    console.error('[PumpfunDeploy] API error:', apiResponse.status, apiResponse.statusText, errorBody)
    throw new Error('PumpDev API error (' + apiResponse.status + '): ' + errorBody)
  }

  var apiResult = await apiResponse.json()
  console.log('[PumpfunDeploy] API response - mint:', apiResult.mint)

  if (!apiResult.transaction) {
    throw new Error('PumpDev API did not return a transaction')
  }

  // Step 5: Deserialize and sign the transaction
  console.log('[PumpfunDeploy] Step 5: Signing transaction...')
  var mintKeypair = pumpfunKeypair.fromSecretKey(pumpfunBs58.decode(apiResult.mintSecretKey))
  var txBytes = pumpfunBs58.decode(apiResult.transaction)
  var tx = pumpfunVersionedTransaction.deserialize(txBytes)

  // Sign with both creator wallet and mint keypair
  tx.sign([wKeypair, mintKeypair])
  console.log('[PumpfunDeploy] Transaction signed')

  // Step 6: Send transaction
  console.log('[PumpfunDeploy] Step 6: Sending transaction...')
  var rawTx = tx.serialize()
  var signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: true,
    maxRetries: 3
  })
  console.log('[PumpfunDeploy] Transaction sent:', signature)

  // Step 7: Wait for confirmation
  console.log('[PumpfunDeploy] Step 7: Waiting for confirmation...')
  var blockhashInfo = await connection.getLatestBlockhash('confirmed')
  var confirmation = await connection.confirmTransaction({
    signature: signature,
    blockhash: blockhashInfo.blockhash,
    lastValidBlockHeight: blockhashInfo.lastValidBlockHeight
  }, 'confirmed')

  if (confirmation.value && confirmation.value.err) {
    throw new Error('Transaction failed on-chain: ' + JSON.stringify(confirmation.value.err))
  }

  console.log('[PumpfunDeploy] Token deployed successfully!')

  return {
    success: true,
    mint: apiResult.mint,
    tx: signature,
    pumpUrl: 'https://pump.fun/' + apiResult.mint,
    explorerUrl: 'https://solscan.io/tx/' + signature,
    metadataUri: metadataUri,
    name: params.name,
    symbol: params.symbol,
    devBuy: devBuySol,
    network: 'mainnet-beta'
  }
}
