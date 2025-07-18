# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a Chrome extension project with no build system. To test and develop:

```bash
# Load extension in Chrome
# 1. Open Chrome and go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select this directory
# 4. The extension will be loaded and ready to use

# To reload after changes:
# Click the reload button on the extension card in chrome://extensions/
```

## Architecture

This is a Chrome extension that provides an overlay interface for the Linux.do website. The extension uses Manifest V2 and consists of three main components:

### Core Components:
- **manifest.json**: Extension configuration with permissions for activeTab, storage, and scripting
- **background.js**: Service worker that handles extension lifecycle, tab management, and icon state
- **content.js**: Content script injected into web pages that creates and manages the overlay UI
- **popup.js/popup.html/popup.css**: Extension popup interface for user interaction

### Key Functionality:
- **Overlay System**: Creates a draggable overlay window on web pages with Linux.do branding
- **Tab Management**: Tracks active tabs and updates extension icon state accordingly
- **Storage**: Uses Chrome storage API to persist user preferences and state
- **Dynamic Content**: Loads and displays content within the overlay iframe

### Technical Details:
- Uses Chrome Extension APIs: tabs, storage, scripting, activeTab
- Overlay positioning uses fixed positioning with high z-index (999999)
- Icon states change based on extension activity (active/inactive variants)
- Content script communicates with background script for state management

### File Structure:
- `icons/`: Contains extension icons in multiple sizes and states
- Main scripts are in the root directory
- No build process - files are used directly by Chrome