// Solana Provider Injection for CipherNet Browser
// This script injects a Phantom-compatible Solana wallet provider AND
// Solana Wallet Standard compliant wallet into web pages
// Uses script injection to work with contextIsolation: true

var electron = require('electron')
var ipc = electron.ipcRenderer
var webFrame = electron.webFrame

;(function() {
  'use strict'

  // Only inject on http/https pages
  if (!window.location.protocol.startsWith('http')) {
    return
  }

  // console.log('[CipherNet Wallet] Initializing Solana provider...')

  // Generate unique channel ID for this page instance
  const channelId = 'ciphernet_wallet_' + Math.random().toString(36).substr(2, 9)

  // Listen for messages from the injected script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.channel !== channelId) return

    const { type, requestId, method, params } = event.data

    if (type !== 'CIPHERNET_WALLET_REQUEST') return

    try {
      let result

      switch (method) {
        case 'connect': {
          const connectResult = await ipc.invoke('wallet:requestConnect', {
            origin: window.location.origin,
            tabId: null
          })

          if (!connectResult.success) {
            throw new Error(connectResult.error || 'Connection failed')
          }

          // Wait for user approval
          result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Connection request timed out'))
            }, 300000)

            ipc.once('wallet:connectApproved', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === connectResult.data.requestId) {
                resolve({ publicKey: data.publicKey })
              }
            })

            ipc.once('wallet:connectRejected', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === connectResult.data.requestId) {
                reject(new Error('User rejected the connection request'))
              }
            })
          })
          break
        }

        case 'signTransaction': {
          const signResult = await ipc.invoke('wallet:requestSignTransaction', {
            transaction: params.transaction,
            origin: window.location.origin,
            tabId: null
          })

          if (!signResult.success) {
            throw new Error(signResult.error || 'Signing failed')
          }

          result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Transaction signing request timed out'))
            }, 300000)

            ipc.once('wallet:transactionApproved', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === signResult.data.requestId) {
                resolve({ signedTransaction: data.signedTransaction })
              }
            })

            ipc.once('wallet:transactionRejected', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === signResult.data.requestId) {
                reject(new Error('User rejected the transaction'))
              }
            })
          })
          break
        }

        case 'signAllTransactions': {
          const signAllResult = await ipc.invoke('wallet:requestSignAllTransactions', {
            transactions: params.transactions,
            origin: window.location.origin,
            tabId: null
          })

          if (!signAllResult.success) {
            throw new Error(signAllResult.error || 'Signing failed')
          }

          result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Transaction signing request timed out'))
            }, 300000)

            ipc.once('wallet:allTransactionsApproved', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === signAllResult.data.requestId) {
                resolve({ signedTransactions: data.signedTransactions })
              }
            })

            ipc.once('wallet:allTransactionsRejected', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === signAllResult.data.requestId) {
                reject(new Error('User rejected the transactions'))
              }
            })
          })
          break
        }

        case 'signMessage': {
          const msgResult = await ipc.invoke('wallet:requestSignMessage', {
            message: params.message,
            origin: window.location.origin,
            tabId: null
          })

          if (!msgResult.success) {
            throw new Error(msgResult.error || 'Signing failed')
          }

          result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Message signing request timed out'))
            }, 300000)

            ipc.once('wallet:messageApproved', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === msgResult.data.requestId) {
                resolve({ signature: data.signature })
              }
            })

            ipc.once('wallet:messageRejected', (event, data) => {
              clearTimeout(timeout)
              if (data.requestId === msgResult.data.requestId) {
                reject(new Error('User rejected the message signing'))
              }
            })
          })
          break
        }

        case 'sendTransaction': {
          const sendResult = await ipc.invoke('wallet:sendTransaction', {
            signedTransaction: params.signedTransaction
          })

          if (!sendResult.success) {
            throw new Error(sendResult.error || 'Failed to send transaction')
          }

          result = { signature: sendResult.data.signature }
          break
        }

        default:
          throw new Error(`Unknown method: ${method}`)
      }

      // Send success response back to page
      window.postMessage({
        channel: channelId,
        type: 'CIPHERNET_WALLET_RESPONSE',
        requestId,
        success: true,
        result
      }, '*')

    } catch (error) {
      // Send error response back to page
      window.postMessage({
        channel: channelId,
        type: 'CIPHERNET_WALLET_RESPONSE',
        requestId,
        success: false,
        error: error.message
      }, '*')
    }
  })

  // CipherNet wallet icon (base64 encoded PNG)
  const WALLET_ICON = 'data:image/png;base64,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';

  // Inject the provider script into the page context
  const providerScript = `
    (function() {
      'use strict';

      const CHANNEL_ID = '${channelId}';
      const WALLET_ICON = '${WALLET_ICON}';
      let requestCounter = 0;
      const pendingRequests = new Map();

      // Listen for responses from preload
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.channel !== CHANNEL_ID) return;
        if (event.data.type !== 'CIPHERNET_WALLET_RESPONSE') return;

        const { requestId, success, result, error } = event.data;
        const pending = pendingRequests.get(requestId);

        if (pending) {
          pendingRequests.delete(requestId);
          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error));
          }
        }
      });

      // Send request to preload and wait for response
      function sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
          const requestId = 'req_' + (++requestCounter) + '_' + Date.now();
          pendingRequests.set(requestId, { resolve, reject });

          window.postMessage({
            channel: CHANNEL_ID,
            type: 'CIPHERNET_WALLET_REQUEST',
            requestId,
            method,
            params
          }, '*');

          // Timeout after 5 minutes
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              reject(new Error('Request timed out'));
            }
          }, 300000);
        });
      }

      // ============================================
      // BASE58 ENCODING/DECODING
      // ============================================
      const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

      function encodeBase58(bytes) {
        if (bytes.length === 0) return '';
        let zeros = 0;
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;
        let num = BigInt(0);
        for (const byte of bytes) num = num * 256n + BigInt(byte);
        let result = '';
        while (num > 0n) {
          result = BASE58_ALPHABET[Number(num % 58n)] + result;
          num = num / 58n;
        }
        return '1'.repeat(zeros) + result;
      }

      function decodeBase58(str) {
        if (str.length === 0) return new Uint8Array(0);
        let zeros = 0;
        for (let i = 0; i < str.length && str[i] === '1'; i++) zeros++;
        let num = BigInt(0);
        for (const char of str) {
          const index = BASE58_ALPHABET.indexOf(char);
          if (index === -1) throw new Error('Invalid base58 character: ' + char);
          num = num * 58n + BigInt(index);
        }
        const bytes = [];
        while (num > 0n) {
          bytes.unshift(Number(num % 256n));
          num = num / 256n;
        }
        const result = new Uint8Array(zeros + bytes.length);
        result.set(bytes, zeros);
        return result;
      }

      // ============================================
      // PUBLICKEY CLASS - Phantom/Solana compatible
      // ============================================
      class PublicKey {
        constructor(value) {
          if (typeof value === 'string') {
            this._bn = null;
            this._key = value;
            this._bytes = decodeBase58(value);
            if (this._bytes.length !== 32) {
              throw new Error('Invalid public key length');
            }
          } else if (value instanceof Uint8Array || Array.isArray(value)) {
            const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            if (bytes.length !== 32) {
              throw new Error('Invalid public key length');
            }
            this._bytes = bytes;
            this._key = encodeBase58(bytes);
          } else if (value && typeof value === 'object') {
            if (value._key) {
              this._key = value._key;
              this._bytes = decodeBase58(value._key);
            } else if (value.toBase58) {
              this._key = value.toBase58();
              this._bytes = decodeBase58(this._key);
            } else {
              throw new Error('Invalid public key input');
            }
          } else {
            throw new Error('Invalid public key input');
          }
        }

        toString() { return this._key; }
        toBase58() { return this._key; }
        toJSON() { return this._key; }
        toBytes() { return new Uint8Array(this._bytes); }
        toBuffer() { return this._bytes; }

        equals(other) {
          if (!other) return false;
          const otherKey = other._key || other.toBase58?.() || other.toString?.();
          return this._key === otherKey;
        }

        static isOnCurve(pubkey) {
          try { new PublicKey(pubkey); return true; } catch { return false; }
        }
      }

      // ============================================
      // EVENT EMITTER
      // ============================================
      const eventListeners = new Map();

      function emit(event, ...args) {
        const listeners = eventListeners.get(event) || [];
        listeners.forEach(listener => {
          try { listener(...args); } catch (e) { console.error('[CipherNet Wallet] Event error:', e); }
        });
      }

      // ============================================
      // WALLET STATE
      // ============================================
      let isConnected = false;
      let publicKey = null;
      let currentAccount = null;

      // ============================================
      // PHANTOM-COMPATIBLE PROVIDER (window.solana)
      // ============================================
      const ciphernetSolana = {
        // isPhantom: true,
        isCipherNet: true,
        isConnected: false,
        publicKey: null,

        on(event, callback) {
          if (!eventListeners.has(event)) eventListeners.set(event, []);
          eventListeners.get(event).push(callback);
        },

        off(event, callback) {
          const listeners = eventListeners.get(event) || [];
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
        },

        once(event, callback) {
          const onceCallback = (...args) => {
            this.off(event, onceCallback);
            callback(...args);
          };
          this.on(event, onceCallback);
        },

        removeListener(event, callback) { this.off(event, callback); },
        removeAllListeners(event) {
          if (event) eventListeners.delete(event);
          else eventListeners.clear();
        },

        async connect(options = {}) {
          // console.log('[CipherNet Wallet] Connect requested');
          const result = await sendRequest('connect', options);

          publicKey = new PublicKey(result.publicKey);
          isConnected = true;
          this.isConnected = true;
          this.publicKey = publicKey;

          // Create account for Wallet Standard
          currentAccount = {
            address: publicKey.toBase58(),
            publicKey: publicKey.toBytes(),
            chains: ['solana:mainnet', 'solana:devnet'],
            features: ['solana:signTransaction', 'solana:signMessage', 'solana:signAndSendTransaction']
          };

          emit('connect', { publicKey });
          // Emit for Wallet Standard
          emit('change', { accounts: [currentAccount] });

          return { publicKey };
        },

        async disconnect() {
          // console.log('[CipherNet Wallet] Disconnect requested');
          publicKey = null;
          isConnected = false;
          currentAccount = null;
          this.isConnected = false;
          this.publicKey = null;

          emit('disconnect');
          emit('change', { accounts: [] });
        },

        async signTransaction(transaction) {
          // console.log('[CipherNet Wallet] Sign transaction requested');
          if (!isConnected) throw new Error('Wallet not connected');

          const serialized = Array.from(transaction.serialize({ requireAllSignatures: false }));
          const result = await sendRequest('signTransaction', { transaction: serialized });
          const signedBytes = new Uint8Array(result.signedTransaction);

          const signedTx = Object.create(Object.getPrototypeOf(transaction));
          Object.assign(signedTx, transaction);
          signedTx.serialize = function(config) { return signedBytes; };
          if (!signedTx.signatures) signedTx.signatures = [];

          return signedTx;
        },

        async signAllTransactions(transactions) {
          // console.log('[CipherNet Wallet] Sign all transactions requested');
          if (!isConnected) throw new Error('Wallet not connected');

          const serialized = transactions.map(tx => Array.from(tx.serialize({ requireAllSignatures: false })));
          const result = await sendRequest('signAllTransactions', { transactions: serialized });

          return transactions.map((tx, i) => {
            const signedBytes = new Uint8Array(result.signedTransactions[i]);
            const signedTx = Object.create(Object.getPrototypeOf(tx));
            Object.assign(signedTx, tx);
            signedTx.serialize = function(config) { return signedBytes; };
            if (!signedTx.signatures) signedTx.signatures = [];
            return signedTx;
          });
        },

        async signAndSendTransaction(transaction, options = {}) {
          // console.log('[CipherNet Wallet] Sign and send transaction requested');
          const signedTx = await this.signTransaction(transaction);
          const result = await sendRequest('sendTransaction', { signedTransaction: Array.from(signedTx.serialize()) });
          return { signature: result.signature };
        },

        async signMessage(message, display) {
          // console.log('[CipherNet Wallet] Sign message requested');
          if (!isConnected) throw new Error('Wallet not connected');

          const messageBytes = message instanceof Uint8Array ? Array.from(message) : Array.from(new TextEncoder().encode(message));
          const result = await sendRequest('signMessage', { message: messageBytes });

          return {
            signature: new Uint8Array(result.signature),
            publicKey: publicKey
          };
        },

        async request(args) {
          const { method, params } = args;
          switch (method) {
            case 'connect': return this.connect(params);
            case 'disconnect': return this.disconnect();
            case 'signTransaction': return this.signTransaction(params.transaction);
            case 'signAllTransactions': return this.signAllTransactions(params.transactions);
            case 'signMessage': return this.signMessage(params.message, params.display);
            case 'signAndSendTransaction': return this.signAndSendTransaction(params.transaction, params.options);
            default: throw new Error('Method ' + method + ' not supported');
          }
        }
      };

      // ============================================
      // WALLET STANDARD IMPLEMENTATION
      // ============================================

      // Wallet Standard version
      const WALLET_STANDARD_VERSION = '1.0.0';

      // Standard features identifiers
      const StandardConnect = 'standard:connect';
      const StandardDisconnect = 'standard:disconnect';
      const StandardEvents = 'standard:events';
      const SolanaSignTransaction = 'solana:signTransaction';
      const SolanaSignAllTransactions = 'solana:signAllTransactions';
      const SolanaSignMessage = 'solana:signMessage';
      const SolanaSignAndSendTransaction = 'solana:signAndSendTransaction';

      // Wallet Standard Account
      class CipherNetWalletAccount {
        constructor(publicKey) {
          this._publicKey = publicKey;
        }

        get address() {
          return this._publicKey.toBase58();
        }

        get publicKey() {
          return this._publicKey.toBytes();
        }

        get chains() {
          return ['solana:mainnet', 'solana:devnet', 'solana:testnet'];
        }

        get features() {
          return [
            StandardConnect,
            StandardDisconnect,
            StandardEvents,
            SolanaSignTransaction,
            SolanaSignAllTransactions,
            SolanaSignMessage,
            SolanaSignAndSendTransaction
          ];
        }
      }

      // Event emitter for Wallet Standard
      const walletStandardListeners = new Map();

      function emitWalletStandardEvent(event, ...args) {
        const listeners = walletStandardListeners.get(event) || [];
        listeners.forEach(listener => {
          try { listener(...args); } catch (e) { console.error('[CipherNet Wallet Standard] Event error:', e); }
        });
      }

      // Wallet Standard Wallet object
      const ciphernetWalletStandard = {
        // Required properties
        get version() { return WALLET_STANDARD_VERSION; },
        get name() { return 'CipherNet Wallet'; },
        get icon() { return WALLET_ICON; },

        get chains() {
          return ['solana:mainnet', 'solana:devnet', 'solana:testnet'];
        },

        get features() {
          return {
            [StandardConnect]: {
              version: '1.0.0',
              connect: async () => {
                // console.log('[CipherNet Wallet Standard] connect called');
                const result = await ciphernetSolana.connect();
                const account = new CipherNetWalletAccount(result.publicKey);
                return { accounts: [account] };
              }
            },
            [StandardDisconnect]: {
              version: '1.0.0',
              disconnect: async () => {
                // console.log('[CipherNet Wallet Standard] disconnect called');
                await ciphernetSolana.disconnect();
              }
            },
            [StandardEvents]: {
              version: '1.0.0',
              on: (event, listener) => {
                if (!walletStandardListeners.has(event)) {
                  walletStandardListeners.set(event, []);
                }
                walletStandardListeners.get(event).push(listener);
                return () => {
                  const listeners = walletStandardListeners.get(event) || [];
                  const index = listeners.indexOf(listener);
                  if (index > -1) listeners.splice(index, 1);
                };
              }
            },
            [SolanaSignTransaction]: {
              version: '1.0.0',
              supportedTransactionVersions: ['legacy', 0],
              signTransaction: async (...inputs) => {
                // console.log('[CipherNet Wallet Standard] signTransaction called', inputs);
                // Wallet Standard passes { transaction, account, chain } or just transaction
                // Handle both formats
                const input = inputs[0];
                const transaction = input.transaction || input;

                // Get serialized bytes from the transaction
                let serializedBytes;
                if (typeof transaction.serialize === 'function') {
                  serializedBytes = transaction.serialize({ requireAllSignatures: false });
                } else if (transaction instanceof Uint8Array) {
                  serializedBytes = transaction;
                } else {
                  throw new Error('Invalid transaction format');
                }

                const serialized = Array.from(serializedBytes);
                const result = await sendRequest('signTransaction', { transaction: serialized });
                const signedBytes = new Uint8Array(result.signedTransaction);

                // Return the signed transaction in the expected Wallet Standard format
                // { signedTransaction: Uint8Array }
                return [{ signedTransaction: signedBytes }];
              }
            },
            [SolanaSignAllTransactions]: {
              version: '1.0.0',
              supportedTransactionVersions: ['legacy', 0],
              signAllTransactions: async (...inputs) => {
                // console.log('[CipherNet Wallet Standard] signAllTransactions called', inputs);
                // Handle Wallet Standard format: array of { transaction, account, chain }
                const inputArray = inputs[0];
                const transactions = Array.isArray(inputArray)
                  ? inputArray.map(input => input.transaction || input)
                  : [inputArray.transaction || inputArray];

                const serialized = transactions.map(tx => {
                  if (typeof tx.serialize === 'function') {
                    return Array.from(tx.serialize({ requireAllSignatures: false }));
                  } else if (tx instanceof Uint8Array) {
                    return Array.from(tx);
                  }
                  throw new Error('Invalid transaction format');
                });

                const result = await sendRequest('signAllTransactions', { transactions: serialized });

                // Return signed transactions in Wallet Standard format
                return result.signedTransactions.map(tx => ({
                  signedTransaction: new Uint8Array(tx)
                }));
              }
            },
            [SolanaSignMessage]: {
              version: '1.0.0',
              signMessage: async (...inputs) => {
                // console.log('[CipherNet Wallet Standard] signMessage called', inputs);
                // Handle Wallet Standard format: { message, account }
                const input = inputs[0];
                const message = input.message || input;

                const result = await ciphernetSolana.signMessage(message);
                // Return in Wallet Standard format: array of { signature, signedMessage }
                return [{
                  signature: result.signature,
                  signedMessage: message instanceof Uint8Array ? message : new TextEncoder().encode(message)
                }];
              }
            },
            [SolanaSignAndSendTransaction]: {
              version: '1.0.0',
              supportedTransactionVersions: ['legacy', 0],
              signAndSendTransaction: async (...inputs) => {
                // console.log('[CipherNet Wallet Standard] signAndSendTransaction called', inputs);
                // Handle Wallet Standard format
                const input = inputs[0];
                const transaction = input.transaction || input;
                const options = input.options || {};

                const result = await ciphernetSolana.signAndSendTransaction(transaction, options);
                // Return in Wallet Standard format: array of { signature: Uint8Array }
                return [{ signature: decodeBase58(result.signature) }];
              }
            }
          };
        },

        get accounts() {
          if (currentAccount) {
            return [new CipherNetWalletAccount(publicKey)];
          }
          return [];
        }
      };

      // ============================================
      // REGISTER WITH WALLET STANDARD
      // ============================================

      // The Wallet Standard uses a registration callback pattern
      function registerWalletStandard() {
        // Method 1: navigator.wallets.register (newer standard)
        if (typeof navigator !== 'undefined') {
          // Initialize the wallets array if needed
          const registerWallet = (wallet) => {
            // Wallet Standard registration via CustomEvent
            const event = new CustomEvent('wallet-standard:register-wallet', {
              detail: {
                register: (callback) => callback(wallet)
              }
            });
            window.dispatchEvent(event);
          };

          // Listen for the app requesting wallets
          const onAppReady = (event) => {
            const { register } = event.detail || {};
            if (typeof register === 'function') {
              register(ciphernetWalletStandard);
              // console.log('[CipherNet Wallet] Registered with Wallet Standard via event');
            }
          };

          window.addEventListener('wallet-standard:app-ready', onAppReady);

          // Also dispatch our own registration
          registerWallet(ciphernetWalletStandard);

          // Method 2: Fallback - expose on window for wallet adapters that look there
          if (!window._wallets) {
            window._wallets = [];
          }
          window._wallets.push(ciphernetWalletStandard);

          // Method 3: Register via the standard get/register pattern
          const walletsWindow = window;

          // Initialize the wallets registry
          const wallets = walletsWindow.navigator?.wallets;
          if (wallets) {
            if (typeof wallets.register === 'function') {
              wallets.register(ciphernetWalletStandard);
              // console.log('[CipherNet Wallet] Registered via navigator.wallets.register');
            }
          }

          // Method 4: Implement the wallet-standard WindowRegisterWallet interface
          const { get, register } = (function() {
            const registered = new Set();
            const listeners = new Set();

            return {
              get: () => [...registered],
              register: (...wallets) => {
                for (const wallet of wallets) {
                  registered.add(wallet);
                  listeners.forEach(listener => {
                    try { listener(wallet); } catch {}
                  });
                }
                return () => {
                  for (const wallet of wallets) {
                    registered.delete(wallet);
                  }
                };
              },
              on: (event, listener) => {
                if (event === 'register') {
                  listeners.add(listener);
                  return () => listeners.delete(listener);
                }
                return () => {};
              }
            };
          })();

          // Expose global wallet registry if not exists
          if (!walletsWindow.__walletStandard) {
            walletsWindow.__walletStandard = { get, register };
          }
          walletsWindow.__walletStandard.register(ciphernetWalletStandard);
        }

        // console.log('[CipherNet Wallet] Wallet Standard registration complete');
      }

      // ============================================
      // INJECT INTO WINDOW
      // ============================================

      // Phantom-compatible provider
      Object.defineProperty(window, 'solana', {
        value: ciphernetSolana,
        writable: false,
        configurable: true  // Allow some adapters to check/configure
      });

      Object.defineProperty(window, 'ciphernet', {
        value: { solana: ciphernetSolana },
        writable: false,
        configurable: false
      });

      // Expose Wallet Standard wallet directly
      Object.defineProperty(window, 'ciphernetWallet', {
        value: ciphernetWalletStandard,
        writable: false,
        configurable: false
      });

      // Register with Wallet Standard
      registerWalletStandard();

      // Dispatch ready events
      window.dispatchEvent(new Event('solana#initialized'));

      // Also dispatch wallet-standard event for apps listening
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        detail: {
          register: (callback) => callback(ciphernetWalletStandard)
        }
      }));

      // console.log('[CipherNet Wallet] Solana provider + Wallet Standard injected successfully');
    })();
  `

  // Execute the script in the page context at document start
  webFrame.executeJavaScript(providerScript)
    .then(() => {
      // console.log('[CipherNet Wallet] Provider script executed in page context')
    })
    .catch((err) => {
      console.error('[CipherNet Wallet] Failed to inject provider:', err)
    })
})()
