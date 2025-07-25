# OpenList Download Assistant

**GitHub Repository**: [https://github.com/pnparadise/openlist-assistant](https://github.com/pnparadise/openlist-assistant)

**Chrome Web Store**: [https://chromewebstore.google.com/detail/openlist-download-assista/hpggdjnoodkkncnhelpeallkflccljjk?authuser=0&hl=zh-CN](https://chromewebstore.google.com/detail/openlist-download-assista/hpggdjnoodkkncnhelpeallkflccljjk?authuser=0&hl=zh-CN)

A Chrome extension that intercepts magnet links from the address bar and adds them to OpenList offline downloads using the openlist ([GitHub - OpenListTeam/OpenList: A new AList Fork to Anti Trust Crisis](https://github.com/OpenListTeam/OpenList)) API.

## Features

- **Address Bar Magnet Link Interception**: Intercepts magnet links entered in the browser address bar
- **One-Click Downloads**: Automatically adds magnet links to OpenList offline downloads
- **Settings-Based Authentication**: Configure API endpoint and authentication token directly in extension settings
- **Configurable Settings**: Customize download path, tool, and deletion policies
- **Download Management**: View recent downloads and their status with real-time updates
- **Manual Downloads**: Add magnet URLs manually through the popup interface
- **Dynamic Tool Detection**: Automatically detects available download tools from your OpenList server
- **Real-time Status Updates**: Connection and authentication status update automatically
- **Non-Intrusive**: Does not inject scripts into web pages, avoiding interference with normal browsing

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory
4. The extension will be loaded and ready to use

## Setup

1. **Install Extension**: Load the extension in Chrome
2. **Configure Settings**: Open the extension popup and configure your settings:
   - **API Endpoint**: Your OpenList domain (e.g., `https://open.lan`)
   - **Token**: Your authentication token (Path: Settings - Other - Token in OpenList)
   - **Download Path**: `/` (default)
   - **Download Tool**: Automatically detected from server (aria2, SimpleHttp, qBittorrent)
   - **Delete Policy**: `delete_on_upload_succeed` (default)
3. **Save Settings**: Click "Save Settings" to apply configuration

## Usage

### Address Bar Interception

- Paste or type a magnet link directly into the browser address bar
- Press Enter to navigate to the magnet link
- The extension will intercept the navigation and show a confirmation dialog
- Confirm to add the download to OpenList

### Manual Downloads

1. Open the extension popup
2. Navigate to the "Manual Download" page
3. Paste a magnet URL in the input field
4. Click "Add to Downloads"

### Settings Management

1. Open the extension popup
2. Navigate to the "Settings" page
3. Configure your API endpoint and token
4. Modify other settings as needed
5. Click "Save Settings" (status will update automatically)

## API Integration

The extension uses the OpenList API with the following endpoints:

### Authentication Check
```
GET /api/me
```
Used to validate authentication token and check user status.

### Connection Check & Tool Detection
```
GET /api/public/offline_download_tools
```
Used to check server connectivity and detect available download tools.

### Add Download
```
POST /api/fs/add_offline_download
```

### Download Status
```
GET /api/task/offline_download/undone
```
Used to fetch ongoing downloads and their status.

### Authentication

- Uses token-based authentication configured in extension settings
- Token should be obtained from OpenList: Settings → Other → Token
- Token is stored securely in extension settings

### Request Format

```json
{
  "urls": ["magnet:?xt=urn:btih:..."],
  "path": "/",
  "tool": "aria2",
  "delete_policy": "delete_on_upload_succeed"
}
```

### Supported Tools

Tools are automatically detected from your OpenList server:
- `aria2` (most common)
- `SimpleHttp`
- `qBittorrent`

### Delete Policies

- `delete_on_upload_succeed` (default)
- `delete_on_upload_failed`
- `delete_never`
- `delete_always`

## Development

### Project Structure

```
├── manifest.json          # Extension manifest
├── background.js          # Background service worker with URL interception
├── popup.html            # Popup interface
├── popup.js              # Popup logic
├── popup.css             # Popup styling
├── icons/                # Extension icons
└── README.md             # This file
```

### Key Components

#### Background Script (`background.js`)

- Intercepts magnet links from address bar navigation
- Manages settings-based authentication
- Makes API calls to OpenList
- Stores download history and settings
- Uses webNavigation API to catch magnet link navigation

#### Popup Interface (`popup.html`, `popup.js`, `popup.css`)

- Shows real-time connection and authentication status
- Provides manual download functionality
- Allows configuration of settings with immediate feedback
- Displays recent downloads with real-time updates
- Multi-page interface (Main, Manual Download, Settings)

### Permissions

The extension requires the following permissions:

- `activeTab`: Access to the current tab for magnet link detection
- `storage`: Store settings and download history
- `scripting`: Execute scripts for magnet link counting
- `notifications`: Show download notifications
- `webNavigation`: Intercept navigation events for magnet links
- `host_permissions: <all_urls>`: Make API calls to user-configured endpoints

## Status Indicators

### Connection Status
- **Connected**: API endpoint and token are configured
- **Disconnected**: Missing endpoint or token configuration
- **Error**: Extension or network issues

### Auth Status
- **Valid**: Token successfully authenticated with `/api/me`
- **Invalid**: Token authentication failed
- **Missing**: No token configured
- **Error**: Network or API errors

## Troubleshooting

### Configuration Issues

- **"Please complete endpoint & token first"**: Configure both API endpoint and token in Settings
- **Connection Status "Disconnected"**: Check that both endpoint and token are filled in Settings
- **Auth Status "Invalid"**: Verify your token is correct (get from OpenList: Settings → Other → Token)

### Connection Problems

- Verify the API endpoint URL is correct (your OpenList domain)
- Check your internet connection
- Ensure OpenList service is accessible
- Try saving settings again to refresh connection status

### Magnet Links Not Detected

- Make sure you're pasting the magnet link directly into the address bar
- Check that the magnet link format is valid (starts with `magnet:?xt=urn:btih:`)
- Try reloading the extension if navigation interception isn't working

### Downloads Not Appearing

- Check the OpenList web interface for download status
- Verify your download path and tool settings
- Review the downloads list in the extension popup
- Ensure your token has proper permissions

## Security

- Authentication tokens are stored securely in extension settings
- All API communications use HTTPS when configured
- No sensitive data is transmitted to third parties
- Extension follows principle of least privilege with minimal permissions

## Support

For issues related to:

- **Extension functionality**: Check the browser console for errors
- **OpenList API**: Refer to the OpenList documentation
- **Download problems**: Check your OpenList account and settings
- **Token issues**: Verify token from OpenList Settings → Other → Token

## Version History

### v1.1.1

- **Enhanced magnet link interception**: Improved multiple fallback mechanisms to prevent "scheme does not have a registered handler" errors
- **Better navigation handling**: Added `onCommitted` and `onErrorOccurred` listeners for comprehensive magnet link catching
- **Improved error handling**: Enhanced logging and user feedback during magnet link processing
- **Enhanced security**: Added content security policy for extension pages
- **Better user experience**: Informative processing pages instead of blank redirects, no automatic tab closure
- **Cache enhanced**: Persistent caching system for auth and connection status to reduce API calls and improve performance
- **Smart cache management**: Automatic cache invalidation on errors and credential changes for better reliability
- **Optimized API calls**: Common API call functions with intelligent error handling and status cache updates

### v1.1.0

- **Settings-based authentication**: Removed localStorage dependency, token now configured in extension settings
- **Real-time status updates**: Connection and auth status update automatically after saving settings
- **Dynamic tool detection**: Download tools automatically detected from server capabilities
- **Improved API integration**: Uses `/api/me` for authentication validation and `/api/public/offline_download_tools` for connection checking
- **Enhanced user experience**: Immediate navigation, better error messages, automatic status refresh
- **Optimized permissions**: Removed unnecessary `tabs` permission, using `activeTab` only
- **Streamlined interface**: Removed refresh functionality, automatic updates instead

### v1.0.0

- Initial release
- Automatic magnet link interception via content scripts
- OpenList API integration
- localStorage-based authentication
- Configurable settings
- Manual download support