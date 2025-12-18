var browserUI = require('browserUI.js')
var ciphernetNavBar = require('ciphernetNavBar.js')

var addTabButton = document.getElementById('add-tab-button')

function initialize () {
  addTabButton.addEventListener('click', function (e) {
    browserUI.addTab()
    setTimeout(function () {
      if (ciphernetNavBar && ciphernetNavBar.searchInput) {
        ciphernetNavBar.searchInput.focus()
      }
    }, 100)
  })
}

module.exports = { initialize }
