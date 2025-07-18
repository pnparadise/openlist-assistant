document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const connectionStatus = document.getElementById('connection-status');
    const tokenStatus = document.getElementById('token-status');
    const refreshBtn = document.getElementById('refresh-btn');
    const manualUrl = document.getElementById('manual-url');
    const manualDownloadBtn = document.getElementById('manual-download-btn');
    const apiEndpoint = document.getElementById('api-endpoint');
    const downloadPath = document.getElementById('download-path');
    const downloadTool = document.getElementById('download-tool');
    const deletePolicy = document.getElementById('delete-policy');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const downloadsList = document.getElementById('downloads-list');
    const refreshDownloadsBtn = document.getElementById('refresh-downloads-btn');
    const resultDisplay = document.getElementById('result-display');
    const currentUrl = document.getElementById('current-url');
    const magnetCount = document.getElementById('magnet-count');

    // Page navigation elements
    const mainPage = document.getElementById('main-page');
    const manualPage = document.getElementById('manual-page');
    const settingsPage = document.getElementById('settings-page');
    const manualPageBtn = document.getElementById('manual-page-btn');
    const settingsPageBtn = document.getElementById('settings-page-btn');
    const backFromManualBtn = document.getElementById('back-from-manual');
    const backFromSettingsBtn = document.getElementById('back-from-settings');

    // Polling variables
    let ongoingDownloadsInterval = null;
    let lastOngoingDownloadsCount = 0;
    let shouldPoll = false;
    
    // Speed calculation tracking
    let downloadSpeedTracker = new Map(); // taskId -> { lastBytes, lastTime, speeds }

    // Initialize popup
    init();

    async function init() {
        await loadSettings();
        await updateCurrentUrl();
        await checkConnectionStatus();
        await loadDownloads();
        await countMagnetLinks();
        await checkShouldStartPolling();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Existing event listeners
        refreshBtn.addEventListener('click', handleRefresh);
        manualDownloadBtn.addEventListener('click', handleManualDownload);
        saveSettingsBtn.addEventListener('click', handleSaveSettings);
        refreshDownloadsBtn.addEventListener('click', loadDownloads);

        // Page navigation event listeners
        manualPageBtn.addEventListener('click', () => showPage('manual'));
        settingsPageBtn.addEventListener('click', () => showPage('settings'));
        backFromManualBtn.addEventListener('click', () => showPage('main'));
        backFromSettingsBtn.addEventListener('click', () => showPage('main'));

        // Event delegation for cancel buttons
        downloadsList.addEventListener('click', handleDownloadListClick);
    }

    function showPage(pageName) {
        // Hide all pages
        mainPage.classList.remove('active');
        manualPage.classList.remove('active');
        settingsPage.classList.remove('active');

        // Show selected page
        switch(pageName) {
            case 'main':
                mainPage.classList.add('active');
                break;
            case 'manual':
                manualPage.classList.add('active');
                break;
            case 'settings':
                settingsPage.classList.add('active');
                break;
        }
    }

    function handleDownloadListClick(event) {
        if (event.target.classList.contains('download-cancel')) {
            const taskId = event.target.getAttribute('data-task-id');
            if (taskId) {
                cancelDownload(taskId);
            }
        }
    }

    async function loadSettings() {
        try {
            if (!chrome.runtime?.id) {
                console.log('Extension context invalidated');
                return;
            }

            const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError.message);
                return;
            }

            if (response && response.settings) {
                const settings = response.settings;
                apiEndpoint.value = settings.apiEndpoint || 'https://open.lan';
                downloadPath.value = settings.defaultPath || '/';
                downloadTool.value = settings.defaultTool || 'aria2';
                deletePolicy.value = settings.deletePolicy || 'delete_on_upload_succeed';
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            if (!error.message?.includes('Extension context invalidated')) {
                showResult('Error loading settings', 'error');
            }
        }
    }

    async function updateCurrentUrl() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const url = new URL(tab.url);
                currentUrl.textContent = url.hostname;
            }
        } catch (error) {
            console.error('Error getting current URL:', error);
            currentUrl.textContent = 'Error';
        }
    }

    async function checkConnectionStatus() {
        try {
            if (!chrome.runtime?.id) {
                tokenStatus.textContent = 'Reload';
                tokenStatus.className = 'status-indicator disconnected';
                connectionStatus.textContent = 'Reload';
                connectionStatus.className = 'status-indicator disconnected';
                refreshBtn.style.display = 'block';
                return;
            }

            // Check auth token
            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAuthToken' });
            
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError.message);
                tokenStatus.textContent = 'Error';
                tokenStatus.className = 'status-indicator disconnected';
                connectionStatus.textContent = 'Error';
                connectionStatus.className = 'status-indicator disconnected';
                refreshBtn.style.display = 'block';
                return;
            }
            
            if (tokenResponse && tokenResponse.token) {
                tokenStatus.textContent = 'Valid';
                tokenStatus.className = 'status-indicator connected';
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'status-indicator connected';
                refreshBtn.style.display = 'none';
            } else {
                tokenStatus.textContent = 'Missing';
                tokenStatus.className = 'status-indicator disconnected';
                connectionStatus.textContent = 'Disabled';
                connectionStatus.className = 'status-indicator disconnected';
                refreshBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('Error checking connection:', error);
            if (!error.message?.includes('Extension context invalidated')) {
                tokenStatus.textContent = 'Error';
                tokenStatus.className = 'status-indicator disconnected';
                connectionStatus.textContent = 'Error';
                connectionStatus.className = 'status-indicator disconnected';
                refreshBtn.style.display = 'block';
            }
        }
    }

    async function handleRefresh() {
        try {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            
            // Refresh token
            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAuthToken' });
            
            // Clear cache
            await chrome.runtime.sendMessage({ action: 'clearProcessedMagnets' });
            
            if (tokenResponse && tokenResponse.token) {
                showResult('Refreshed successfully', 'success');
                await checkConnectionStatus();
                
                // Reload downloads and check if polling should start
                await loadDownloads();
            } else {
                const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
                const apiEndpoint = settings.settings?.apiEndpoint || 'https://open.lan';
                showResult(`No token found. Please login to ${apiEndpoint}`, 'error');
            }
        } catch (error) {
            console.error('Error refreshing:', error);
            showResult('Error refreshing', 'error');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
        }
    }

    async function handleManualDownload() {
        try {
            const magnetUrl = manualUrl.value.trim();
            
            if (!magnetUrl) {
                showResult('Please enter a magnet URL', 'error');
                return;
            }
            
            if (!magnetUrl.startsWith('magnet:')) {
                showResult('Invalid magnet URL format', 'error');
                return;
            }
            
            manualDownloadBtn.disabled = true;
            manualDownloadBtn.textContent = 'Adding...';
            
            const settings = {
                apiEndpoint: apiEndpoint.value,
                defaultPath: downloadPath.value,
                defaultTool: downloadTool.value,
                deletePolicy: deletePolicy.value
            };
            
            const response = await chrome.runtime.sendMessage({
                action: 'addOfflineDownload',
                urls: [magnetUrl],
                settings: settings
            });
            
            if (response && response.success) {
                showResult('Download added successfully', 'success');
                manualUrl.value = '';
                shouldPoll = true;
                startOngoingDownloadsPolling();
                await loadDownloads();
                // Auto-navigate back to main page after successful download
                setTimeout(() => showPage('main'), 1500);
            } else {
                showResult(`Failed to add download: ${response.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error adding manual download:', error);
            showResult('Error adding download', 'error');
        } finally {
            manualDownloadBtn.disabled = false;
            manualDownloadBtn.textContent = 'Add to Downloads';
        }
    }

    async function handleSaveSettings() {
        try {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = 'Saving...';
            
            const settings = {
                apiEndpoint: apiEndpoint.value,
                defaultPath: downloadPath.value,
                defaultTool: downloadTool.value,
                deletePolicy: deletePolicy.value
            };
            
            const response = await chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: settings
            });
            
            if (response && response.success) {
                showResult('Settings saved successfully', 'success');
                // Auto-navigate back to main page after successful save
                setTimeout(() => showPage('main'), 1500);
            } else {
                showResult(`Failed to save settings: ${response.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showResult('Error saving settings', 'error');
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = 'Save Settings';
        }
    }

    async function loadDownloads() {
        try {
            if (!chrome.runtime?.id) {
                downloadsList.innerHTML = '<div class="no-downloads">Extension context invalid</div>';
                stopOngoingDownloadsPolling();
                return;
            }

            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAuthToken' });
            if (!tokenResponse || !tokenResponse.token) {
                const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
                const apiEndpoint = settings.settings?.apiEndpoint || 'https://open.lan';
                downloadsList.innerHTML = `<div class="no-downloads">Please login to ${apiEndpoint}</div>`;
                stopOngoingDownloadsPolling();
                return;
            }

            // Load ongoing downloads directly from API
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            const apiEndpoint = settings.settings?.apiEndpoint || 'https://open.lan';
            
            const response = await fetch(`${apiEndpoint}/api/task/offline_download/undone`, {
                method: 'GET',
                headers: {
                    'Authorization': tokenResponse.token,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.code === 200) {
                const downloads = result.data || [];
                
                // Sort downloads by creation time (newest first)
                downloads.sort((a, b) => {
                    const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
                    const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
                    return timeB - timeA; // Descending order (newest first)
                });
                
                displayDownloads(downloads);
                lastOngoingDownloadsCount = downloads.length;
                
                // Auto-start polling if there are downloads and polling is not already active
                const hasDownloads = downloads.length > 0;
                
                if (hasDownloads && !shouldPoll && !ongoingDownloadsInterval) {
                    console.log('Found downloads, starting polling automatically');
                    shouldPoll = true;
                    startOngoingDownloadsPolling();
                } else if (!hasDownloads && shouldPoll) {
                    // No downloads found, stop polling and reset variables
                    console.log('No downloads found, stopping polling');
                    stopOngoingDownloadsPolling();
                }
            } else {
                // Handle 401 unauthorized - token is invalid
                if (result.code === 401 && result.message && result.message.includes('Password has been changed')) {
                    console.log('401 error detected in loadDownloads, token is invalid');
                    const domain = new URL(apiEndpoint).hostname;
                    downloadsList.innerHTML = `<div class="no-downloads">Please login to ${domain} again</div>`;
                    // Update only token status - connection is still working since we got a response
                    tokenStatus.textContent = 'Invalid';
                    tokenStatus.className = 'status-indicator disconnected';
                    connectionStatus.textContent = 'Connected';
                    connectionStatus.className = 'status-indicator connected';
                    refreshBtn.style.display = 'block';
                } else {
                    downloadsList.innerHTML = '<div class="no-downloads">Error loading downloads</div>';
                }
                shouldPoll = false;
                lastOngoingDownloadsCount = 0;
                stopOngoingDownloadsPolling();
            }
        } catch (error) {
            console.error('Error loading downloads:', error);
            downloadsList.innerHTML = '<div class="no-downloads">Error loading downloads</div>';
            stopOngoingDownloadsPolling();
        }
    }

    function displayDownloads(downloads) {
        if (downloads.length === 0) {
            downloadsList.innerHTML = '<div class="no-downloads">No downloads</div>';
            // Clear speed tracker for completed/removed downloads
            downloadSpeedTracker.clear();
            return;
        }
        
        // Clean up speed tracker for downloads that are no longer active
        const activeTaskIds = new Set(downloads.map(d => d.id));
        for (const taskId of downloadSpeedTracker.keys()) {
            if (!activeTaskIds.has(taskId)) {
                downloadSpeedTracker.delete(taskId);
            }
        }
        
        const downloadItems = downloads.map(download => {
            const startTime = download.start_time ? new Date(download.start_time).toLocaleString() : 'Not started';
            const progress = download.progress || 0;
            const totalBytes = download.total_bytes || 0;
            const speed = calculateDownloadSpeed(download);
            const formattedBytes = formatBytes(totalBytes);
            
            // Calculate downloaded bytes for display
            const downloadedBytes = (totalBytes * progress) / 100;
            const downloadedFormatted = formatBytes(downloadedBytes);
            const sizeDisplay = totalBytes > 0 ? `${downloadedFormatted} / ${formattedBytes}` : formattedBytes;
            
            return `
                <div class="download-item">
                    <div class="download-name" title="${download.name}">
                        <span>${download.name}</span>
                        <button class="download-cancel" data-task-id="${download.id}">Cancel</button>
                    </div>
                    <div class="download-info">
                        <div>${startTime}</div>
                        <div class="download-speed">${speed}</div>
                    </div>
                    <div class="download-progress">
                        <div class="download-progress-bar" style="width: ${progress}%"></div>
                    </div>
                    <div class="download-status">
                        <div class="download-size">${sizeDisplay}</div>
                        <div class="download-state ${download.state}">${progress.toFixed(1)}%</div>
                    </div>
                </div>
            `;
        }).join('');
        
        downloadsList.innerHTML = downloadItems;
    }

    async function countMagnetLinks() {
        try {
            if (!chrome.runtime?.id) {
                magnetCount.textContent = '0 magnets';
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                magnetCount.textContent = '0 magnets';
                return;
            }

            // Check if tab supports content scripts (not chrome:// or extension pages)
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
                magnetCount.textContent = 'N/A';
                return;
            }

            try {
                // Use scripting API to count magnet links on the page
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const magnetLinks = document.querySelectorAll('a[href^="magnet:"]');
                        const magnetRegex = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40,}/;
                        let count = 0;
                        
                        magnetLinks.forEach(link => {
                            if (magnetRegex.test(link.href)) {
                                count++;
                            }
                        });
                        
                        // Also check for magnet links in text content
                        const textContent = document.body.textContent || '';
                        const textMatches = textContent.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{40,}/g);
                        if (textMatches) {
                            count += textMatches.length;
                        }
                        
                        return count;
                    }
                });
                
                const count = results[0]?.result || 0;
                magnetCount.textContent = count === 1 ? '1 magnet' : `${count} magnets`;
            } catch (scriptError) {
                console.error('Error executing script to count magnet links:', scriptError);
                magnetCount.textContent = 'N/A';
            }
        } catch (error) {
            console.error('Error counting magnet links:', error);
            magnetCount.textContent = '0 magnets';
        }
    }

    function showResult(message, type) {
        resultDisplay.className = `result-display ${type}`;
        resultDisplay.textContent = message;
        resultDisplay.style.display = 'block';
        
        // Auto-hide after 3 seconds for better UX
        setTimeout(() => {
            resultDisplay.style.display = 'none';
        }, 3000);
    }


    // Calculate real-time download speed
    function calculateDownloadSpeed(download) {
        // Only show speed for downloads with progress and total bytes
        if (!download.total_bytes || download.progress === 0) {
            return '-';
        }
        
        const taskId = download.id;
        const currentBytes = (download.total_bytes * download.progress) / 100;
        const currentTime = Date.now();
        
        // Get or create tracker for this download
        if (!downloadSpeedTracker.has(taskId)) {
            downloadSpeedTracker.set(taskId, {
                lastBytes: currentBytes,
                lastTime: currentTime,
                speeds: [] // Keep last few speed measurements for smoothing
            });
            return '-'; // Need at least 2 measurements
        }
        
        const tracker = downloadSpeedTracker.get(taskId);
        const timeDiff = (currentTime - tracker.lastTime) / 1000; // seconds
        const bytesDiff = currentBytes - tracker.lastBytes;
        
        // Calculate speed if enough time has passed (reduce to 0.5 seconds for faster response)
        if (timeDiff >= 0.5 && bytesDiff >= 0) {
            const speedBytesPerSecond = bytesDiff / timeDiff;
            
            // Add to speed history (keep last 3 measurements for smoothing)
            tracker.speeds.push(speedBytesPerSecond);
            if (tracker.speeds.length > 3) {
                tracker.speeds.shift();
            }
            
            // Update tracker
            tracker.lastBytes = currentBytes;
            tracker.lastTime = currentTime;
            
            // Calculate average speed for smoothing
            const avgSpeed = tracker.speeds.reduce((sum, speed) => sum + speed, 0) / tracker.speeds.length;
            
            return formatBytes(avgSpeed) + '/s';
        }
        
        // If we have previous speed measurements, return the latest average
        if (tracker.speeds.length > 0) {
            const avgSpeed = tracker.speeds.reduce((sum, speed) => sum + speed, 0) / tracker.speeds.length;
            return formatBytes(avgSpeed) + '/s';
        }
        
        return '-';
    }

    // Format bytes to human readable format
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Cancel download task
    async function cancelDownload(taskId) {
        try {
            const tokenResponse = await chrome.runtime.sendMessage({ action: 'getAuthToken' });
            if (!tokenResponse || !tokenResponse.token) {
                const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
                const apiEndpoint = settings.settings?.apiEndpoint || 'https://open.lan';
                const domain = new URL(apiEndpoint).hostname;
                showResult(`Please login to ${domain} first`, 'error');
                return;
            }

            // Show cancelling status
            showResult('Cancelling download...', 'info');

            const response = await chrome.runtime.sendMessage({
                action: 'cancelDownloadTask',
                taskId: taskId,
                token: tokenResponse.token
            });

            if (response && response.success) {
                showResult('Download cancelled successfully', 'success');
                
                // Immediately refresh the download list to reflect the cancellation
                await loadDownloads();
                
                // Clear speed tracker for cancelled download
                if (downloadSpeedTracker.has(taskId)) {
                    downloadSpeedTracker.delete(taskId);
                }
            } else {
                showResult(`Failed to cancel download: ${response.error || 'Unknown error'}`, 'error');
                // Still refresh to get the latest status
                await loadDownloads();
            }
        } catch (error) {
            console.error('Error cancelling download:', error);
            showResult('Error cancelling download', 'error');
            // Refresh even on error to get current status
            await loadDownloads();
        }
    }

    // Start polling for ongoing downloads
    function startOngoingDownloadsPolling() {
        // Don't start if we shouldn't poll
        if (!shouldPoll) {
            return;
        }

        // Clear any existing interval
        if (ongoingDownloadsInterval) {
            clearInterval(ongoingDownloadsInterval);
        }

        // Poll every 3 seconds
        ongoingDownloadsInterval = setInterval(async () => {
            await loadDownloads();
            
            // Stop polling if no ongoing downloads
            if (lastOngoingDownloadsCount === 0) {
                console.log('No ongoing downloads, stopping polling');
                shouldPoll = false;
                clearInterval(ongoingDownloadsInterval);
                ongoingDownloadsInterval = null;
            }
        }, 3000);
    }

    // Stop polling
    function stopOngoingDownloadsPolling() {
        shouldPoll = false;
        if (ongoingDownloadsInterval) {
            clearInterval(ongoingDownloadsInterval);
            ongoingDownloadsInterval = null;
        }
        lastOngoingDownloadsCount = 0;
    }

    // Check if polling should start (for when popup opens after download was triggered)
    async function checkShouldStartPolling() {
        try {
            if (!chrome.runtime?.id) {
                console.log('Extension context invalid, skipping polling check');
                return;
            }

            console.log('Checking if polling should start...');
            
            // Use the unified function that checks flag first, then API if needed
            const response = await chrome.runtime.sendMessage({ action: 'checkShouldStartPolling' });
            console.log('checkShouldStartPolling response:', response);
            
            if (response && response.shouldStartPolling) {
                console.log('Should start polling, starting now');
                shouldPoll = true;
                startOngoingDownloadsPolling();
            } else {
                console.log('No need to start polling');
            }
        } catch (error) {
            console.error('Error checking should start polling:', error);
        }
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startPolling') {
            shouldPoll = true;
            startOngoingDownloadsPolling();
            loadDownloads(); // Refresh immediately
        }
    });

    // Stop polling when popup closes
    window.addEventListener('beforeunload', () => {
        stopOngoingDownloadsPolling();
    });
});