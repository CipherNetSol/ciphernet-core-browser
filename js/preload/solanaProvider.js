// Solana Provider Injection for CipherNet Browser
// This script injects a Phantom-compatible Solana wallet provider into web pages
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

  console.log('[CipherNet Wallet] Initializing Solana provider...')

  // Generate unique channel ID for this page instance
  const channelId = 'ciphernet_wallet_' + Math.random().toString(36).substr(2, 9)

  // Track pending requests
  const pendingRequests = new Map()

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

  // Inject the provider script into the page context
  const providerScript = `
    (function() {
      'use strict';

      const CHANNEL_ID = '${channelId}';
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

      // PublicKey class
      class PublicKey {
        constructor(value) {
          if (typeof value === 'string') {
            this._key = value;
          } else if (value instanceof Uint8Array) {
            this._key = this._encodeBase58(value);
          } else if (value && value._key) {
            this._key = value._key;
          } else {
            throw new Error('Invalid public key input');
          }
        }

        _encodeBase58(bytes) {
          const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
          let result = '';
          let num = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
          while (num > 0) {
            result = ALPHABET[Number(num % 58n)] + result;
            num = num / 58n;
          }
          for (const byte of bytes) {
            if (byte === 0) result = '1' + result;
            else break;
          }
          return result || '1';
        }

        toString() { return this._key; }
        toBase58() { return this._key; }
        toJSON() { return this._key; }

        equals(other) {
          return this._key === (other._key || other.toString());
        }
      }

      // Event listeners storage
      const eventListeners = new Map();

      function emit(event, ...args) {
        const listeners = eventListeners.get(event) || [];
        listeners.forEach(listener => {
          try { listener(...args); } catch (e) { console.error('[CipherNet Wallet] Event error:', e); }
        });
      }

      // Wallet state
      let isConnected = false;
      let publicKey = null;

      // CipherNet Solana Provider
      const ciphernetSolana = {
        isPhantom: true,
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
          console.log('[CipherNet Wallet] Connect requested');

          const result = await sendRequest('connect', options);

          publicKey = new PublicKey(result.publicKey);
          isConnected = true;
          this.isConnected = true;
          this.publicKey = publicKey;

          emit('connect', { publicKey });

          return { publicKey };
        },

        async disconnect() {
          console.log('[CipherNet Wallet] Disconnect requested');

          publicKey = null;
          isConnected = false;
          this.isConnected = false;
          this.publicKey = null;

          emit('disconnect');
        },

        async signTransaction(transaction) {
          console.log('[CipherNet Wallet] Sign transaction requested');

          if (!isConnected) throw new Error('Wallet not connected');

          const serialized = Array.from(transaction.serialize({ requireAllSignatures: false }));
          const result = await sendRequest('signTransaction', { transaction: serialized });

          const signedBytes = new Uint8Array(result.signedTransaction);
          return {
            ...transaction,
            _signedBytes: signedBytes,
            serialize: () => signedBytes
          };
        },

        async signAllTransactions(transactions) {
          console.log('[CipherNet Wallet] Sign all transactions requested');

          if (!isConnected) throw new Error('Wallet not connected');

          const serialized = transactions.map(tx => Array.from(tx.serialize({ requireAllSignatures: false })));
          const result = await sendRequest('signAllTransactions', { transactions: serialized });

          return transactions.map((tx, i) => {
            const signedBytes = new Uint8Array(result.signedTransactions[i]);
            return {
              ...tx,
              _signedBytes: signedBytes,
              serialize: () => signedBytes
            };
          });
        },

        async signAndSendTransaction(transaction, options = {}) {
          console.log('[CipherNet Wallet] Sign and send transaction requested');

          const signedTx = await this.signTransaction(transaction);
          const result = await sendRequest('sendTransaction', { signedTransaction: Array.from(signedTx.serialize()) });

          return { signature: result.signature };
        },

        async signMessage(message, display) {
          console.log('[CipherNet Wallet] Sign message requested');

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

      // Inject into window
      Object.defineProperty(window, 'solana', {
        value: ciphernetSolana,
        writable: false,
        configurable: false
      });

      Object.defineProperty(window, 'ciphernet', {
        value: { solana: ciphernetSolana },
        writable: false,
        configurable: false
      });

      // Dispatch ready event
      window.dispatchEvent(new Event('solana#initialized'));

      console.log('[CipherNet Wallet] Solana provider injected successfully');
    })();
  `

  // Execute the script in the page context at document start
  webFrame.executeJavaScript(providerScript)
    .then(() => {
      console.log('[CipherNet Wallet] Provider script executed in page context')
    })
    .catch((err) => {
      console.error('[CipherNet Wallet] Failed to inject provider:', err)
    })
})()
