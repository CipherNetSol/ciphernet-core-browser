// Solana Session Wallet Manager - Main Process
// Ephemeral wallet that exists only in memory for the browser session

const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, SystemProgram } = require('@solana/web3.js')
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction, getAccount } = require('@solana/spl-token')
const bs58Module = require('bs58')
// Handle both bs58 v4.x (default export) and v6.x (named export)
const bs58 = bs58Module.default || bs58Module

// RPC endpoints
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com'
const DEVNET_RPC = 'https://api.devnet.solana.com'

// Token metadata cache
const TOKEN_METADATA_CACHE = new Map()

class WalletManager {
  constructor() {
    this.keypair = null
    this.connection = null
    this.network = 'mainnet-beta' // or 'devnet'
    this.pendingTransactions = new Map() // requestId -> { transaction, resolve, reject }

    // Balance subscription
    this.balanceSubscriptionId = null
    this.balanceCallbacks = new Set()
    this.lastKnownBalance = null
  }

  /**
   * Initialize the wallet - generates a new keypair on every browser launch
   */
  initialize() {
    // Generate new ephemeral keypair
    this.keypair = Keypair.generate()

    // Initialize connection
    const rpcUrl = this.network === 'mainnet-beta' ? MAINNET_RPC : DEVNET_RPC
    this.connection = new Connection(rpcUrl, 'confirmed')

    // console.log('[WalletManager] Session wallet initialized')
    // console.log('[WalletManager] Public Key:', this.getPublicKey())
    // console.log('[WalletManager] Private Key (Array):', JSON.stringify(this.getSecretKey()))
    // console.log('[WalletManager] Private Key (Base58):', this.getSecretKeyBase58())

    return {
      publicKey: this.getPublicKey(),
      network: this.network
    }
  }

  /**
   * Get the public key as base58 string
   */
  getPublicKey() {
    if (!this.keypair) return null
    return this.keypair.publicKey.toBase58()
  }

  /**
   * Get the secret key as Uint8Array (for export)
   * Returns the 64-byte secret key in Phantom-compatible format
   */
  getSecretKey() {
    if (!this.keypair) return null
    return Array.from(this.keypair.secretKey)
  }

  /**
   * Get the secret key as base58 string
   */
  getSecretKeyBase58() {
    if (!this.keypair) return null
    return bs58.encode(this.keypair.secretKey)
  }

  /**
   * Get wallet balance in SOL
   */
  async getBalance() {
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized')
    }

    try {
      const balance = await this.connection.getBalance(this.keypair.publicKey)
      this.lastKnownBalance = {
        lamports: balance,
        sol: balance / LAMPORTS_PER_SOL
      }
      return this.lastKnownBalance
    } catch (error) {
      console.error('[WalletManager] Error getting balance:', error)
      throw error
    }
  }

  /**
   * Subscribe to balance changes
   * @param {Function} callback - Called when balance changes with { lamports, sol }
   * @returns {Function} - Unsubscribe function
   */
  subscribeToBalance(callback) {
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized')
    }

    // Add callback
    this.balanceCallbacks.add(callback)

    // Start subscription if not already running
    if (this.balanceSubscriptionId === null) {
      this._startBalanceSubscription()
    }

    // Return unsubscribe function
    return () => {
      this.balanceCallbacks.delete(callback)
      if (this.balanceCallbacks.size === 0) {
        this._stopBalanceSubscription()
      }
    }
  }

  /**
   * Start WebSocket subscription to account changes
   */
  _startBalanceSubscription() {
    if (!this.keypair || !this.connection) return

    try {
      this.balanceSubscriptionId = this.connection.onAccountChange(
        this.keypair.publicKey,
        (accountInfo, context) => {
          const lamports = accountInfo.lamports
          const sol = lamports / LAMPORTS_PER_SOL

          // Only emit if balance actually changed
          if (this.lastKnownBalance === null || this.lastKnownBalance.lamports !== lamports) {
            this.lastKnownBalance = { lamports, sol }
            // console.log('[WalletManager] Balance changed:', sol, 'SOL')

            // Notify all callbacks
            this.balanceCallbacks.forEach(callback => {
              try {
                callback({ lamports, sol })
              } catch (error) {
                console.error('[WalletManager] Balance callback error:', error)
              }
            })
          }
        },
        'confirmed'
      )

      // console.log('[WalletManager] Balance subscription started, ID:', this.balanceSubscriptionId)
    } catch (error) {
      console.error('[WalletManager] Failed to start balance subscription:', error)
    }
  }

  /**
   * Stop WebSocket subscription
   */
  _stopBalanceSubscription() {
    if (this.balanceSubscriptionId !== null && this.connection) {
      try {
        this.connection.removeAccountChangeListener(this.balanceSubscriptionId)
        // console.log('[WalletManager] Balance subscription stopped')
      } catch (error) {
        console.error('[WalletManager] Error stopping balance subscription:', error)
      }
      this.balanceSubscriptionId = null
    }
  }

  /**
   * Sign a transaction (supports both legacy and versioned transactions)
   * @param {Buffer} serializedTransaction - Serialized transaction buffer
   * @returns {Buffer} - Signed serialized transaction
   */
  async signTransaction(serializedTransaction) {
    if (!this.keypair) {
      throw new Error('Wallet not initialized')
    }

    try {
      const txBuffer = Buffer.from(serializedTransaction)

      // Try to detect versioned transaction by checking the message version byte
      // The structure is: [num_signatures (1 byte)][signatures (64 bytes each)][message...]
      // For versioned transactions, the message starts with a version byte with high bit set (0x80 for v0)
      const numSignatures = txBuffer[0]
      const messageOffset = 1 + (numSignatures * 64)
      const messageVersionByte = txBuffer[messageOffset]
      const isVersioned = messageVersionByte !== undefined && (messageVersionByte & 0x80) !== 0

      console.log('[WalletManager] Transaction detection:', {
        numSignatures,
        messageOffset,
        messageVersionByte,
        isVersioned,
        totalLength: txBuffer.length
      })

      if (isVersioned) {
        // Handle VersionedTransaction (v0 transactions used by Jupiter, etc.)
        // console.log('[WalletManager] Signing VersionedTransaction')
        const versionedTx = VersionedTransaction.deserialize(txBuffer)

        // Sign the versioned transaction
        versionedTx.sign([this.keypair])

        // Return serialized signed transaction
        return Array.from(versionedTx.serialize())
      } else {
        // Handle legacy Transaction
        // console.log('[WalletManager] Signing legacy Transaction')
        const transaction = Transaction.from(txBuffer)

        // Sign with our keypair
        transaction.sign(this.keypair)

        // Return serialized signed transaction
        return Array.from(transaction.serialize())
      }
    } catch (error) {
      console.error('[WalletManager] Error signing transaction:', error)
      throw error
    }
  }

  /**
   * Sign multiple transactions (supports both legacy and versioned transactions)
   * @param {Array<Buffer>} serializedTransactions - Array of serialized transaction buffers
   * @returns {Array<Buffer>} - Array of signed serialized transactions
   */
  async signAllTransactions(serializedTransactions) {
    if (!this.keypair) {
      throw new Error('Wallet not initialized')
    }

    try {
      const signedTransactions = []

      for (const serializedTx of serializedTransactions) {
        const txBuffer = Buffer.from(serializedTx)

        // Detect versioned transaction by checking the message version byte
        const numSignatures = txBuffer[0]
        const messageOffset = 1 + (numSignatures * 64)
        const messageVersionByte = txBuffer[messageOffset]
        const isVersioned = messageVersionByte !== undefined && (messageVersionByte & 0x80) !== 0

        if (isVersioned) {
          const versionedTx = VersionedTransaction.deserialize(txBuffer)
          versionedTx.sign([this.keypair])
          signedTransactions.push(Array.from(versionedTx.serialize()))
        } else {
          const transaction = Transaction.from(txBuffer)
          transaction.sign(this.keypair)
          signedTransactions.push(Array.from(transaction.serialize()))
        }
      }

      return signedTransactions
    } catch (error) {
      console.error('[WalletManager] Error signing transactions:', error)
      throw error
    }
  }

  /**
   * Sign a message
   * @param {Uint8Array} message - Message to sign
   * @returns {Uint8Array} - Signature
   */
  async signMessage(message) {
    if (!this.keypair) {
      throw new Error('Wallet not initialized')
    }

    try {
      const nacl = require('tweetnacl')
      const messageBytes = Buffer.from(message)
      const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey)
      return Array.from(signature)
    } catch (error) {
      console.error('[WalletManager] Error signing message:', error)
      throw error
    }
  }

  /**
   * Decode a transaction for display in confirmation UI
   * Supports both legacy and versioned transactions
   * @param {Buffer} serializedTransaction - Serialized transaction buffer
   * @returns {Object} - Decoded transaction details
   */
  decodeTransaction(serializedTransaction) {
    try {
      const txBuffer = Buffer.from(serializedTransaction)

      // Detect versioned transaction by checking the message version byte
      // The structure is: [num_signatures (1 byte)][signatures (64 bytes each)][message...]
      // For versioned transactions, the message starts with a version byte with high bit set (0x80 for v0)
      const numSignatures = txBuffer[0]
      const messageOffset = 1 + (numSignatures * 64)
      const messageVersionByte = txBuffer[messageOffset]
      const isVersioned = messageVersionByte !== undefined && (messageVersionByte & 0x80) !== 0

      let details

      if (isVersioned) {
        // Handle VersionedTransaction
        const versionedTx = VersionedTransaction.deserialize(txBuffer)
        const message = versionedTx.message

        details = {
          isVersioned: true,
          version: message.version,
          recentBlockhash: message.recentBlockhash,
          feePayer: message.staticAccountKeys[0]?.toBase58() || null,
          instructions: [],
          signatures: versionedTx.signatures.map((sig, idx) => ({
            publicKey: message.staticAccountKeys[idx]?.toBase58() || 'unknown',
            signature: sig ? bs58.encode(sig) : null
          }))
        }

        // Decode compiled instructions for versioned transaction
        for (const instruction of message.compiledInstructions) {
          const programId = message.staticAccountKeys[instruction.programIdIndex]?.toBase58() || 'unknown'

          const decodedInstruction = {
            programId,
            programIdIndex: instruction.programIdIndex,
            accountKeyIndexes: instruction.accountKeyIndexes,
            data: bs58.encode(instruction.data),
            programName: this._getProgramName(programId)
          }

          details.instructions.push(decodedInstruction)
        }
      } else {
        // Handle legacy Transaction
        const transaction = Transaction.from(txBuffer)

        details = {
          isVersioned: false,
          recentBlockhash: transaction.recentBlockhash,
          feePayer: transaction.feePayer?.toBase58() || null,
          instructions: [],
          signatures: transaction.signatures.map(sig => ({
            publicKey: sig.publicKey.toBase58(),
            signature: sig.signature ? bs58.encode(sig.signature) : null
          }))
        }

      // Decode each instruction
      for (const instruction of transaction.instructions) {
        const decodedInstruction = {
          programId: instruction.programId.toBase58(),
          keys: instruction.keys.map(key => ({
            pubkey: key.pubkey.toBase58(),
            isSigner: key.isSigner,
            isWritable: key.isWritable
          })),
          data: bs58.encode(instruction.data)
        }

        // Try to identify common program types
        const programId = instruction.programId.toBase58()

        // System Program
        if (programId === '11111111111111111111111111111111') {
          decodedInstruction.programName = 'System Program'

          // Try to decode transfer instruction
          if (instruction.data.length >= 12) {
            const instructionType = instruction.data.readUInt32LE(0)
            if (instructionType === 2) { // Transfer
              const lamports = instruction.data.readBigUInt64LE(4)
              decodedInstruction.type = 'Transfer'
              decodedInstruction.amount = Number(lamports)
              decodedInstruction.amountSOL = Number(lamports) / LAMPORTS_PER_SOL
              decodedInstruction.from = instruction.keys[0]?.pubkey.toBase58()
              decodedInstruction.to = instruction.keys[1]?.pubkey.toBase58()
            }
          }
        }
        // Token Program
        else if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
          decodedInstruction.programName = 'Token Program'
        }
        // Associated Token Account Program
        else if (programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') {
          decodedInstruction.programName = 'Associated Token Account Program'
        }
        else {
          decodedInstruction.programName = 'Unknown Program'
        }

        details.instructions.push(decodedInstruction)
      }
      }

      // Calculate warnings (applies to both versioned and legacy transactions)
      details.warnings = []

      // Check for full balance transfer
      for (const inst of details.instructions) {
        if (inst.type === 'Transfer' && inst.from === this.getPublicKey()) {
          details.warnings.push({
            type: 'transfer',
            message: `Transferring ${inst.amountSOL} SOL to ${inst.to}`
          })
        }
      }

      // Check for unknown programs
      const unknownPrograms = details.instructions.filter(i => i.programName === 'Unknown Program')
      if (unknownPrograms.length > 0) {
        details.warnings.push({
          type: 'unknown_program',
          message: `Transaction interacts with ${unknownPrograms.length} unknown program(s)`
        })
      }

      // Check for multiple instructions
      if (details.instructions.length > 1) {
        details.warnings.push({
          type: 'multiple_instructions',
          message: `Transaction contains ${details.instructions.length} instructions`
        })
      }

      return details
    } catch (error) {
      console.error('[WalletManager] Error decoding transaction:', error)
      throw error
    }
  }

  /**
   * Get human-readable program name from program ID
   * @param {string} programId - Program ID in base58
   * @returns {string} - Program name
   */
  _getProgramName(programId) {
    const knownPrograms = {
      '11111111111111111111111111111111': 'System Program',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Account Program',
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter Aggregator v6',
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter Aggregator v4',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca Swap v2',
      'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
      'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo Program v1'
    }
    return knownPrograms[programId] || 'Unknown Program'
  }

  /**
   * Send a signed transaction
   * @param {Buffer} signedTransaction - Signed serialized transaction
   * @returns {string} - Transaction signature
   */
  async sendTransaction(signedTransaction) {
    if (!this.connection) {
      throw new Error('Connection not initialized')
    }

    try {
      const signature = await this.connection.sendRawTransaction(
        Buffer.from(signedTransaction),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      )

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed')

      return signature
    } catch (error) {
      console.error('[WalletManager] Error sending transaction:', error)
      throw error
    }
  }

  /**
   * Switch network
   * @param {string} network - 'mainnet-beta' or 'devnet'
   */
  switchNetwork(network) {
    if (network !== 'mainnet-beta' && network !== 'devnet') {
      throw new Error('Invalid network. Use "mainnet-beta" or "devnet"')
    }

    // Stop existing subscription before switching
    this._stopBalanceSubscription()

    this.network = network
    const rpcUrl = network === 'mainnet-beta' ? MAINNET_RPC : DEVNET_RPC
    this.connection = new Connection(rpcUrl, 'confirmed')

    // Restart subscription if we had callbacks
    if (this.balanceCallbacks.size > 0) {
      this._startBalanceSubscription()
    }

    // Reset last known balance
    this.lastKnownBalance = null

    // console.log('[WalletManager] Switched to network:', network)

    return { network: this.network }
  }

  /**
   * Store a pending transaction for user approval
   */
  storePendingTransaction(requestId, transaction, resolve, reject) {
    this.pendingTransactions.set(requestId, { transaction, resolve, reject })
  }

  /**
   * Get a pending transaction
   */
  getPendingTransaction(requestId) {
    return this.pendingTransactions.get(requestId)
  }

  /**
   * Remove a pending transaction
   */
  removePendingTransaction(requestId) {
    this.pendingTransactions.delete(requestId)
  }

  /**
   * Get all SPL token accounts and balances for this wallet
   * @returns {Array} - Array of token objects with mint, balance, decimals, etc.
   */
  async getTokenAccounts() {
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized')
    }

    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.keypair.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      )

      const tokens = []

      for (const { account, pubkey } of tokenAccounts.value) {
        const parsedInfo = account.data.parsed.info
        const mint = parsedInfo.mint
        const balance = parsedInfo.tokenAmount.uiAmount
        const decimals = parsedInfo.tokenAmount.decimals
        const rawBalance = parsedInfo.tokenAmount.amount

        // Only include tokens with balance > 0
        if (balance > 0) {
          // Try to get token metadata
          const metadata = await this._getTokenMetadata(mint)

          tokens.push({
            mint,
            tokenAccount: pubkey.toBase58(),
            balance,
            rawBalance,
            decimals,
            symbol: metadata?.symbol || mint.substring(0, 4) + '...',
            name: metadata?.name || 'Unknown Token',
            logo: metadata?.logo || null,
            usdValue: metadata?.price ? balance * metadata.price : null
          })
        }
      }

      return tokens
    } catch (error) {
      console.error('[WalletManager] Error getting token accounts:', error)
      throw error
    }
  }

  /**
   * Get token metadata from Jupiter API
   * @param {string} mint - Token mint address
   * @returns {Object} - Token metadata
   */
  async _getTokenMetadata(mint) {
    // Check cache first
    if (TOKEN_METADATA_CACHE.has(mint)) {
      return TOKEN_METADATA_CACHE.get(mint)
    }

    try {
      // Use Jupiter's token list API for metadata
      const response = await fetch(`https://token.jup.ag/strict`)
      const tokens = await response.json()

      // Cache all tokens for future lookups
      for (const token of tokens) {
        TOKEN_METADATA_CACHE.set(token.address, {
          symbol: token.symbol,
          name: token.name,
          logo: token.logoURI,
          decimals: token.decimals
        })
      }

      return TOKEN_METADATA_CACHE.get(mint) || null
    } catch (error) {
      console.error('[WalletManager] Error fetching token metadata:', error)
      return null
    }
  }

  /**
   * Send SOL to a recipient
   * @param {string} recipientAddress - Recipient's public key
   * @param {number} amountSOL - Amount in SOL
   * @returns {string} - Transaction signature
   */
  async sendSOL(recipientAddress, amountSOL) {
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized')
    }

    try {
      const recipientPubkey = new PublicKey(recipientAddress)
      const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL)

      // Create transfer instruction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.keypair.publicKey,
          toPubkey: recipientPubkey,
          lamports
        })
      )

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed')
      transaction.recentBlockhash = blockhash
      transaction.feePayer = this.keypair.publicKey

      // Sign transaction
      transaction.sign(this.keypair)

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      )

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('[WalletManager] SOL sent successfully:', signature)
      return signature
    } catch (error) {
      console.error('[WalletManager] Error sending SOL:', error)
      throw error
    }
  }

  /**
   * Send SPL token to a recipient
   * @param {string} mintAddress - Token mint address
   * @param {string} recipientAddress - Recipient's public key
   * @param {number} amount - Amount in token units (not raw)
   * @param {number} decimals - Token decimals
   * @returns {string} - Transaction signature
   */
  async sendToken(mintAddress, recipientAddress, amount, decimals) {
    if (!this.keypair || !this.connection) {
      throw new Error('Wallet not initialized')
    }

    try {
      const mintPubkey = new PublicKey(mintAddress)
      const recipientPubkey = new PublicKey(recipientAddress)
      const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)))

      // Get source token account (sender's ATA)
      const sourceATA = await getAssociatedTokenAddress(
        mintPubkey,
        this.keypair.publicKey
      )

      // Get destination token account (recipient's ATA)
      const destinationATA = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey
      )

      // Check if destination ATA exists
      let destinationAccountExists = false
      try {
        await getAccount(this.connection, destinationATA)
        destinationAccountExists = true
      } catch (e) {
        destinationAccountExists = false
      }

      const transaction = new Transaction()

      // If destination ATA doesn't exist, create it
      if (!destinationAccountExists) {
        const { createAssociatedTokenAccountInstruction } = require('@solana/spl-token')
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.keypair.publicKey, // payer
            destinationATA, // associated token account
            recipientPubkey, // owner
            mintPubkey // mint
          )
        )
      }

      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          sourceATA, // source
          destinationATA, // destination
          this.keypair.publicKey, // owner
          rawAmount // amount
        )
      )

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed')
      transaction.recentBlockhash = blockhash
      transaction.feePayer = this.keypair.publicKey

      // Sign transaction
      transaction.sign(this.keypair)

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      )

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed')

      console.log('[WalletManager] Token sent successfully:', signature)
      return signature
    } catch (error) {
      console.error('[WalletManager] Error sending token:', error)
      throw error
    }
  }

  /**
   * Estimate transaction fee for SOL transfer
   * @returns {number} - Estimated fee in SOL
   */
  async estimateFee() {
    if (!this.connection) {
      throw new Error('Connection not initialized')
    }

    try {
      // Get recent blockhash and fee calculator
      const { feeCalculator } = await this.connection.getRecentBlockhash('confirmed')
      // A simple transfer is about 1 signature, so fee is lamportsPerSignature
      const feeInLamports = feeCalculator?.lamportsPerSignature || 5000 // Default 5000 lamports
      return feeInLamports / LAMPORTS_PER_SOL
    } catch (error) {
      // Return a default fee estimate
      return 0.000005 // 5000 lamports default
    }
  }

  /**
   * Validate a Solana address
   * @param {string} address - Address to validate
   * @returns {boolean} - Whether the address is valid
   */
  isValidAddress(address) {
    try {
      new PublicKey(address)
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * Destroy the wallet - called on browser close
   */
  destroy() {
    // Stop balance subscription
    this._stopBalanceSubscription()
    this.balanceCallbacks.clear()

    // Clear sensitive data
    if (this.keypair) {
      // Zero out the secret key
      this.keypair.secretKey.fill(0)
      this.keypair = null
    }
    this.connection = null
    this.pendingTransactions.clear()
    this.lastKnownBalance = null

    // console.log('[WalletManager] Wallet destroyed')
  }
}

// Singleton instance
const walletManager = new WalletManager()

// walletManager is available globally in the concatenated bundle
