# OpenList Download Assistant

A Chrome extension that intercepts magnet links from the address bar and adds them to OpenList offline downloads using the openlist ([GitHub - OpenListTeam/OpenList: A new AList Fork to Anti Trust Crisis](https://github.com/OpenListTeam/OpenList)) API.

## Features

- **Address Bar Magnet Link Interception**: Intercepts magnet links entered in the browser address bar
- **One-Click Downloads**: Automatically adds magnet links to OpenList offline downloads
- **localStorage-Based Authentication**: Extracts authentication tokens from your private openlist website localStorage
- **Configurable Settings**: Customize download path, tool, and deletion policies
- **Download Management**: View recent downloads and their status
- **Manual Downloads**: Add magnet URLs manually through the popup interface
- **Non-Intrusive**: Does not inject scripts into web pages, avoiding interference with normal browsing

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory
4. The extension will be loaded and ready to use

## Setup

1. **Login to OpenList**: Visit your [openlist]([GitHub - OpenListTeam/OpenList: A new AList Fork to Anti Trust Crisis](https://github.com/OpenListTeam/OpenList)) domain and login to your account
2. **Install Extension**: Load the extension in Chrome
3. **Configure Settings**: Open the extension popup and configure your preferred settings:
   - API Endpoint: `https://open.lan` (default)  you openlist domain
   - Download Path: `/` (default)
   - Download Tool: `aria2` (default)
   - Delete Policy: `delete_on_upload_succeed` (default)

## Usage

### Address Bar Interception

- Paste or type a magnet link directly into the browser address bar
- Press Enter to navigate to the magnet link
- The extension will intercept the navigation and show a confirmation dialog
- Confirm to add the download to OpenList

### Manual Downloads

1. Open the extension popup
2. Paste a magnet URL in the "Manual Download" section
3. Click "Add to Downloads"

### Settings Management

- Open the extension popup
- Navigate to the "Settings" section
- Modify any settings as needed
- Click "Save Settings"

## API Integration

The extension uses the OpenList API with the following configuration:

### Endpoint

```
POST /api/fs/add_offline_download
```

### Authentication

- Uses localStorage from your openlist domain
- Looks for token with key: `token`

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

- `aria2` (default)
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
- Manages authentication tokens from localStorage
- Makes API calls to OpenList
- Stores download history and settings
- Uses webNavigation API to catch magnet link navigation

#### Popup Interface (`popup.html`, `popup.js`, `popup.css`)

- Shows connection and authentication status
- Provides manual download functionality
- Allows configuration of settings
- Displays recent downloads

### Permissions

The extension requires the following permissions:

- `activeTab`: Access to the current tab
- `storage`: Store settings and download history
- `scripting`: Execute scripts for confirmation dialogs and localStorage access
- `notifications`: Show download notifications
- `webNavigation`: Intercept navigation events for magnet links
- `tabs`: Access tab information for magnet link handling

## Troubleshooting

### No Auth Token Found

- Make sure you're logged in to your openlist website
- Check that the token is stored in localStorage with key "token"
- Try refreshing the token using the "Refresh Token" button

### Connection Failed

- Verify the API endpoint is correct (openlist site)
- Check your internet connection
- Ensure OpenList service is accessible

### Magnet Links Not Detected

- Make sure you're pasting the magnet link directly into the address bar
- Check that the magnet link format is valid (starts with magnet:?xt=urn:btih:)
- Try reloading the extension if navigation interception isn't working

### Downloads Not Appearing

- Check the OpenList web interface for download status
- Verify your download path and tool settings
- Review the Recent Downloads section in the popup

## Security

- The extension only accesses localStorage from the openlist domain
- Authentication tokens are retrieved from localStorage and not stored permanently by the extension
- All API communications use HTTPS
- No sensitive data is transmitted to third parties

## Support

For issues related to:

- **Extension functionality**: Check the browser console for errors
- **OpenList API**: Refer to the OpenList documentation
- **Download problems**: Check your OpenList account and settings

## Version History

### v1.0.0

- Initial release
- Automatic magnet link interception via content scripts
- OpenList API integration
- localStorage-based authentication
- Configurable settings
- Manual download support