# CipherNet Browser

CipherNet is a privacy-first Web3 browser designed for users who demand complete anonymity and security. Built on the foundation of ephemeral sessions and zero-trace architecture, CipherNet ensures your digital footprint vanishes the moment you close the browser.

## Core Features

- **Ephemeral Wallets** - Disposable wallets created on-demand with no address reuse or identity buildup
- **Auto-Burn Sessions** - Complete session wiping on exit with no traces, persistence, or trails
- **dApp Isolation** - Each dApp runs in an encrypted sandbox with no shared storage or cross-app leaks
- **MSG Masking** - Masked transaction instructions to hide your intent and protect origin privacy
- **Ad and Tracker Blocking** - Built-in protection against ads, trackers, and fingerprinting
- **Full-Text Search** - Search through all your visited pages instantly
- **Task Management** - Organize tabs into separate tasks for better workflow management
- **Password Manager Integration** - Secure credential management with popular password managers
- **Dark Theme** - Easy on the eyes with native dark mode support

## Screenshots

## Installing

### Installation on Windows

- Download the latest Windows installer from the [releases page](https://github.com/CipherNetSol/ciphernet-core-browser/releases)
- Run the installer and follow the setup wizard
- Launch CipherNet from your Start menu or desktop shortcut

### Installation on macOS

- Download the `.dmg` file for your Mac (Intel or Apple Silicon)
- Open the downloaded file and drag CipherNet to your Applications folder
- Launch CipherNet from Applications

### Installation on Linux

- **Debian/Ubuntu**: Use `sudo dpkg -i /path/to/ciphernet.deb`
- **Red Hat/Fedora**: Use `sudo rpm -i /path/to/ciphernet.rpm`
- **Arch Linux**: Install from AUR (coming soon)

## Getting Started

### First Launch

On your first launch, CipherNet will display a welcome page introducing you to its core privacy features. From there, you can:

- Start browsing immediately with automatic tracker blocking
- Create ephemeral wallets for Web3 interactions
- Organize your browsing into separate tasks
- Configure privacy settings to match your security requirements

### Keyboard Shortcuts

- `Ctrl/Cmd + T` - New tab
- `Ctrl/Cmd + Shift + T` - Reopen closed tab
- `Ctrl/Cmd + W` - Close current tab
- `Ctrl/Cmd + K` - Focus search bar
- `Ctrl/Cmd + Shift + E` - Switch tasks
- `Alt/Opt + Ctrl/Cmd + R` - Reload browser UI (development mode)

## Development

If you want to contribute to CipherNet development:

### Setup

1. Install [Node.js](https://nodejs.org) (v18 or higher recommended)
2. Clone this repository:
   ```bash
   git clone https://github.com/CipherNetSol/ciphernet-core-browser.git
   cd ciphernet
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start CipherNet in development mode:
   ```bash
   npm run start
   ```
5. Make your changes and press `Alt+Ctrl+R` (or `Opt+Cmd+R` on Mac) to reload the browser UI

### Building from Source

Use one of the following commands to create platform-specific binaries:

```bash
npm run buildWindows      # Windows installer
npm run buildMacIntel     # macOS (Intel)
npm run buildMacArm       # macOS (Apple Silicon)
npm run buildDebian       # Debian/Ubuntu package
npm run buildRedhat       # Red Hat/Fedora package
npm run buildLinuxArm64   # ARM64 Linux (Raspberry Pi, etc.)
```

### Platform-Specific Requirements

**macOS:**
- Install Xcode and command-line tools
- Set SDK to macOS 11.0 or higher:
  ```bash
  export SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX11.1.sdk
  ```

**Windows:**
- Install Visual Studio (2019 or later)
- Configure npm to use the correct version:
  ```bash
  npm config set msvs_version 2019
  ```

## Contributing to CipherNet

We welcome contributions from the community! Here's how you can help:

### Reporting Issues

If you encounter a bug or have a feature suggestion:
1. Check if the issue already exists in our [issue tracker](https://github.com/CipherNetSol/ciphernet-core-browser/issues)
2. If not, create a [new issue](https://github.com/CipherNetSol/ciphernet-core-browser/issues/new) with:
   - Clear description of the problem or feature
   - Steps to reproduce (for bugs)
   - Expected vs. actual behavior
   - System information (OS, CipherNet version)

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the development setup instructions above
4. CipherNet uses the [Standard](https://standardjs.com) code style - most editors have plugins for auto-formatting
5. Test your changes thoroughly
6. Commit your changes with clear commit messages
7. Push to your fork and submit a pull request

### Architecture

CipherNet is built on Electron and uses:
- **Frontend**: HTML, CSS, JavaScript (Browserify for bundling)
- **Backend**: Node.js with Electron
- **Web Engine**: Chromium (via Electron)
- **Privacy Layer**: Custom implementations for wallet isolation, session burning, and dApp sandboxing

## Contributing Translations

### Adding a New Language

1. Find your language code from [this Chromium list](https://source.chromium.org/chromium/chromium/src/+/main:ui/base/l10n/l10n_util.cc;l=68-259)
2. Create a new file in `localization/languages/` named `[language-code].json`
3. Copy the contents from `localization/languages/en-US.json`
4. Update the "identifier" field to your language code
5. Translate all strings in the right-hand column
6. Test by running CipherNet in development mode
7. Submit a pull request

### Updating Existing Translations

1. Find your language file in `localization/languages/`
2. Look for items with `null` values or "missing translation" comments
3. Find the corresponding English string in `en-US.json`
4. Add your translation and remove the comment
5. Submit a pull request

## Security & Privacy

CipherNet takes security seriously:
- **No telemetry** - We don't collect usage data
- **Local-only storage** - All data stays on your device until auto-burn
- **Open source** - Full transparency of our codebase
- **Regular audits** - Community-driven security reviews

If you discover a security vulnerability, please email info@ciphernetsol.xyz (or create a private security advisory on GitHub) rather than opening a public issue.

## License

[Add your license information here - e.g., Apache 2.0, MIT, GPL, etc.]

## Acknowledgments

CipherNet is built on the foundation of [Min Browser](https://minbrowser.org/), extending it with privacy-first Web3 capabilities and ephemeral session architecture.

---

**Stay Anonymous. Stay Secure. CipherNet.**
