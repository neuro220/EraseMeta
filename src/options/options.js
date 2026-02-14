import settingsCache from '../utils/settingsCache.js'

// UI State
const uiState = {
    elements: null,
    tabs: null,
    tabContents: null,
    activeTab: 'general',
    saveDebounceTimer: null,
    pendingSaves: new Map(),
    isLoading: true
};

// Initialize immediately
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadDataAsync();
});

function initUI() {
    // Cache DOM elements once
    uiState.elements = {
        // General settings
        autoCleanUploads: document.getElementById('autoCleanUploads'),
        blockOnError: document.getElementById('blockOnError'),
        cleanDownloads: document.getElementById('cleanDownloads'),
        debugMode: document.getElementById('debugMode'),
        
        // Metadata settings
        removeGPS: document.getElementById('removeGPS'),
        removeCamera: document.getElementById('removeCamera'),
        removeTimestamp: document.getElementById('removeTimestamp'),
        removeAuthor: document.getElementById('removeAuthor'),
        removeSoftware: document.getElementById('removeSoftware'),
        removeDocAuthor: document.getElementById('removeDocAuthor'),
        removeDocTitle: document.getElementById('removeDocTitle'),
        removeDocDate: document.getElementById('removeDocDate'),
        
        // Sites settings
        siteListMode: document.getElementById('siteListMode'),
        siteList: document.getElementById('siteList'),
        
        // Stats elements
        totalFiles: document.getElementById('totalFiles'),
        storageSaved: document.getElementById('storageSaved'),
        imagesCleaned: document.getElementById('imagesCleaned'),
        videosCleaned: document.getElementById('videosCleaned'),
        docsCleaned: document.getElementById('docsCleaned'),
        audioCleaned: document.getElementById('audioCleaned'),
        gpsRemoved: document.getElementById('gpsRemoved'),
        authorRemoved: document.getElementById('authorRemoved'),
        cameraRemoved: document.getElementById('cameraRemoved'),
        timestampRemoved: document.getElementById('timestampRemoved')
    };
    
    uiState.tabs = document.querySelectorAll('.tab');
    uiState.tabContents = document.querySelectorAll('.tab-content');
    
    // Find initially active tab from DOM
    const activeTabEl = document.querySelector('.tab.active');
    if (activeTabEl) {
        uiState.activeTab = activeTabEl.dataset.tab;
    }
    
    // Setup tabs immediately
    setupTabs();
    
    // Setup event listeners
    setupEventListeners();
    
    // Show loading state
    showLoadingState();
}

function showLoadingState() {
    // Disable all inputs while loading (but not buttons/tabs)
    Object.values(uiState.elements).forEach(el => {
        if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
            el.disabled = true;
        }
    });
    
    // Ensure tabs are never disabled
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.disabled = false;
    });
}

function enableInputs() {
    Object.values(uiState.elements).forEach(el => {
        if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
            el.disabled = false;
        }
    });
}

async function loadDataAsync() {
    try {
        // Load everything in parallel
        const [settingsData, statsData] = await Promise.all([
            loadSettingsData(),
            loadStatsData()
        ]);
        
        // Batch DOM updates
        requestAnimationFrame(() => {
            applySettings(settingsData);
            applyStats(statsData);
            enableInputs();
        });
        
    } catch (error) {
        console.error('Failed to load data:', error);
        showToast('Failed to load settings');
    } finally {
        uiState.isLoading = false;
    }
}

async function loadSettingsData() {
    return await settingsCache.get({
        autoCleanUploads: true,
        blockOnError: false,
        cleanDownloads: true,
        debugMode: false,
        removeGPS: true,
        removeCamera: true,
        removeTimestamp: false,
        removeAuthor: true,
        removeSoftware: true,
        removeDocAuthor: true,
        removeDocTitle: false,
        removeDocDate: false,
        siteListMode: 'none',
        siteList: []
    });
}

async function loadStatsData() {
    return await settingsCache.get({
        statsFilesCleaned: 0,
        stats: {
            totalFilesCleaned: 0,
            filesByType: { images: 0, videos: 0, documents: 0, audio: 0 },
            metadataRemoved: { gps: 0, author: 0, camera: 0, timestamp: 0 },
            storageSaved: 0
        }
    });
}

function applySettings(items) {
    const { elements } = uiState;
    
    // General settings
    elements.autoCleanUploads.checked = items.autoCleanUploads;
    elements.blockOnError.checked = items.blockOnError;
    elements.cleanDownloads.checked = items.cleanDownloads;
    elements.debugMode.checked = items.debugMode;
    
    // Metadata settings
    elements.removeGPS.checked = items.removeGPS;
    elements.removeCamera.checked = items.removeCamera;
    elements.removeTimestamp.checked = items.removeTimestamp;
    elements.removeAuthor.checked = items.removeAuthor;
    elements.removeSoftware.checked = items.removeSoftware;
    elements.removeDocAuthor.checked = items.removeDocAuthor;
    elements.removeDocTitle.checked = items.removeDocTitle;
    elements.removeDocDate.checked = items.removeDocDate;
    
    // Sites settings
    elements.siteListMode.value = items.siteListMode;
    elements.siteList.value = items.siteList.join('\n');
}

function applyStats(items) {
    const { elements } = uiState;
    const stats = items.stats;
    
    elements.totalFiles.textContent = items.statsFilesCleaned.toLocaleString();
    elements.storageSaved.textContent = formatBytes(stats.storageSaved);
    elements.imagesCleaned.textContent = stats.filesByType.images.toLocaleString();
    elements.videosCleaned.textContent = stats.filesByType.videos.toLocaleString();
    elements.docsCleaned.textContent = stats.filesByType.documents.toLocaleString();
    elements.audioCleaned.textContent = stats.filesByType.audio.toLocaleString();
    elements.gpsRemoved.textContent = stats.metadataRemoved.gps.toLocaleString();
    elements.authorRemoved.textContent = stats.metadataRemoved.author.toLocaleString();
    elements.cameraRemoved.textContent = stats.metadataRemoved.camera.toLocaleString();
    elements.timestampRemoved.textContent = stats.metadataRemoved.timestamp.toLocaleString();
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    console.log('Switching to tab:', tabId);
    if (uiState.activeTab === tabId) return;
    
    // Get fresh references
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    // Remove active from all
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    
    // Add active to target
    const targetTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const targetContent = document.getElementById(tabId);
    
    if (targetTab && targetContent) {
        targetTab.classList.add('active');
        targetContent.classList.add('active');
        uiState.activeTab = tabId;
        console.log('Tab switched successfully');
    } else {
        console.error('Could not find tab or content:', tabId);
    }
}

// Make globally accessible for inline handlers
window.switchTab = switchTab;

function setupEventListeners() {
    const { elements } = uiState;
    
    // Debounced save for all settings
    const queueSave = (key, value) => {
        uiState.pendingSaves.set(key, value);
        
        if (uiState.saveDebounceTimer) {
            clearTimeout(uiState.saveDebounceTimer);
        }
        
        uiState.saveDebounceTimer = setTimeout(() => {
            flushPendingSaves();
        }, 500);
    };
    
    // General settings
    elements.autoCleanUploads.addEventListener('change', (e) => queueSave('autoCleanUploads', e.target.checked));
    elements.blockOnError.addEventListener('change', (e) => queueSave('blockOnError', e.target.checked));
    elements.cleanDownloads.addEventListener('change', (e) => queueSave('cleanDownloads', e.target.checked));
    elements.debugMode.addEventListener('change', (e) => queueSave('debugMode', e.target.checked));
    
    // Metadata settings
    elements.removeGPS.addEventListener('change', (e) => queueSave('removeGPS', e.target.checked));
    elements.removeCamera.addEventListener('change', (e) => queueSave('removeCamera', e.target.checked));
    elements.removeTimestamp.addEventListener('change', (e) => queueSave('removeTimestamp', e.target.checked));
    elements.removeAuthor.addEventListener('change', (e) => queueSave('removeAuthor', e.target.checked));
    elements.removeSoftware.addEventListener('change', (e) => queueSave('removeSoftware', e.target.checked));
    elements.removeDocAuthor.addEventListener('change', (e) => queueSave('removeDocAuthor', e.target.checked));
    elements.removeDocTitle.addEventListener('change', (e) => queueSave('removeDocTitle', e.target.checked));
    elements.removeDocDate.addEventListener('change', (e) => queueSave('removeDocDate', e.target.checked));
    
    // Sites settings
    elements.siteListMode.addEventListener('change', (e) => queueSave('siteListMode', e.target.value));
    
    document.getElementById('saveSiteList').addEventListener('click', saveSiteList);
    document.getElementById('clearSiteList').addEventListener('click', clearSiteList);
    document.getElementById('exportStats').addEventListener('click', exportStats);
    document.getElementById('clearStats').addEventListener('click', clearStats);
}

async function flushPendingSaves() {
    if (uiState.pendingSaves.size === 0) return;
    
    const saves = Object.fromEntries(uiState.pendingSaves);
    uiState.pendingSaves.clear();
    
    try {
        await settingsCache.set(saves);
        showToast('Settings saved');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Failed to save settings');
    }
}

async function saveSiteList() {
    const { elements } = uiState;
    
    const siteListText = elements.siteList.value;
    const siteList = siteListText
        .split('\n')
        .map(site => site.trim())
        .filter(site => site.length > 0);
    
    try {
        await settingsCache.set({ siteList });
        showToast('Site list saved');
    } catch (error) {
        showToast('Failed to save site list');
    }
}

async function clearSiteList() {
    const { elements } = uiState;
    
    elements.siteList.value = '';
    
    try {
        await settingsCache.set({ siteList: [] });
        showToast('Site list cleared');
    } catch (error) {
        showToast('Failed to clear site list');
    }
}

async function exportStats() {
    try {
        const items = await settingsCache.get({
            statsFilesCleaned: 0,
            stats: {
                totalFilesCleaned: 0,
                filesByType: { images: 0, videos: 0, documents: 0, audio: 0 },
                metadataRemoved: { gps: 0, author: 0, camera: 0, timestamp: 0 },
                storageSaved: 0,
                sitesCleanedOn: {},
                lastCleaned: null
            }
        });
        
        const exportData = {
            exportDate: new Date().toISOString(),
            totalFilesCleaned: items.statsFilesCleaned,
            detailedStats: items.stats
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `erasemeta-stats-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showToast('Statistics exported');
    } catch (error) {
        showToast('Failed to export statistics');
    }
}

async function clearStats() {
    if (!confirm('Are you sure you want to clear all statistics? This cannot be undone.')) {
        return;
    }
    
    try {
        await settingsCache.set({
            statsFilesCleaned: 0,
            stats: {
                totalFilesCleaned: 0,
                filesByType: { images: 0, videos: 0, documents: 0, audio: 0 },
                metadataRemoved: { gps: 0, author: 0, camera: 0, timestamp: 0 },
                storageSaved: 0,
                sitesCleanedOn: {},
                lastCleaned: null
            }
        });
        
        // Reload stats
        const statsData = await loadStatsData();
        applyStats(statsData);
        
        showToast('Statistics cleared');
    } catch (error) {
        showToast('Failed to clear statistics');
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Toast notification
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
