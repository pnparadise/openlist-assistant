// Background script for OpenList Download Assistant

// Store for managing downloads and settings
const openListData = {
    downloads: new Map(),
    processedMagnets: new Set(), // Track processed magnet links to prevent duplicates
    shouldStartPolling: false, // Flag to indicate popup should start polling
    settings: {
        apiEndpoint: 'https://open.lan',
        defaultPath: '/',
        defaultTool: 'aria2',
        deletePolicy: 'delete_on_upload_succeed',
        token: ''
    },
    statusCache: {
        auth: {
            isValid: null,
            needsRefresh: true // Only refresh when explicitly needed
        },
        connection: {
            isConnected: null,
            availableTools: null,
            needsRefresh: true // Only refresh when explicitly needed
        }
    }
};

// Common API call function to reduce code duplication
async function makeApiCall(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // Handle HTTP status errors
        if (!response.ok) {
            // Mark status caches for refresh on HTTP errors
            openListData.statusCache.auth.needsRefresh = true;
            openListData.statusCache.connection.needsRefresh = true;
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Handle 401 unauthorized - token is invalid
        if (result.code === 401) {
            // Set auth status as invalid immediately
            openListData.statusCache.auth.isValid = false;
            openListData.statusCache.auth.needsRefresh = false; // Already updated
        }
        
        return {
            success: response.ok && result.code === 200,
            httpStatus: response.status,
            data: result,
            error: result.message || null
        };
    } catch (error) {
        // Network errors also mark caches for refresh
        openListData.statusCache.auth.needsRefresh = true;
        openListData.statusCache.connection.needsRefresh = true;
        throw error;
    }
}

// Specialized API call function for status checking with cache management
async function makeStatusApiCall(url, options = {}, cache = null) {
    try {
        const response = await fetch(url, options);
        
        if (response.ok) {
            const result = await response.json();
            return {
                success: response.status === 200 && result.code === 200,
                httpStatus: response.status,
                data: result,
                error: result.message || null
            };
        } else {
            // Handle HTTP status errors for status checks
            if (cache && response.status >= 500) {
                cache.needsRefresh = true;
            } else if (cache && response.status < 500) {
                cache.needsRefresh = false;
            }
            
            return {
                success: false,
                httpStatus: response.status,
                data: null,
                error: `HTTP ${response.status}: ${response.statusText}`
            };
        }
    } catch (error) {
        // Network errors mark cache for refresh
        if (cache) {
            cache.needsRefresh = true;
        }
        throw error;
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    // Initialize default settings
    chrome.storage.local.set({
        openListSettings: openListData.settings
    });
});



// Listen for navigation events to intercept magnet links
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Check if this is a direct magnet link
    const isMagnetDirect = details.url.startsWith('magnet:');
    
    // Check if this is a search engine URL containing magnet link
    const isSearchEngine = details.url.includes('google.com/search') ||
                           details.url.includes('bing.com/search') ||
                           details.url.includes('baidu.com/s') ||
                           details.url.includes('duckduckgo.com');
    
    // Extract magnet link from search URL if present
    let extractedMagnetUrl = null;
    if (isSearchEngine && details.url.includes('magnet')) {
        try {
            const urlParams = new URLSearchParams(details.url.split('?')[1]);
            const query = urlParams.get('q') || urlParams.get('wd'); // 'q' for Google/Bing, 'wd' for Baidu
            if (query) {
                const decodedQuery = decodeURIComponent(query);
                
                // Check if the decoded query is a magnet link
                if (decodedQuery.startsWith('magnet:')) {
                    extractedMagnetUrl = decodedQuery;
                }
            }
        } catch (error) {
            // Silently handle extraction errors
        }
    }
    
    // Only handle main frame navigation (not iframes)
    if (details.frameId === 0 && (isMagnetDirect || extractedMagnetUrl)) {
        console.log('Intercepting magnet link navigation:', isMagnetDirect ? details.url : extractedMagnetUrl);
        
        // Immediately prevent the navigation by redirecting to a safe URL
        const safeUrl = 'data:text/html,<html><head><title>Processing Magnet Link</title></head><body><h2>Processing magnet link...</h2><p>Please wait while we add this to your downloads.</p></body></html>';
        
        // Use chrome.tabs.update with a callback to ensure it completes
        chrome.tabs.update(details.tabId, { url: safeUrl }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('Error redirecting tab:', chrome.runtime.lastError.message);
                // Fallback method
                chrome.tabs.update(details.tabId, { url: 'about:blank' });
            }
            
            // Handle the magnet link after successful redirect
            const magnetUrl = isMagnetDirect ? details.url : extractedMagnetUrl;
            chrome.tabs.get(details.tabId, (currentTab) => {
                if (!chrome.runtime.lastError && currentTab) {
                    handleMagnetLink(magnetUrl, currentTab);
                } else {
                    // If we can't get tab info, still try to handle the magnet link
                    handleMagnetLink(magnetUrl, { id: details.tabId });
                }
            });
        });
        
        // Return true to indicate we're handling this navigation
        return true;
    }
});

// Listen for tab updates to catch magnet links in address bar
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.startsWith('magnet:')) {
        console.log('Tab update intercepted magnet link:', changeInfo.url);
        
        // Immediately prevent the navigation with a safe URL
        const safeUrl = 'data:text/html,<html><head><title>Processing Magnet Link</title></head><body><h2>Processing magnet link...</h2><p>Please wait while we add this to your downloads.</p></body></html>';
        
        chrome.tabs.update(tabId, { url: safeUrl }, (updatedTab) => {
            if (chrome.runtime.lastError) {
                console.error('Error redirecting tab in onUpdated:', chrome.runtime.lastError.message);
                // Fallback to about:blank
                chrome.tabs.update(tabId, { url: 'about:blank' });
            }
        });
        
        // Handle the magnet link
        handleMagnetLink(changeInfo.url, tab);
    }
});

// Additional listener for committed navigation events as a final fallback
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0 && details.url.startsWith('magnet:')) {
        console.log('onCommitted intercepted magnet link:', details.url);
        
        // This is a last resort - the navigation has already started
        const safeUrl = 'data:text/html,<html><head><title>Processing Magnet Link</title></head><body><h2>Processing magnet link...</h2><p>Please wait while we add this to your downloads.</p></body></html>';
        
        chrome.tabs.update(details.tabId, { url: safeUrl }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('Error redirecting tab in onCommitted:', chrome.runtime.lastError.message);
                chrome.tabs.update(details.tabId, { url: 'about:blank' });
            }
            
            // Handle the magnet link
            chrome.tabs.get(details.tabId, (currentTab) => {
                if (!chrome.runtime.lastError && currentTab) {
                    handleMagnetLink(details.url, currentTab);
                } else {
                    handleMagnetLink(details.url, { id: details.tabId });
                }
            });
        });
    }
});

// Listen for error events that might occur when trying to navigate to magnet links
chrome.webNavigation.onErrorOccurred.addListener((details) => {
    if (details.frameId === 0 && details.url.startsWith('magnet:')) {
        console.log('Navigation error for magnet link, handling:', details.url, 'Error:', details.error);
        
        // Handle the magnet link even if navigation failed
        chrome.tabs.get(details.tabId, (tab) => {
            if (!chrome.runtime.lastError && tab) {
                handleMagnetLink(details.url, tab);
            } else {
                handleMagnetLink(details.url, { id: details.tabId });
            }
        });
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'interceptMagnetLink':
            handleMagnetLink(message.magnetUrl, sender.tab, sendResponse);
            return true; // Keep channel open for async response
        case 'getAuthToken':
            getAuthToken(sendResponse);
            return true; // Keep channel open for async response
        case 'addOfflineDownload':
            addOfflineDownload(message.urls, message.settings, sendResponse);
            return true; // Keep channel open for async response
        case 'getDownloads':
            sendResponse({ downloads: Array.from(openListData.downloads.values()) });
            break;
        case 'cancelDownloadTask':
            cancelDownloadTask(message.taskId, message.token, sendResponse);
            return true; // Keep channel open for async response
        case 'getSettings':
            getSettings(sendResponse);
            return true; // Keep channel open for async response
        case 'updateSettings':
            updateSettings(message.settings, sendResponse);
            return true; // Keep channel open for async response
        case 'clearProcessedMagnets':
            openListData.processedMagnets.clear();
            sendResponse({ success: true, message: 'Processed magnets cache cleared' });
            break;
        case 'checkAuthStatus':
            checkAuthStatus(message.apiEndpoint, message.token, sendResponse);
            return true; // Keep channel open for async response
        case 'checkConnectionStatus':
            checkConnectionStatus(message.apiEndpoint, message.token, sendResponse);
            return true; // Keep channel open for async response
        case 'invalidateStatusCache':
            openListData.statusCache.auth.needsRefresh = true;
            openListData.statusCache.connection.needsRefresh = true;
            sendResponse({ success: true });
            break;
        case 'setAuthStatusInvalid':
            openListData.statusCache.auth.isValid = false;
            openListData.statusCache.auth.needsRefresh = false; // Already updated
            sendResponse({ success: true });
            break;
        case 'getDownloadsList':
            getDownloadsList(sendResponse);
            return true; // Keep channel open for async response
        default:
            break;
    }
    return true;
});

// Handle magnet link interception
async function handleMagnetLink(magnetUrl, tab, sendResponse = null) {
    try {
        console.log('Processing magnet link:', magnetUrl);
        
        // Validate magnet URL format
        if (!magnetUrl || !magnetUrl.startsWith('magnet:')) {
            const error = 'Invalid magnet URL format';
            console.error(error, magnetUrl);
            showNotification('Error', error);
            if (sendResponse) {
                sendResponse({ success: false, error });
            }
            return;
        }
        
        // Check if this magnet link has already been processed
        if (openListData.processedMagnets.has(magnetUrl)) {
            const message = 'This magnet link has already been added';
            console.log(message);
            showNotification('Info', message);
            if (sendResponse) {
                sendResponse({ success: false, error: message });
            }
            return;
        }
        
        // Get auth token
        const token = await getAuthToken();
        if (!token) {
            const error = 'Please complete endpoint & token first';
            console.error(error);
            showNotification('Error', error);
            if (sendResponse) {
                sendResponse({ success: false, error });
            }
            return;
        }

        // Get current settings
        const settings = await getSettings();
        console.log('Using settings:', settings);
        
        // Show processing notification
        showNotification('Processing', 'Adding magnet link to downloads...');
        
        // Add to offline downloads
        const result = await addOfflineDownload([magnetUrl], settings, null, token);
        
        if (result.success) {
            // Mark this magnet link as processed
            openListData.processedMagnets.add(magnetUrl);
            console.log('Successfully added magnet link to downloads');
            showNotification('Success', 'Magnet link added to OpenList downloads');
            updateIcon(true, tab.id);
            
            // Set flag for popup to start polling when it opens
            openListData.shouldStartPolling = true;
            
            // Try to notify popup if it's currently open
            try {
                chrome.runtime.sendMessage({ action: 'startPolling' }).catch(() => {
                    // Popup might not be open, ignore error
                });
            } catch (error) {
                // Ignore error if popup is not open
            }
            
            if (sendResponse) {
                sendResponse({ success: true, message: 'Magnet link added successfully' });
            }
        } else {
            const error = result.error || 'Failed to add download';
            console.error('Failed to add magnet link:', error);
            showNotification('Error', error);
            if (sendResponse) {
                sendResponse({ success: false, error });
            }
        }
        
    } catch (error) {
        console.error('Error processing magnet link:', error);
        const errorMessage = 'Failed to process magnet link: ' + error.message;
        showNotification('Error', errorMessage);
        if (sendResponse) {
            sendResponse({ success: false, error: errorMessage });
        }
    }
}

// Get authentication token from settings
async function getAuthToken(sendResponse = null) {
    try {
        // Get settings to get the token
        const settings = await getSettings();
        const token = settings.token || null;
        
        if (sendResponse) {
            sendResponse({ token });
        }
        
        return token;
    } catch (error) {
        console.error('Error getting auth token from settings:', error);
        if (sendResponse) {
            sendResponse({ token: null, error: error.message });
        }
        return null;
    }
}


// Add offline download via OpenList API
async function addOfflineDownload(urls, settings = null, sendResponse = null, token = null) {
    try {
        // Check for duplicates in manual downloads too
        const duplicateUrls = urls.filter(url => openListData.processedMagnets.has(url));
        if (duplicateUrls.length > 0) {
            const error = `Some URLs have already been processed: ${duplicateUrls.join(', ')}`;
            if (sendResponse) sendResponse({ success: false, error });
            return { success: false, error };
        }
        
        if (!token) {
            token = await getAuthToken();
        }
        
        if (!token) {
            const error = `No authentication token found. Please complete endpoint & token first`;
            if (sendResponse) sendResponse({ success: false, error });
            return { success: false, error };
        }

        if (!settings) {
            settings = await getSettings();
        }

        const requestBody = {
            urls: urls,
            path: settings.defaultPath,
            tool: settings.defaultTool,
            delete_policy: settings.deletePolicy
        };


        const apiResult = await makeApiCall(`${settings.apiEndpoint}/api/fs/add_offline_download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(requestBody)
        });
        
        if (apiResult.success) {
            // Mark URLs as processed
            urls.forEach(url => openListData.processedMagnets.add(url));
            
            // Store download info
            const downloadId = Date.now().toString();
            openListData.downloads.set(downloadId, {
                id: downloadId,
                urls: urls,
                timestamp: new Date().toISOString(),
                status: 'added',
                tasks: apiResult.data.data.tasks || []
            });

            const result = { success: true, data: apiResult.data.data };
            if (sendResponse) sendResponse(result);
            return result;
        } else {
            const error = apiResult.error || `HTTP ${apiResult.httpStatus}: Request failed`;
            const result = { success: false, error };
            if (sendResponse) sendResponse(result);
            return result;
        }

    } catch (error) {
        console.error('Error adding offline download:', error);
        const result = { success: false, error: error.message };
        if (sendResponse) sendResponse(result);
        return result;
    }
}

// Get settings from storage
async function getSettings(sendResponse = null) {
    try {
        const result = await chrome.storage.local.get(['openListSettings']);
        const settings = result.openListSettings || openListData.settings;
        
        if (sendResponse) {
            sendResponse({ settings });
        }
        
        return settings;
    } catch (error) {
        console.error('Error getting settings:', error);
        const defaultSettings = openListData.settings;
        if (sendResponse) {
            sendResponse({ settings: defaultSettings });
        }
        return defaultSettings;
    }
}


// Update extension icon
function updateIcon(active, tabId) {
    const iconPath = active ? {
        "16": "icons/icon16_active.png",
        "48": "icons/icon48_active.png",
        "128": "icons/icon128_active.png"
    } : {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
    };

    chrome.action.setIcon({
        path: iconPath,
        tabId: tabId
    }).catch(error => {
        console.error('Error updating icon:', error);
    });
}

// Show notification to user
function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message
    }).catch(error => {
        console.log('Notification not available:', error);
    });
}

// Check auth status with persistent caching
async function checkAuthStatus(apiEndpoint, token, sendResponse = null) {
    try {
        const cache = openListData.statusCache.auth;
        
        // Return cached result if available and no refresh needed
        if (!cache.needsRefresh && cache.isValid !== null) {
            if (sendResponse) {
                sendResponse({
                    isValid: cache.isValid,
                    cached: true
                });
            }
            return cache.isValid;
        }
        
        // Need to refresh or no cached result, make API call
        if (!token || !apiEndpoint) {
            cache.isValid = false;
            cache.needsRefresh = false; // Mark as refreshed
            if (sendResponse) {
                sendResponse({ isValid: false, cached: false, reason: 'missing_credentials' });
            }
            return false;
        }
        
        try {
            const apiResult = await makeStatusApiCall(`${apiEndpoint}/api/me`, {
                method: 'GET',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            }, cache);
            
            cache.isValid = apiResult.success;
            
            // Only mark as not needing refresh if call was successful
            if (apiResult.httpStatus < 500) {
                cache.needsRefresh = false;
            }
            
            if (sendResponse) {
                sendResponse({
                    isValid: cache.isValid,
                    cached: false,
                    httpStatus: apiResult.httpStatus
                });
            }
            
            return cache.isValid;
        } catch (error) {
            console.error('Error checking auth status:', error);
            // On network error, keep current status but mark for refresh
            cache.needsRefresh = true;
            
            if (sendResponse) {
                sendResponse({
                    isValid: cache.isValid || false,
                    cached: false,
                    error: error.message
                });
            }
            
            return cache.isValid || false;
        }
    } catch (error) {
        console.error('Error in checkAuthStatus:', error);
        if (sendResponse) {
            sendResponse({ isValid: false, cached: false, error: error.message });
        }
        return false;
    }
}

// Check connection status with persistent caching
async function checkConnectionStatus(apiEndpoint, token, sendResponse = null) {
    try {
        const cache = openListData.statusCache.connection;
        
        // Return cached result if available and no refresh needed
        if (!cache.needsRefresh && cache.isConnected !== null) {
            if (sendResponse) {
                sendResponse({
                    isConnected: cache.isConnected,
                    availableTools: cache.availableTools,
                    cached: true
                });
            }
            return { isConnected: cache.isConnected, availableTools: cache.availableTools };
        }
        
        // Need to refresh or no cached result, make API call
        if (!apiEndpoint || !token) {
            cache.isConnected = false;
            cache.availableTools = null;
            cache.needsRefresh = false; // Mark as refreshed
            if (sendResponse) {
                sendResponse({ isConnected: false, availableTools: null, cached: false, reason: 'missing_credentials' });
            }
            return { isConnected: false, availableTools: null };
        }
        
        try {
            const apiResult = await makeStatusApiCall(`${apiEndpoint}/api/public/offline_download_tools`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, cache);
            
            cache.isConnected = apiResult.success;
            if (cache.isConnected && apiResult.data && apiResult.data.data) {
                cache.availableTools = apiResult.data.data;
            } else {
                cache.availableTools = null;
            }
            
            // Only mark as not needing refresh if call was successful
            if (apiResult.httpStatus < 500) {
                cache.needsRefresh = false;
            }
            
            if (sendResponse) {
                sendResponse({
                    isConnected: cache.isConnected,
                    availableTools: cache.availableTools,
                    cached: false,
                    httpStatus: apiResult.httpStatus
                });
            }
            
            return { isConnected: cache.isConnected, availableTools: cache.availableTools };
        } catch (error) {
            console.error('Error checking connection status:', error);
            // On network error, keep current status but mark for refresh
            cache.needsRefresh = true;
            
            if (sendResponse) {
                sendResponse({
                    isConnected: cache.isConnected || false,
                    availableTools: cache.availableTools || null,
                    cached: false,
                    error: error.message
                });
            }
            
            return { isConnected: cache.isConnected || false, availableTools: cache.availableTools || null };
        }
    } catch (error) {
        console.error('Error in checkConnectionStatus:', error);
        if (sendResponse) {
            sendResponse({ isConnected: false, availableTools: null, cached: false, error: error.message });
        }
        return { isConnected: false, availableTools: null };
    }
}

// Invalidate status caches when settings are updated
async function updateSettings(newSettings, sendResponse = null) {
    try {
        const updatedSettings = { ...openListData.settings, ...newSettings };
        
        // Check if token or endpoint changed
        const tokenChanged = updatedSettings.token !== openListData.settings.token;
        const endpointChanged = updatedSettings.apiEndpoint !== openListData.settings.apiEndpoint;
        
        await chrome.storage.local.set({ openListSettings: updatedSettings });
        openListData.settings = updatedSettings;
        
        // Mark status caches for refresh if credentials changed
        if (tokenChanged || endpointChanged) {
            openListData.statusCache.auth.needsRefresh = true;
            openListData.statusCache.connection.needsRefresh = true;
        }
        
        const result = { success: true, settings: updatedSettings };
        if (sendResponse) {
            sendResponse(result);
        }
        return result;
    } catch (error) {
        console.error('Error updating settings:', error);
        const result = { success: false, error: error.message };
        if (sendResponse) {
            sendResponse(result);
        }
        return result;
    }
}

// Clean up old downloads and processed magnets every 10 minutes
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    // Clean up old downloads
    for (const [id, download] of openListData.downloads.entries()) {
        const downloadTime = new Date(download.timestamp).getTime();
        if (now - downloadTime > maxAge) {
            openListData.downloads.delete(id);
        }
    }
    
    // Clear processed magnets set periodically to prevent memory buildup
    // This allows the same magnet to be processed again after some time
    if (openListData.processedMagnets.size > 1000) {
        openListData.processedMagnets.clear();
    }
}, 10 * 60 * 1000); // Run every 10 minutes

// Cancel download task
async function cancelDownloadTask(taskId, token, sendResponse = null) {
    try {
        if (!token) {
            token = await getAuthToken();
        }
        
        if (!token) {            const error = `No authentication token found. Please complete endpoint & token first`;
            if (sendResponse) sendResponse({ success: false, error });
            return { success: false, error };
        }
        
        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        
        const apiResult = await makeApiCall(`${apiEndpoint}/api/task/offline_download/cancel?tid=${encodeURIComponent(taskId)}`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        if (apiResult.success) {
            const responseData = {
                success: true,
                message: 'Task cancelled successfully'
            };
            if (sendResponse) sendResponse(responseData);
            return responseData;
        } else {
            const error = apiResult.error || 'Failed to cancel task';
            const responseData = { success: false, error };
            if (sendResponse) sendResponse(responseData);
            return responseData;
        }
    } catch (error) {
        console.error('Error cancelling task:', error);
        const responseData = { success: false, error: error.message };
        if (sendResponse) sendResponse(responseData);
        return responseData;
    }
}


// Get downloads list from API
async function getDownloadsList(sendResponse = null) {
    try {
        // First check if flag is set (for when popup opens after download was triggered)
        let shouldStartPolling = false;
        if (openListData.shouldStartPolling) {
            openListData.shouldStartPolling = false; // Reset flag after checking
            shouldStartPolling = true;
        }
        
        const token = await getAuthToken();
        if (!token) {
            const result = {
                success: false,
                error: 'No authentication token found. Please complete endpoint & token first',
                downloads: [],
                shouldStartPolling: shouldStartPolling
            };
            if (sendResponse) sendResponse(result);
            return result;
        }

        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        
        const apiResult = await makeApiCall(`${apiEndpoint}/api/task/offline_download/undone`, {
            method: 'GET',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        if (apiResult.success) {
            const downloads = apiResult.data.data || [];
            
            // Sort downloads by creation time (newest first)
            downloads.sort((a, b) => {
                const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
                const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
                return timeB - timeA; // Descending order (newest first)
            });
            
            // If flag was set or there are downloads, indicate polling should start
            const hasDownloads = downloads.length > 0;
            
            const responseData = {
                success: true,
                downloads: downloads,
                count: downloads.length,
                shouldStartPolling: shouldStartPolling || hasDownloads
            };
            if (sendResponse) sendResponse(responseData);
            return responseData;
        } else {
            const responseData = {
                success: false,
                error: apiResult.error || 'Failed to load downloads',
                downloads: [],
                code: apiResult.data?.code,
                shouldStartPolling: shouldStartPolling
            };
            if (sendResponse) sendResponse(responseData);
            return responseData;
        }
    } catch (error) {
        console.error('Error loading downloads:', error);
        const responseData = {
            success: false,
            error: error.message,
            downloads: [],
            shouldStartPolling: shouldStartPolling
        };
        if (sendResponse) sendResponse(responseData);
        return responseData;
    }
}
