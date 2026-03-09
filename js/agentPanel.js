// js/agentPanel.js
// Agent panel UI - Right side chat panel for CipherNet AI Agent

var agentCore = require('agentCore.js')
var agentTools = require('agentTools.js')
var webviews = require('webviews.js')

var agentPanel = {
  panel: null,
  isOpen: false,
  panelWidth: 420,
  elements: {},
  attachedImage: null, // { path: string, name: string, dataUrl: string }

  initialize: function () {
    agentPanel.panel = document.getElementById('agent-panel')

    if (!agentPanel.panel) {
      console.error('[AgentPanel] Panel element not found!')
      return
    }

    agentPanel.elements = {
      closeBtn: document.getElementById('agent-panel-close'),
      clearBtn: document.getElementById('agent-clear-btn'),
      chatMessages: document.getElementById('agent-chat-messages'),
      chatInput: document.getElementById('agent-chat-input'),
      sendBtn: document.getElementById('agent-send-btn'),
      attachBtn: document.getElementById('agent-attach-btn'),
      fileInput: document.getElementById('agent-file-input'),
      imagePreview: document.getElementById('agent-image-preview'),
      imagePreviewImg: document.getElementById('agent-image-preview-img'),
      imagePreviewName: document.getElementById('agent-image-preview-name'),
      imageRemove: document.getElementById('agent-image-remove'),
      suggestions: document.getElementById('agent-suggestions'),
      confirmationOverlay: document.getElementById('agent-confirmation-overlay'),
      confirmationMessage: document.getElementById('agent-confirmation-message'),
      confirmApproveBtn: document.getElementById('agent-confirm-approve'),
      confirmCancelBtn: document.getElementById('agent-confirm-cancel')
    }

    agentPanel.setupEventListeners()

    // Connect tools confirmation callback
    agentTools.onConfirmationNeeded = agentPanel.showConfirmation
  },

  setupEventListeners: function () {
    // Close button
    if (agentPanel.elements.closeBtn) {
      agentPanel.elements.closeBtn.addEventListener('click', function () {
        agentPanel.close()
      })
    }

    // Clear button
    if (agentPanel.elements.clearBtn) {
      agentPanel.elements.clearBtn.addEventListener('click', function () {
        agentPanel.clearChat()
      })
    }

    // Send button
    if (agentPanel.elements.sendBtn) {
      agentPanel.elements.sendBtn.addEventListener('click', function () {
        agentPanel.sendMessage()
      })
    }

    // Chat input - Enter to send, Shift+Enter for newline
    if (agentPanel.elements.chatInput) {
      agentPanel.elements.chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          agentPanel.sendMessage()
        }
      })
    }

    // Suggestion chips
    if (agentPanel.elements.suggestions) {
      agentPanel.elements.suggestions.addEventListener('click', function (e) {
        var chip = e.target.closest('.agent-suggestion-chip')
        if (chip) {
          agentPanel.elements.chatInput.value = chip.dataset.query
          agentPanel.sendMessage()
        }
      })
    }

    // Settings save/cancel
    if (agentPanel.elements.settingsSaveBtn) {
      agentPanel.elements.settingsSaveBtn.addEventListener('click', function () {
        agentPanel.saveSettings()
      })
    }
    if (agentPanel.elements.settingsCancelBtn) {
      agentPanel.elements.settingsCancelBtn.addEventListener('click', function () {
        agentPanel.hideSettings()
      })
    }

    // Confirmation approve/cancel
    if (agentPanel.elements.confirmApproveBtn) {
      agentPanel.elements.confirmApproveBtn.addEventListener('click', function () {
        agentPanel.hideConfirmation()
        agentTools.handleConfirmation(true)
      })
    }
    if (agentPanel.elements.confirmCancelBtn) {
      agentPanel.elements.confirmCancelBtn.addEventListener('click', function () {
        agentPanel.hideConfirmation()
        agentTools.handleConfirmation(false)
      })
    }

    // Attach image button
    if (agentPanel.elements.attachBtn) {
      agentPanel.elements.attachBtn.addEventListener('click', function () {
        if (agentPanel.elements.fileInput) {
          agentPanel.elements.fileInput.click()
        }
      })
    }

    // File input change
    if (agentPanel.elements.fileInput) {
      agentPanel.elements.fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0]
        if (!file) return

        agentPanel.attachedImage = {
          path: file.path || file.name,
          name: file.name,
          size: file.size,
          type: file.type
        }

        // Show preview and store dataUrl
        var reader = new FileReader()
        reader.onload = function (ev) {
          agentPanel.attachedImage.dataUrl = ev.target.result
          if (agentPanel.elements.imagePreviewImg) {
            agentPanel.elements.imagePreviewImg.src = ev.target.result
          }
          if (agentPanel.elements.imagePreviewName) {
            agentPanel.elements.imagePreviewName.textContent = file.name
          }
          if (agentPanel.elements.imagePreview) {
            agentPanel.elements.imagePreview.style.display = 'flex'
          }
        }
        reader.readAsDataURL(file)

        // Reset file input so same file can be re-selected
        e.target.value = ''
      })
    }

    // Remove attached image
    if (agentPanel.elements.imageRemove) {
      agentPanel.elements.imageRemove.addEventListener('click', function () {
        agentPanel.removeAttachedImage()
      })
    }
  },

  removeAttachedImage: function () {
    agentPanel.attachedImage = null
    if (agentPanel.elements.imagePreview) {
      agentPanel.elements.imagePreview.style.display = 'none'
    }
    if (agentPanel.elements.imagePreviewImg) {
      agentPanel.elements.imagePreviewImg.src = ''
    }
  },

  open: function () {
    if (!agentPanel.panel) return

    agentPanel.panel.classList.add('active')
    agentPanel.isOpen = true
    webviews.adjustMargin([0, agentPanel.panelWidth, 0, 0])

    // Focus input
    setTimeout(function () {
      if (agentPanel.elements.chatInput) {
        agentPanel.elements.chatInput.focus()
      }
    }, 200)

    // Show suggestions if chat is empty
    agentPanel.updateSuggestionsVisibility()
  },

  close: function () {
    if (!agentPanel.panel) return

    agentPanel.panel.classList.remove('active')
    agentPanel.isOpen = false
    webviews.adjustMargin([0, -agentPanel.panelWidth, 0, 0])
  },

  toggle: function () {
    if (agentPanel.isOpen) {
      agentPanel.close()
    } else {
      agentPanel.open()
    }
  },

  clearChat: function () {
    agentCore.clearHistory()
    if (agentPanel.elements.chatMessages) {
      agentPanel.elements.chatMessages.innerHTML = ''
    }
    agentPanel.updateSuggestionsVisibility()
  },

  updateSuggestionsVisibility: function () {
    if (!agentPanel.elements.suggestions || !agentPanel.elements.chatMessages) return

    var hasMessages = agentPanel.elements.chatMessages.children.length > 0
    agentPanel.elements.suggestions.style.display = hasMessages ? 'none' : 'flex'
  },

  addMessage: function (role, content, imageDataUrl) {
    if (!agentPanel.elements.chatMessages) return

    var msgDiv = document.createElement('div')
    msgDiv.className = 'agent-message agent-message-' + role

    var contentDiv = document.createElement('div')
    contentDiv.className = 'agent-message-content'

    // Add text content first (if any)
    if (content && content.trim()) {
      var textNode = document.createElement('div')
      textNode.textContent = content
      contentDiv.appendChild(textNode)
    }

    // Add image thumbnail if provided (after text)
    if (imageDataUrl) {
      var imgContainer = document.createElement('div')
      imgContainer.className = 'agent-msg-img-wrap'
      var img = document.createElement('img')
      img.src = imageDataUrl
      img.alt = 'Attached'
      img.className = 'agent-msg-img'
      img.addEventListener('click', function () {
        agentPanel.openImageOverlay(imageDataUrl)
      })
      imgContainer.appendChild(img)
      contentDiv.appendChild(imgContainer)
    }

    msgDiv.appendChild(contentDiv)
    agentPanel.elements.chatMessages.appendChild(msgDiv)
    agentPanel.elements.chatMessages.scrollTop = agentPanel.elements.chatMessages.scrollHeight

    agentPanel.updateSuggestionsVisibility()
  },

  addToolActivity: function (toolName, args) {
    if (!agentPanel.elements.chatMessages) return

    var activityDiv = document.createElement('div')
    activityDiv.className = 'agent-tool-activity'

    var toolLabel = toolName.replace(/_/g, ' ')
    var detail = ''
    if (args) {
      if (args.url) detail = args.url
      else if (args.query) detail = args.query
      else if (args.text) detail = args.text
      else if (args.direction) detail = args.direction
      else if (args.channel) detail = args.channel
      else if (args.recipient) detail = args.recipient.substring(0, 12) + '...'
      else if (args.urls) detail = args.urls.length + ' tabs'
    }

    activityDiv.innerHTML = '<span class="agent-tool-icon">&#9889;</span> ' +
      '<span class="agent-tool-label">' + agentPanel.escapeHtml(toolLabel) + '</span>' +
      (detail ? ' <span class="agent-tool-detail">' + agentPanel.escapeHtml(detail) + '</span>' : '')

    agentPanel.elements.chatMessages.appendChild(activityDiv)
    agentPanel.elements.chatMessages.scrollTop = agentPanel.elements.chatMessages.scrollHeight
  },

  addTypingIndicator: function () {
    if (!agentPanel.elements.chatMessages) return

    var existing = agentPanel.elements.chatMessages.querySelector('.agent-typing-indicator')
    if (existing) return

    var typingDiv = document.createElement('div')
    typingDiv.className = 'agent-typing-indicator'
    typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>'

    agentPanel.elements.chatMessages.appendChild(typingDiv)
    agentPanel.elements.chatMessages.scrollTop = agentPanel.elements.chatMessages.scrollHeight
  },

  removeTypingIndicator: function () {
    if (!agentPanel.elements.chatMessages) return

    var existing = agentPanel.elements.chatMessages.querySelector('.agent-typing-indicator')
    if (existing) {
      existing.remove()
    }
  },

  sendMessage: async function () {
    if (agentCore.isProcessing) return

    var input = agentPanel.elements.chatInput
    if (!input) return

    var message = input.value.trim()
    if (!message) return

    // Clear input
    input.value = ''

    // If image is attached, capture its dataUrl for vision API
    var imageInfo = null
    var imageDataUrl = null
    if (agentPanel.attachedImage) {
      imageInfo = agentPanel.attachedImage
      imageDataUrl = imageInfo.dataUrl || null
      // Store in agentTools so it can be used by select_file
      agentTools.lastAttachedImage = imageInfo
      agentPanel.removeAttachedImage()
    }

    // Add user message to UI (with image thumbnail if attached)
    agentPanel.addMessage('user', message, imageDataUrl)

    // Show typing indicator
    agentPanel.addTypingIndicator()

    // Disable send button
    if (agentPanel.elements.sendBtn) {
      agentPanel.elements.sendBtn.disabled = true
    }

    // Get tool definitions
    var tools = agentTools.getToolDefinitions()

    // Send to agent core with separate execute and activity callbacks
    var response = await agentCore.sendMessage(
      message,
      tools,
      agentTools.executeTool,
      agentPanel.addToolActivity,
      imageDataUrl
    )

    // Remove typing indicator
    agentPanel.removeTypingIndicator()

    // Re-enable send button
    if (agentPanel.elements.sendBtn) {
      agentPanel.elements.sendBtn.disabled = false
    }

    // Show response
    if (response.error) {
      agentPanel.addMessage('error', response.error)
    } else if (response.content) {
      agentPanel.addMessage('assistant', response.content)
    }

    // Focus input
    if (input) {
      input.focus()
    }
  },

  showConfirmation: function (data) {
    if (!agentPanel.elements.confirmationOverlay) return

    if (agentPanel.elements.confirmationMessage) {
      agentPanel.elements.confirmationMessage.textContent = data.message || 'Confirm this action?'
    }

    agentPanel.elements.confirmationOverlay.classList.add('active')
  },

  hideConfirmation: function () {
    if (agentPanel.elements.confirmationOverlay) {
      agentPanel.elements.confirmationOverlay.classList.remove('active')
    }
  },

  escapeHtml: function (text) {
    var div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  },

  openImageOverlay: function (dataUrl) {
    // Remove existing overlay if any
    var existing = document.getElementById('agent-image-overlay')
    if (existing) existing.remove()

    // Find the agent panel container to scope the overlay within it
    var panelContainer = document.getElementById('agent-panel')

    var overlay = document.createElement('div')
    overlay.id = 'agent-image-overlay'
    overlay.className = 'agent-image-overlay'

    var closeBtn = document.createElement('button')
    closeBtn.className = 'agent-image-overlay-close'
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      overlay.remove()
    })

    var imgWrap = document.createElement('div')
    imgWrap.className = 'agent-image-overlay-content'
    var fullImg = document.createElement('img')
    fullImg.src = dataUrl
    fullImg.className = 'agent-image-overlay-img'
    imgWrap.appendChild(fullImg)

    overlay.appendChild(closeBtn)
    overlay.appendChild(imgWrap)

    // Close on backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove()
    })

    // Close on Escape key
    var escHandler = function (e) {
      if (e.key === 'Escape') {
        overlay.remove()
        document.removeEventListener('keydown', escHandler)
      }
    }
    document.addEventListener('keydown', escHandler)

    // Append to agent panel so it stays within the panel bounds
    if (panelContainer) {
      panelContainer.appendChild(overlay)
    } else {
      document.body.appendChild(overlay)
    }
  }
}

module.exports = agentPanel
