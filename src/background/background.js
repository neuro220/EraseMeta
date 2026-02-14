import CleanUp from '../utils/cleanup.js';
import fileDict from '../utils/fileDict.js'
import { ChunkSender, ChunkReceiver } from '../utils/chunkManager.js'
import { initDownloadListener } from '../utils/downloadInterceptor.js';
import logger from '../utils/logger.js';


logger.init();


initDownloadListener();


function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return 'download';
    }
    
    
    try {
        filename = decodeURIComponent(filename);
    } catch (e) {
        
    }
    
    
    filename = filename.replace(/\x00/g, '');
    
    
    let sanitized = filename.split(/[/\\]/).pop();
    
    
    while (sanitized.includes('..')) {
        sanitized = sanitized.replace(/\.\./g, '');
    }
    
    
    sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
    
    
    sanitized = sanitized.replace(/^\.+/, '');
    
    
    sanitized = sanitized.replace(/[<>"|?*]/g, '');
    
    
    if (sanitized.length > 200) {
        const lastDot = sanitized.lastIndexOf('.');
        if (lastDot > 0) {
            const ext = sanitized.slice(lastDot);
            sanitized = sanitized.slice(0, 200 - ext.length) + ext;
        } else {
            sanitized = sanitized.slice(0, 200);
        }
    }
    
    
    if (!sanitized || sanitized.trim() === '') {
        return 'download';
    }
    
    
    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (reservedNames.test(sanitized.split('.')[0])) {
        sanitized = 'file_' + sanitized;
    }
    
    return sanitized;
}


async function showNotification(title, message) {
    try {
        await chrome.notifications.create({
            type: 'basic',
            iconUrl: '../../assets/icon-48.png',
            title: title,
            message: message
        });
    } catch (e) {
        logger.error('Failed to show notification:', e);
    }
}

function createMenu() {
    chrome.contextMenus.create({
        id: "parent",
        title: "Cleanup File and upload"
    })
    chrome.contextMenus.create({
        id: "browse",
        parentId: "parent",
        title: "Browse"
    })
    chrome.contextMenus.create({
        id: "dragUpload",
        parentId: "parent",
        title: "Upload by drag and drop"
    })

    
    chrome.contextMenus.create({
        id: "downloadClean",
        title: "Download clean version",
        contexts: ["image"]
    })
    
    
    chrome.contextMenus.create({
        id: "viewMetadata",
        title: "View metadata",
        contexts: ["image"]
    })
    chrome.contextMenus.create({
        id: "cleanAndCopy",
        title: "Clean and copy to clipboard",
        contexts: ["image"]
    })
}

async function setIndex(id) {
    
    if (!id || typeof id !== 'number' || id <= 0) {
        throw new Error("Invalid tab ID");
    }
    
    let res = await chrome.tabs.sendMessage(id, { type: "Index" })
    if (res) return res
    throw res
}

async function queryFiles(id) {
    let key = crypto.randomUUID()
    let cr = new ChunkReceiver(key)
    let res = cr.chunkRuntimeReceiveMessage()
    await chrome.tabs.sendMessage(id, { type: "QueryFiles", key })
    return Object.values(fileDict.multiRestore(await res))
}

async function sendResult(id, fileDicts) {
    let key = crypto.randomUUID()
    await chrome.tabs.sendMessage(id, { type: "Result", key })
    let cs = new ChunkSender(key, fileDicts)
    await cs.chunkTabSendMessage(id)
}

async function updateStats(count = 1, metadataInfo = {}) {
    let items = await chrome.storage.local.get({ 
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
    
    
    let newCount = items.statsFilesCleaned + count;
    
    
    const stats = items.stats;
    stats.totalFilesCleaned += count;
    stats.lastCleaned = new Date().toISOString();
    
    
    if (metadataInfo.removed) {
        for (const type of metadataInfo.removed) {
            if (stats.metadataRemoved[type] !== undefined) {
                stats.metadataRemoved[type]++;
            }
        }
    }
    
    
    if (metadataInfo.storageSaved) {
        stats.storageSaved += metadataInfo.storageSaved;
    }
    
    
    if (metadataInfo.fileType) {
        const typeMap = {
            'image': 'images',
            'video': 'videos',
            'document': 'documents',
            'audio': 'audio'
        };
        const category = typeMap[metadataInfo.fileType] || 'documents';
        stats.filesByType[category]++;
    }
    
    
    if (metadataInfo.site) {
        if (!stats.sitesCleanedOn[metadataInfo.site]) {
            stats.sitesCleanedOn[metadataInfo.site] = 0;
        }
        stats.sitesCleanedOn[metadataInfo.site]++;
    }
    
    await chrome.storage.local.set({ 
        statsFilesCleaned: newCount,
        stats: stats
    });

    
    chrome.action.setBadgeText({ text: newCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); 
}

// Process files with concurrency limit for better performance
async function processFilesWithConcurrency(files, id, concurrency = 3) {
    const fileDicts = [];
    let totalStorageSaved = 0;
    
    for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency);
        const results = await Promise.allSettled(
            batch.map(async file => {
                const cleanedResult = await CleanUp(id, file);
                if (cleanedResult?.data) {
                    const dict = await fileDict.compose(file, cleanedResult.data);
                    return { dict, storageSaved: cleanedResult.storageSaved || 0 };
                }
                return null;
            })
        );
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                fileDicts.push(result.value.dict);
                totalStorageSaved += result.value.storageSaved;
            }
        });
    }
    
    return { fileDicts, totalStorageSaved };
}

async function go(id) {
    await setIndex(id)
    let files = await queryFiles(id);
    
    
    let site = '';
    try {
        const tab = await chrome.tabs.get(id);
        if (tab.url) {
            site = new URL(tab.url).hostname;
        }
    } catch (e) {
        logger.warn('Could not get tab URL for stats');
    }
    
    // Process files with limited concurrency for better performance
    const { fileDicts, totalStorageSaved } = await processFilesWithConcurrency(files, id, 3);

    if (files.length > 0) {
        updateStats(files.length, { 
            site,
            storageSaved: totalStorageSaved
        });
    }

    sendResult(id, fileDicts)
}




if (chrome.contextMenus) {
    chrome.runtime.onInstalled.addListener(createMenu)
    chrome.runtime.onStartup.addListener(createMenu)

    
    chrome.commands.onCommand.addListener(async (command) => {
        logger.log('Command received:', command);
        
        switch (command) {
            case 'toggle-auto-clean': {
                const result = await chrome.storage.local.get({ autoCleanUploads: true });
                const newValue = !result.autoCleanUploads;
                await chrome.storage.local.set({ autoCleanUploads: newValue });
                showNotification(
                    'EraseMeta',
                    `Auto-clean uploads ${newValue ? 'enabled' : 'disabled'}`
                );
                break;
            }
            case 'toggle-download-clean': {
                const result = await chrome.storage.local.get({ cleanDownloads: true });
                const newValue = !result.cleanDownloads;
                await chrome.storage.local.set({ cleanDownloads: newValue });
                showNotification(
                    'EraseMeta',
                    `Clean downloads ${newValue ? 'enabled' : 'disabled'}`
                );
                break;
            }
            case 'clean-hovered-image': {
                
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    try {
                        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GetHoveredImage' });
                        if (response && response.srcUrl) {
                            await cleanAndDownloadImage(response.srcUrl);
                        } else {
                            showNotification('EraseMeta', 'No image detected. Hover over an image first.');
                        }
                    } catch (e) {
                        logger.error('Failed to get hovered image:', e);
                        showNotification('EraseMeta', 'Could not detect hovered image.');
                    }
                }
                break;
            }
        }
    });

    

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "AutoClean" && sender.tab) {
            go(sender.tab.id)
                .then(() => sendResponse({ success: true }))
                .catch((error) => {
                    logger.error('AutoClean failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
        }
        
        
        if (request.type === "CleanHoveredImage" && request.srcUrl) {
            cleanAndDownloadImage(request.srcUrl)
                .then(() => sendResponse({ success: true }))
                .catch((error) => {
                    logger.error('CleanHoveredImage failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
        }
        
        return false;
    });

    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        switch (info.menuItemId) {
            case "browse":
                go(tab.id)
                break
            case "dragUpload":
                await setIndex(tab.id)
                chrome.windows.create({
                    url: "dragUpload.html?id=" + tab.id,
                    type: "popup",
                    width: 710,
                    height: 570
                });
                break
            case "downloadClean":
                await cleanAndDownloadImage(info.srcUrl);
                break
            case "viewMetadata":
                
                chrome.tabs.sendMessage(tab.id, { 
                    type: "ShowMetadata", 
                    srcUrl: info.srcUrl 
                });
                break
            case "cleanAndCopy":
                try {
                    const cleanedData = await cleanImageData(info.srcUrl);
                    if (cleanedData) {
                        
                        chrome.tabs.sendMessage(tab.id, {
                            type: "CopyToClipboard",
                            imageData: cleanedData
                        });
                    }
                } catch (e) {
                    logger.error('Failed to clean and copy image:', e);
                }
                break
        }
    })
}


async function cleanAndDownloadImage(srcUrl) {
    try {
        
        if (!srcUrl || typeof srcUrl !== 'string') {
            logger.error("Invalid source URL");
            return;
        }
        
        
        const urlObj = new URL(srcUrl);
        if (!['http:', 'https:', 'data:'].includes(urlObj.protocol)) {
            logger.error("Unsupported URL protocol:", urlObj.protocol);
            return;
        }
        
        
        let response = await fetch(srcUrl);
        
        
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) { 
            logger.error("File too large for context menu cleaning");
            showNotification('EraseMeta', 'File too large (max 100MB)');
            return;
        }
        
        let blob = await response.blob();
        
        
        let rawFilename = srcUrl.split('/').pop().split('?')[0] || "image.png";
        let filename = sanitizeFilename(rawFilename);
        
        
        if (!filename.includes('.')) {
            
            const extMap = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'image/bmp': '.bmp'
            };
            filename += extMap[blob.type] || '.png';
        }
        
        let file = new File([blob], filename, { type: blob.type });

        
        let cleanedData = await CleanUp(-1, file);
        if (cleanedData) {
            
            
            
            let cleanedBlob = new Blob([cleanedData.data || cleanedData], { type: file.type });
            let url = URL.createObjectURL(cleanedBlob);

            chrome.downloads.download({
                url: url,
                filename: "cleaned-" + filename,
                saveAs: true
            }, (downloadId) => {
                
                if (downloadId) {
                    const listener = (delta) => {
                        if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
                            URL.revokeObjectURL(url);
                            chrome.downloads.onChanged.removeListener(listener);
                        }
                    };
                    chrome.downloads.onChanged.addListener(listener);
                    
                    
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        chrome.downloads.onChanged.removeListener(listener);
                    }, 60000);
                } else {
                    
                    URL.revokeObjectURL(url);
                }
            });

            updateStats(1, { fileType: 'image' });
        }
    } catch (e) {
        logger.error("Failed to download clean image", e);
        showNotification('EraseMeta', 'Failed to clean image');
    }
}


async function cleanImageData(srcUrl) {
    try {
        const urlObj = new URL(srcUrl);
        if (!['http:', 'https:', 'data:'].includes(urlObj.protocol)) {
            return null;
        }
        
        let response = await fetch(srcUrl);
        let blob = await response.blob();
        
        let rawFilename = srcUrl.split('/').pop().split('?')[0] || "image.png";
        let filename = sanitizeFilename(rawFilename);
        
        if (!filename.includes('.')) {
            const extMap = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'image/bmp': '.bmp'
            };
            filename += extMap[blob.type] || '.png';
        }
        
        let file = new File([blob], filename, { type: blob.type });
        let cleanedData = await CleanUp(-1, file);
        
        updateStats(1, { fileType: 'image' });
        
        return cleanedData;
    } catch (e) {
        logger.error("Failed to clean image data", e);
        return null;
    }
}

chrome.action.onClicked.addListener(tab => go(tab.id))
