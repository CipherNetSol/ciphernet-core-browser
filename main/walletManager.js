// Solana Session Wallet Manager - Main Process
// Ephemeral wallet that exists only in memory for the browser session

const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js')
const bs58Module = require('bs58')
// Handle both bs58 v4.x (default export) and v6.x (named export)
const bs58 = bs58Module.default || bs58Module

// RPC endpoints
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com'
const DEVNET_RPC = 'https://api.devnet.solana.com'

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

    console.log('[WalletManager] Session wallet initialized')
    console.log('[WalletManager] Public Key:', this.getPublicKey())
    console.log('[WalletManager] Private Key (Array):', JSON.stringify(this.getSecretKey()))
    console.log('[WalletManager] Private Key (Base58):', this.getSecretKeyBase58())

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
            console.log('[WalletManager] Balance changed:', sol, 'SOL')

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

      console.log('[WalletManager] Balance subscription started, ID:', this.balanceSubscriptionId)
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
        console.log('[WalletManager] Balance subscription stopped')
      } catch (error) {
        console.error('[WalletManager] Error stopping balance subscription:', error)
      }
      this.balanceSubscriptionId = null
    }
  }

  /**
   * Sign a transaction
   * @param {Buffer} serializedTransaction - Serialized transaction buffer
   * @returns {Buffer} - Signed serialized transaction
   */
  async signTransaction(serializedTransaction) {
    if (!this.keypair) {
      throw new Error('Wallet not initialized')
    }

    try {
      // Deserialize the transaction
      const transaction = Transaction.from(Buffer.from(serializedTransaction))

      // Sign with our keypair
      transaction.sign(this.keypair)

      // Return serialized signed transaction
      return Array.from(transaction.serialize())
    } catch (error) {
      console.error('[WalletManager] Error signing transaction:', error)
      throw error
    }
  }

  /**
   * Sign multiple transactions
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
        const transaction = Transaction.from(Buffer.from(serializedTx))
        transaction.sign(this.keypair)
        signedTransactions.push(Array.from(transaction.serialize()))
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
   * @param {Buffer} serializedTransaction - Serialized transaction buffer
   * @returns {Object} - Decoded transaction details
   */
  decodeTransaction(serializedTransaction) {
    try {
      const transaction = Transaction.from(Buffer.from(serializedTransaction))

      const details = {
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

      // Calculate warnings
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

    console.log('[WalletManager] Switched to network:', network)

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

    console.log('[WalletManager] Wallet destroyed')
  }
}

// Singleton instance
const walletManager = new WalletManager()

module.exports = walletManager
