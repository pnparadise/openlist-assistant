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
        deletePolicy: 'delete_on_upload_succeed'
    }
};

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    // Initialize default settings
    chrome.storage.local.set({
        openListSettings: openListData.settings
    });
});


chrome.webNavigation.onErrorOccurred.addListener((details) => {
    if (details.url.startsWith('magnet:')) {
        // This is likely the actual magnet URL from a redirect
        // Handle it here since onBeforeNavigate caught the redirect URL
        if (details.frameId === 0 && details.error === 'net::ERR_ABORTED') {
            chrome.tabs.get(details.tabId, (tab) => {
                if (!chrome.runtime.lastError) {
                    handleMagnetLink(details.url, tab);
                }
            });
        }
    }
});

// Listen for navigation events to intercept magnet links
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Check if this might be a magnet link or redirect to magnet link
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
    
    const mightBeMagnetRedirect = !isSearchEngine && (
        details.url.includes('magnet') ||
        details.url.includes('btih') ||
        details.url.includes('torrent') ||
        details.url.match(/\/[a-fA-F0-9]{40}/) // Hash pattern
    );
    
    // Only handle main frame navigation (not iframes)
    if (details.frameId === 0 && (isMagnetDirect || mightBeMagnetRedirect || extractedMagnetUrl)) {
        // Prevent the navigation
        chrome.tabs.update(details.tabId, { url: 'about:blank' }, (tab) => {
            if (chrome.runtime.lastError) {
                // Fallback method
                chrome.tabs.update(details.tabId, { url: 'javascript:void(0);' });
            }
        });
        
        // Handle the magnet link
        if (isMagnetDirect) {
            chrome.tabs.get(details.tabId, (tab) => {
                if (!chrome.runtime.lastError) {
                    handleMagnetLink(details.url, tab);
                }
            });
        } else if (extractedMagnetUrl) {
            chrome.tabs.get(details.tabId, (tab) => {
                if (!chrome.runtime.lastError) {
                    handleMagnetLink(extractedMagnetUrl, tab);
                }
            });
        }
        // If it's mightBeMagnetRedirect, we wait for onErrorOccurred to catch the actual magnet URL
    }
});

// Listen for tab updates to catch magnet links in address bar
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.startsWith('magnet:')) {
        // Prevent the navigation by redirecting to about:blank
        chrome.tabs.update(tabId, { url: 'about:blank' });
        
        // Handle the magnet link
        handleMagnetLink(changeInfo.url, tab);
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
        case 'checkShouldStartPolling':
            checkShouldStartPolling(sendResponse);
            return true; // Keep channel open for async response
        default:
            break;
    }
    return true;
});

// Handle magnet link interception
async function handleMagnetLink(magnetUrl, tab, sendResponse = null) {
    try {
        // Check if this magnet link has already been processed
        if (openListData.processedMagnets.has(magnetUrl)) {
            showNotification('Info', 'This magnet link has already been added');
            if (sendResponse) {
                sendResponse({ success: false, error: 'This magnet link has already been added' });
            }
            return;
        }
        
        // Get auth token
        const token = await getAuthToken();
        if (!token) {
            const settings = await getSettings();
            const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
            showNotification('Error', `Please login to ${apiEndpoint} first`);
            if (sendResponse) {
                sendResponse({ success: false, error: `Please login to ${apiEndpoint} first` });
            }
            return;
        }

        // Get current settings
        const settings = await getSettings();
        
        // Add to offline downloads
        const result = await addOfflineDownload([magnetUrl], settings, null, token);
        
        if (result.success) {
            // Mark this magnet link as processed
            openListData.processedMagnets.add(magnetUrl);
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
            showNotification('Error', result.error || 'Failed to add download');
            if (sendResponse) {
                sendResponse({ success: false, error: result.error || 'Failed to add download' });
            }
        }
        
    } catch (error) {
        showNotification('Error', 'Failed to process magnet link');
        if (sendResponse) {
            sendResponse({ success: false, error: 'Failed to process magnet link: ' + error.message });
        }
    }
}

// Get authentication token from localStorage
async function getAuthToken(sendResponse = null) {
    try {
        // Get settings to determine the correct domain
        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        const domain = new URL(apiEndpoint).hostname;
        
        // Query the active tab to get access to localStorage
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url || !tab.url.includes(domain)) {
            // If not on the target domain, try to find any tab with that domain
            const domainTabs = await chrome.tabs.query({ url: `https://${domain}/*` });
            if (domainTabs.length === 0) {
                const error = `Please open ${apiEndpoint} in a tab first`;
                if (sendResponse) {
                    sendResponse({ token: null, error });
                }
                return null;
            }
            // Use the first domain tab found
            const targetTab = domainTabs[0];
            
            // Execute script to get token from localStorage
            const results = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: () => {
                    return localStorage.getItem('token');
                }
            });
            
            const token = results[0]?.result || null;
            
            if (sendResponse) {
                sendResponse({ token });
            }
            
            return token;
        } else {
            // Current tab is on the target domain, get token directly
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    return localStorage.getItem('token');
                }
            });
            
            const token = results[0]?.result || null;
            
            if (sendResponse) {
                sendResponse({ token });
            }
            
            return token;
        }
    } catch (error) {
        console.error('Error getting auth token from localStorage:', error);
        if (sendResponse) {
            sendResponse({ token: null, error: error.message });
        }
        return null;
    }
}

// Clear invalid token from localStorage
async function clearInvalidToken() {
    try {
        // Get settings to determine the correct domain
        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        const domain = new URL(apiEndpoint).hostname;
        
        // Try to find any tab with the target domain to clear the token
        const domainTabs = await chrome.tabs.query({ url: `https://${domain}/*` });
        
        if (domainTabs.length > 0) {
            // Clear token from the first domain tab found
            await chrome.scripting.executeScript({
                target: { tabId: domainTabs[0].id },
                func: () => {
                    localStorage.removeItem('token');
                }
            });
        }
    } catch (error) {
        // Silently handle errors
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
            const settings = await getSettings();
            const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
            const error = `No authentication token found. Please login to ${apiEndpoint}`;
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


        const response = await fetch(`${settings.apiEndpoint}/api/fs/add_offline_download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (response.ok && data.code === 200) {
            // Mark URLs as processed
            urls.forEach(url => openListData.processedMagnets.add(url));
            
            // Store download info
            const downloadId = Date.now().toString();
            openListData.downloads.set(downloadId, {
                id: downloadId,
                urls: urls,
                timestamp: new Date().toISOString(),
                status: 'added',
                tasks: data.data.tasks || []
            });

            const result = { success: true, data: data.data };
            if (sendResponse) sendResponse(result);
            return result;
        } else {
            // Handle 401 unauthorized - clear invalid token
            if (data.code === 401 && data.message && data.message.includes('Password has been changed')) {
                await clearInvalidToken();
            }
            
            const error = data.message || `HTTP ${response.status}: ${response.statusText}`;
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

// Update settings in storage
async function updateSettings(newSettings, sendResponse = null) {
    try {
        const updatedSettings = { ...openListData.settings, ...newSettings };
        await chrome.storage.local.set({ openListSettings: updatedSettings });
        openListData.settings = updatedSettings;
        
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
        
        if (!token) {
            const settings = await getSettings();
            const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
            const error = `No authentication token found. Please login to ${apiEndpoint}`;
            if (sendResponse) sendResponse({ success: false, error });
            return { success: false, error };
        }
        
        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        
        const response = await fetch(`${apiEndpoint}/api/task/offline_download/cancel?tid=${encodeURIComponent(taskId)}`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.code === 200) {
            const responseData = {
                success: true,
                message: 'Task cancelled successfully'
            };
            if (sendResponse) sendResponse(responseData);
            return responseData;
        } else {
            // Handle 401 unauthorized - clear invalid token
            if (result.code === 401 && result.message && result.message.includes('Password has been changed')) {
                await clearInvalidToken();
            }
            
            const error = result.message || 'Failed to cancel task';
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

// Check if polling should start - combines flag check and API query
async function checkShouldStartPolling(sendResponse = null) {
    try {
        // First check if flag is already set
        if (openListData.shouldStartPolling) {
            openListData.shouldStartPolling = false; // Reset flag after checking
            if (sendResponse) {
                sendResponse({ shouldStartPolling: true });
            }
            return;
        }
        
        // If flag not set, check API for ongoing downloads
        const token = await getAuthToken();
        if (!token) {
            if (sendResponse) {
                sendResponse({ shouldStartPolling: false, error: 'No auth token' });
            }
            return;
        }

        // Get current settings
        const settings = await getSettings();
        const apiEndpoint = settings.apiEndpoint || 'https://open.lan';
        
        // Check for ongoing downloads
        const response = await fetch(`${apiEndpoint}/api/task/offline_download/undone`, {
            method: 'GET',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.code === 200) {
            const downloads = result.data || [];
            const hasDownloads = downloads.length > 0;
            
            if (sendResponse) {
                sendResponse({
                    shouldStartPolling: hasDownloads,
                    downloadsCount: downloads.length
                });
            }
        } else {
            // Handle 401 unauthorized - clear invalid token
            if (result.code === 401 && result.message && result.message.includes('Password has been changed')) {
                await clearInvalidToken();
            }
            
            if (sendResponse) {
                sendResponse({ shouldStartPolling: false, error: result.message });
            }
        }
    } catch (error) {
        if (sendResponse) {
            sendResponse({ shouldStartPolling: false, error: error.message });
        }
    }
}