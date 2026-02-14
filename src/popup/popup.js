import settingsCache from '../utils/settingsCache.js'

// UI State management
const uiState = {
    isLoading: true,
    elements: null,
    currentSiteInfo: null,
    saveDebounceTimer: null,
    settings: null
};

// Initialize immediately, don't wait for async operations
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadDataAsync();
});

function initUI() {
    // Get DOM elements once
    uiState.elements = {
        statsCount: document.getElementById('statsCount'),
        storageSaved: document.getElementById('storageSaved'),
        currentSite: document.getElementById('currentSite'),
        siteStatus: document.getElementById('siteStatus'),
        toggleSiteBtn: document.getElementById('toggleSiteBtn'),
        downloadToggle: document.getElementById('downloadToggle'),
        autoUploadToggle: document.getElementById('autoUploadToggle'),
        blockErrorToggle: document.getElementById('blockErrorToggle'),
        debugModeToggle: document.getElementById('debugModeToggle'),
        cleanClipboardBtn: document.getElementById('cleanClipboardBtn'),
        viewStatsBtn: document.getElementById('viewStatsBtn')
    };

    // Show loading state
    showLoadingState();
    
    // Setup event listeners immediately
    setupEventListeners();
}

function showLoadingState() {
    const { elements } = uiState;
    elements.currentSite.textContent = 'Loading...';
    elements.siteStatus.textContent = 'Checking...';
    elements.siteStatus.className = 'status-badge status-unknown';
    elements.toggleSiteBtn.disabled = true;
    elements.statsCount.textContent = '-';
    elements.storageSaved.textContent = 'Loading...';
}

function setupEventListeners() {
    const { elements } = uiState;
    
    // Debounced save for all toggles
    const debouncedSave = () => {
        if (uiState.saveDebounceTimer) {
            clearTimeout(uiState.saveDebounceTimer);
        }
        uiState.saveDebounceTimer = setTimeout(saveOptions, 300);
    };

    elements.downloadToggle.addEventListener('change', debouncedSave);
    elements.autoUploadToggle.addEventListener('change', debouncedSave);
    elements.blockErrorToggle.addEventListener('change', debouncedSave);
    elements.debugModeToggle.addEventListener('change', debouncedSave);
    
    console.log('Setting up toggleSiteBtn click listener');
    elements.toggleSiteBtn.addEventListener('click', () => {
        console.log('toggleSiteBtn clicked!');
        toggleCurrentSite();
    });
    elements.cleanClipboardBtn.addEventListener('click', cleanClipboard);
    elements.viewStatsBtn.addEventListener('click', viewStats);
}

async function loadDataAsync() {
    try {
        // Load settings and site status in parallel
        const [settingsResult, siteResult] = await Promise.allSettled([
            loadSettings(),
            loadSiteStatus()
        ]);

        if (settingsResult.status === 'fulfilled') {
            uiState.settings = settingsResult.value;
            applySettings(settingsResult.value);
        }

        if (siteResult.status === 'fulfilled') {
            uiState.currentSiteInfo = siteResult.value;
        }

    } catch (error) {
        console.error('Failed to load data:', error);
    } finally {
        uiState.isLoading = false;
    }
}

async function loadSettings() {
    const items = await settingsCache.get();
    return {
        cleanDownloads: items.cleanDownloads !== undefined ? items.cleanDownloads : true,
        autoCleanUploads: items.autoCleanUploads !== undefined ? items.autoCleanUploads : true,
        blockOnError: items.blockOnError || false,
        debugMode: items.debugMode || false,
        statsFilesCleaned: items.statsFilesCleaned || 0,
        stats: items.stats || {
            totalFilesCleaned: 0,
            storageSaved: 0
        }
    };
}

function applySettings(items) {
    const { elements } = uiState;
    
    // Batch DOM updates
    requestAnimationFrame(() => {
        elements.downloadToggle.checked = items.cleanDownloads;
        elements.autoUploadToggle.checked = items.autoCleanUploads;
        elements.blockErrorToggle.checked = items.blockOnError;
        elements.debugModeToggle.checked = items.debugMode;
        
        elements.statsCount.textContent = items.statsFilesCleaned.toLocaleString();
        
        const savedBytes = items.stats?.storageSaved || 0;
        elements.storageSaved.textContent = formatBytes(savedBytes) + ' metadata removed';
    });
}

async function loadSiteStatus() {
    console.log('loadSiteStatus called');
    const { elements } = uiState;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Got tab:', tab);
        
        if (!tab || !tab.url) {
            console.log('No tab or URL');
            updateSiteUI('N/A', 'Not available', 'status-unknown', true);
            return null;
        }

        try {
            console.log('Sending GetSiteStatus message to tab', tab.id);
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'GetSiteStatus' });
            console.log('Got response:', response);
            
            const isActive = response?.shouldClean;
            const isListed = response?.isListed;
            const mode = response?.siteListMode || 'none';
            
            let statusText, statusClass, btnText;
            
            if (mode === 'none') {
                // No list mode - auto-clean is global
                statusText = isActive ? 'Auto-clean ON' : 'Auto-clean OFF';
                statusClass = isActive ? 'status-active' : 'status-inactive';
                btnText = isActive ? 'Disable for this site' : 'Enable for this site';
            } else if (mode === 'whitelist') {
                // Whitelist mode
                statusText = isActive ? 'In whitelist' : 'Not in whitelist';
                statusClass = isActive ? 'status-active' : 'status-inactive';
                btnText = isListed ? 'Remove from whitelist' : 'Add to whitelist';
            } else {
                // Blacklist mode
                statusText = isActive ? 'Not blacklisted' : 'Blacklisted';
                statusClass = isActive ? 'status-active' : 'status-inactive';
                btnText = isListed ? 'Remove from blacklist' : 'Add to blacklist';
            }
            
            requestAnimationFrame(() => {
                elements.currentSite.textContent = response.hostname;
                elements.siteStatus.textContent = statusText;
                elements.siteStatus.className = `status-badge ${statusClass}`;
                elements.toggleSiteBtn.textContent = btnText;
                elements.toggleSiteBtn.disabled = false;
            });
            
            return response;
        } catch (e) {
            // Content script not loaded
            console.error('Error sending message to content script:', e);
            const hostname = new URL(tab.url).hostname;
            updateSiteUI(hostname || 'N/A', 'Limited access', 'status-unknown', true);
            return null;
        }
    } catch (e) {
        updateSiteUI('Error', 'Error', 'status-unknown', true);
        return null;
    }
}

function updateSiteUI(site, status, statusClass, disabled) {
    const { elements } = uiState;
    requestAnimationFrame(() => {
        elements.currentSite.textContent = site;
        elements.siteStatus.textContent = status;
        elements.siteStatus.className = `status-badge ${statusClass}`;
        elements.toggleSiteBtn.disabled = disabled;
    });
}

async function saveOptions() {
    const { elements } = uiState;
    
    const settings = {
        cleanDownloads: elements.downloadToggle.checked,
        autoCleanUploads: elements.autoUploadToggle.checked,
        blockOnError: elements.blockErrorToggle.checked,
        debugMode: elements.debugModeToggle.checked
    };
    
    try {
        await settingsCache.set(settings);
        showToast('Settings saved');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Failed to save settings');
    }
}

async function toggleCurrentSite() {
    console.log('toggleCurrentSite called');
    console.log('currentSiteInfo:', uiState.currentSiteInfo);
    console.log('isLoading:', uiState.isLoading);
    
    if (!uiState.currentSiteInfo || uiState.isLoading) {
        console.log('Early return - no site info or still loading');
        return;
    }
    
    const { elements } = uiState;
    const hostname = uiState.currentSiteInfo.hostname;
    
    if (!hostname) {
        console.error('No hostname available');
        showToast('Cannot add site: no hostname detected');
        return;
    }
    
    const currentMode = uiState.currentSiteInfo.siteListMode || 'none';
    const isCurrentlyListed = uiState.currentSiteInfo.isListed;
    
    console.log('hostname:', hostname);
    console.log('currentMode:', currentMode);
    console.log('isCurrentlyListed:', isCurrentlyListed);
    
    // Optimistic UI update
    elements.toggleSiteBtn.disabled = true;
    
    try {
        console.log('Fetching settings...');
        // Get all settings to ensure we have proper defaults
        const items = await settingsCache.get();
        console.log('Got settings:', items);
        
        let siteListMode = items.siteListMode || 'none';
        let siteList = [...(items.siteList || [])];
        
        console.log('siteListMode:', siteListMode);
        console.log('siteList:', siteList);
        
        const siteIndex = siteList.findIndex(site => {
            if (site.startsWith('*.')) {
                const domain = site.slice(2);
                return hostname.endsWith('.' + domain) || hostname === domain;
            }
            return hostname === site;
        });
        
        console.log('siteIndex:', siteIndex);
        
        if (siteIndex >= 0) {
            // Site is in list - remove it
            siteList.splice(siteIndex, 1);
            const listType = siteListMode === 'whitelist' ? 'whitelist' : 'blacklist';
            showToast(`Removed ${hostname} from ${listType}`);
        } else {
            // Site not in list - add it
            if (siteListMode === 'none') {
                // No mode set - default to blacklist for disabling sites
                siteListMode = 'blacklist';
            }
            siteList.push(hostname);
            const listType = siteListMode === 'whitelist' ? 'whitelist' : 'blacklist';
            showToast(`Added ${hostname} to ${listType}`);
        }
        
        console.log('Saving settings...', { siteListMode, siteList });
        await settingsCache.set({ siteListMode, siteList });
        console.log('Settings saved successfully');
        
        // Reload site status
        uiState.currentSiteInfo = await loadSiteStatus();
        
    } catch (error) {
        console.error('Failed to toggle site:', error);
        console.error('Error stack:', error.stack);
        showToast('Failed to update site list: ' + (error.message || 'Unknown error'));
        elements.toggleSiteBtn.disabled = false;
    }
}

async function cleanClipboard() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { type: 'CleanClipboard' });
            showToast('Clipboard cleaned');
        }
    } catch (e) {
        console.error('Failed to clean clipboard:', e);
        showToast('Failed to clean clipboard');
    }
}

function viewStats() {
    chrome.runtime.openOptionsPage();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Toast notification with cleanup
let toastTimeout = null;
function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
