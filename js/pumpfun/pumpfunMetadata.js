// js/pumpfun/pumpfunMetadata.js
// Uploads token metadata (name, symbol, description, image, socials) to pump.fun IPFS

var fetch = require('cross-fetch')

var pumpfunMetadata = {
  /**
   * Upload metadata to pump.fun IPFS endpoint
   * @param {Object} params
   * @param {string} params.name - Token name
   * @param {string} params.symbol - Token symbol
   * @param {string} params.description - Token description
   * @param {Buffer|Uint8Array} params.imageBuffer - Image file data
   * @param {string} params.imageName - Image filename (e.g. 'logo.png')
   * @param {string} params.imageMimeType - MIME type (e.g. 'image/png')
   * @param {string} [params.twitter] - Twitter handle
   * @param {string} [params.telegram] - Telegram link
   * @param {string} [params.website] - Website URL
   * @returns {Promise<{metadataUri: string}>}
   */
  uploadMetadata: async function (params) {
    console.log('[PumpfunMetadata] Uploading metadata for:', params.name, params.symbol)

    if (!params.imageBuffer) {
      throw new Error('Image is required for pump.fun metadata upload')
    }

    // Build multipart form data manually (no form-data dependency needed)
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
    if (params.twitter) addField('twitter', params.twitter)
    if (params.telegram) addField('telegram', params.telegram)
    if (params.website) addField('website', params.website)

    var fileHeader =
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + (params.imageName || 'logo.png') + '"\r\n' +
      'Content-Type: ' + (params.imageMimeType || 'image/png') + '\r\n\r\n'

    var ending = '\r\n--' + boundary + '--\r\n'

    var textBuffer = Buffer.from(parts.join(''), 'utf-8')
    var headerBuffer = Buffer.from(fileHeader, 'utf-8')
    var endBuffer = Buffer.from(ending, 'utf-8')
    var body = Buffer.concat([textBuffer, headerBuffer, Buffer.from(params.imageBuffer), endBuffer])

    var response = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body: body
    })

    if (!response.ok) {
      var errorText = await response.text()
      throw new Error('Pump.fun IPFS upload failed (' + response.status + '): ' + errorText)
    }

    var result = await response.json()
    console.log('[PumpfunMetadata] Upload result:', JSON.stringify(result))

    if (!result.metadataUri) {
      throw new Error('Pump.fun IPFS upload did not return metadataUri')
    }

    return { metadataUri: result.metadataUri }
  }
}

module.exports = pumpfunMetadata
