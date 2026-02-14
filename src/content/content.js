import fileDict from '../utils/fileDict.js'
import { ChunkSender, ChunkReceiver } from '../utils/chunkManager.js'
import logger from '../utils/logger.js'
import settingsCache from '../utils/settingsCache.js'

let lastActiveInput = null
let pendingFiles = null
let activeFiles = null 


let autoCleanEnabled = false;
let blockOnError = false;


let siteListMode = 'none'; 
let siteList = [];


let hoveredElement = null;
let lastHoveredImage = null;


async function initSettings() {
    const result = await settingsCache.get([
        'autoCleanUploads', 
        'blockOnError',
        'siteListMode',
        'siteList',
        'debugMode'
    ]);
    
    autoCleanEnabled = result.autoCleanUploads !== undefined ? result.autoCleanUploads : true;
    blockOnError = result.blockOnError || false;
    siteListMode = result.siteListMode || 'none';
    siteList = result.siteList || [];
    
    
    if (result.debugMode !== undefined) {
        logger.setDebugMode(result.debugMode);
    }
}

initSettings();

chrome.storage.onChanged.addListener((changes) => {
    if (changes.autoCleanUploads) {
        autoCleanEnabled = changes.autoCleanUploads.newValue;
    }
    if (changes.blockOnError) {
        blockOnError = changes.blockOnError.newValue;
    }
    if (changes.siteListMode) {
        siteListMode = changes.siteListMode.newValue;
    }
    if (changes.siteList) {
        siteList = changes.siteList.newValue;
    }
    if (changes.debugMode) {
        logger.setDebugMode(changes.debugMode.newValue);
    }
});


function shouldCleanOnCurrentSite() {
    if (siteListMode === 'none') {
        return autoCleanEnabled;
    }
    
    const currentHost = window.location.hostname;
    const isListed = siteList.some(site => {
        
        if (site.startsWith('*.')) {
            const domain = site.slice(2);
            
            return currentHost.endsWith('.' + domain) || currentHost === domain;
        }
        return currentHost === site;
    });
    
    if (siteListMode === 'whitelist') {
        return autoCleanEnabled && isListed;
    } else if (siteListMode === 'blacklist') {
        return autoCleanEnabled && !isListed;
    }
    
    return autoCleanEnabled;
}


// Track last hovered image with RAF for performance
let mouseTrackingRafId = null;
let pendingMouseTarget = null;

document.addEventListener('mouseover', (e) => {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') {
        pendingMouseTarget = e.target;
        
        if (!mouseTrackingRafId) {
            mouseTrackingRafId = requestAnimationFrame(() => {
                if (pendingMouseTarget) {
                    hoveredElement = pendingMouseTarget;
                    lastHoveredImage = pendingMouseTarget;
                }
                mouseTrackingRafId = null;
                pendingMouseTarget = null;
            });
        }
    }
}, { passive: true, capture: true });

document.addEventListener('mouseout', (e) => {
    if (e.target === hoveredElement) {
        hoveredElement = null;
    }
}, { passive: true, capture: true });

function setIndex(nl) {
    if (lastActiveInput) {
        for (let i = 0; i < nl.length; i++) {
            if (nl[i] === lastActiveInput) {
                window.fileIndex = i
                return true
            }
        }
    }

    if (nl.length == 1) {
        window.fileIndex = 0
        return true
    } else if (nl.length == 0) {
        alert("File Selector element wasn't detected")
    } else {
        let input = prompt(`Multiple elements were detected.\nPlease enter a index number from 0 to ${nl.length - 1}`, 0)
        if (input == undefined || input == null) {
            alert("Index assignment has been canceled")
        } else if (!(0 <= Number(input) && Number(input) < nl.length)) {
            alert("Index assignment is incorect")
        } else {
            window.fileIndex = Number(input)
            return true
        }
    }
    return false
}

function getElements(root = document, depth = 0) {
    if (depth > 10) return [];
    
    // Get file inputs directly
    let elements = [...root.querySelectorAll('input[type="file"]')];
    
    // Use TreeWalker for better performance than querySelectorAll('*')
    const treeWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );
    
    let node;
    while (node = treeWalker.nextNode()) {
        if (node.shadowRoot) {
            elements.push(...getElements(node.shadowRoot, depth + 1));
        }
    }
    
    if (root === document) {
        window.fileSelectors = elements;
    }
    return elements;
}

let invalidateTimeout = null;
const observer = new MutationObserver((mutations) => {
    // Only invalidate if file input was added/removed
    const hasFileInputChange = mutations.some(m => {
        const checkNode = (node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.matches?.('input[type="file"]')) return true;
            if (node.querySelector?.('input[type="file"]')) return true;
            return false;
        };
        
        const addedNodes = Array.from(m.addedNodes);
        const removedNodes = Array.from(m.removedNodes);
        
        return addedNodes.some(checkNode) || removedNodes.some(checkNode);
    });
    
    if (hasFileInputChange) {
        clearTimeout(invalidateTimeout);
        invalidateTimeout = setTimeout(() => {
            window.fileSelectors = null;
        }, 100);
    }
});
observer.observe(document.body, { childList: true, subtree: true });

function handleIntercept(e, target) {
    
    if (!shouldCleanOnCurrentSite()) {
        logger.log('Auto-clean disabled for this site:', window.location.hostname);
        return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    logger.log("Intercepted file upload action", e.type);

    lastActiveInput = target;

    if (e.type === 'drop') {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            pendingFiles = e.dataTransfer.files;
        }
    } else if (e.type === 'paste') {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            pendingFiles = e.clipboardData.files;
        }
    } else {
        pendingFiles = null;
    }

    chrome.runtime.sendMessage({ type: "AutoClean" });
}

['click', 'drop', 'paste'].forEach(eventType => {
    document.addEventListener(eventType, (e) => {
        let target = e.target;
        let isFileInput = false;

        if (target.matches && target.matches('input[type="file"]')) {
            isFileInput = true;
        } else if (e.composedPath) {
            const path = e.composedPath();
            for (const el of path) {
                if (el.matches && el.matches('input[type="file"]')) {
                    target = el;
                    isFileInput = true;
                    break;
                }
            }
        }

        if (isFileInput) {
            handleIntercept(e, target);
        }
    }, true);
});


async function openFileChooser() {
    if (pendingFiles) {
        let files = await fileDict.multiCompose(pendingFiles)
        pendingFiles = null
        activeFiles = files 
        return files
    }

    await unlockUserActivation()

    const elements = getElements()
    if (window.fileIndex === undefined || !elements[window.fileIndex]) {
        if (!setIndex(elements)) return
    }

    let targetInput = elements[window.fileIndex]

    let input = document.createElement('input');
    input.type = "file"
    input.multiple = targetInput.multiple
    input.click()
    return new Promise(resolve => {
        input.addEventListener("change", async () => {
            let files = await fileDict.multiCompose(input.files)
            activeFiles = files 
            resolve(files)
        })
    })
}

function unlockUserActivation() {
    return new Promise(resolve => {
        if (navigator.userActivation.isActive) {
            resolve();
            return;
        }
        
        alert("To unlock user activation, click anywhere in webpage");
        
        let resolved = false;
        let intervalId = null;
        
        const cleanup = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
        
        intervalId = setInterval(() => {
            if (!resolved && navigator.userActivation.isActive) {
                resolved = true;
                cleanup();
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve();
            }
        }, 30000);
    });
}

function uploadResult(fd, index) {
    const elements = getElements()
    if (!elements[index]) return

    if (elements[index].multiple) {
        elements[index].files = fileDict.filesToFileList(fileDict.multiRestore(fd))
    } else {
        elements[index].files = fileDict.filesToFileList(fileDict.multiRestore([fd[0]]))
    }
    elements[index].dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    elements[index].dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}


async function copyToClipboard(imageData, mimeType) {
    try {
        const blob = new Blob([imageData], { type: mimeType });
        await navigator.clipboard.write([
            new ClipboardItem({ [mimeType]: blob })
        ]);
        showToast('Image copied to clipboard!');
    } catch (e) {
        logger.error('Failed to copy to clipboard:', e);
        showToast('Failed to copy to clipboard');
    }
}


// Create toast styles once at module level
let toastStylesInjected = false;
function injectToastStyles() {
    if (toastStylesInjected) return;
    toastStylesInjected = true;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes erasemeta-fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes erasemeta-fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(10px); }
        }
    `;
    document.head.appendChild(style);
}

function showToast(message) {
    injectToastStyles();
    
    const existingToast = document.getElementById('erasemeta-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'erasemeta-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        animation: erasemeta-fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    
    setTimeout(() => {
        toast.style.animation = 'erasemeta-fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


function escapeHtml(text) {
    if (typeof text !== 'string') {
        text = String(text);
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showMetadataPopup(metadata) {
    
    const existingPopup = document.getElementById('erasemeta-metadata-popup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.id = 'erasemeta-metadata-popup';
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0 0 16px 0;';
    title.textContent = 'Image Metadata';
    content.appendChild(title);
    
    if (metadata && Object.keys(metadata).length > 0) {
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse;';
        
        for (const [key, value] of Object.entries(metadata)) {
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom: 1px solid #eee;';
            
            const keyCell = document.createElement('td');
            keyCell.style.cssText = 'padding: 8px 0; font-weight: 500;';
            keyCell.textContent = key;
            
            const valueCell = document.createElement('td');
            valueCell.style.cssText = 'padding: 8px 0; color: #666;';
            valueCell.textContent = value;
            
            row.appendChild(keyCell);
            row.appendChild(valueCell);
            table.appendChild(row);
        }
        content.appendChild(table);
    } else {
        const noDataMsg = document.createElement('p');
        noDataMsg.style.cssText = 'color: #666;';
        noDataMsg.textContent = 'No metadata found or unable to read metadata.';
        content.appendChild(noDataMsg);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.id = 'erasemeta-close-popup';
    closeBtn.style.cssText = 'margin-top: 16px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;';
    closeBtn.textContent = 'Close';
    content.appendChild(closeBtn);
    
    popup.appendChild(content);
    document.body.appendChild(popup);
    
    
    let popupCleanedUp = false;
    const cleanupPopup = () => {
        if (popupCleanedUp) return;
        popupCleanedUp = true;
        popup.removeEventListener('click', handlePopupClick);
        closeBtn.removeEventListener('click', handleClose);
        if (document.body.contains(popup)) {
            popup.remove();
        }
        clearTimeout(autoCleanupTimeout);
    };
    
    const handlePopupClick = (e) => {
        if (e.target === popup) {
            cleanupPopup();
        }
    };
    
    const handleClose = () => {
        cleanupPopup();
    };
    
    popup.addEventListener('click', handlePopupClick);
    closeBtn.addEventListener('click', handleClose);
    
    // Auto-cleanup after 5 minutes
    const autoCleanupTimeout = setTimeout(() => {
        cleanupPopup();
    }, 300000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case "Index":
            let bool = setIndex(getElements())
            sendResponse(bool)
            break;
        case "QueryFiles":
            openFileChooser().then(files => {
                let cs = new ChunkSender(request.key, files)
                cs.chunkRuntimeSendMessage()
                sendResponse(true)
            })
            break;
        case "Result":
            let cr = new ChunkReceiver(request.key)
            cr.chunkRuntimeReceiveMessage().then(fileDict => {
                
                activeFiles = null;
                uploadResult(fileDict, window.fileIndex)
            })
            sendResponse(true)
            break;
        case "Error":
            
            if (blockOnError) {
                alert("BbeByeEXIF: Cleaning failed. Upload blocked based on your settings.");
            } else {
                
                if (activeFiles) {
                    logger.log("Cleaning failed. Fallback to original files.");
                    uploadResult(activeFiles, window.fileIndex);
                } else {
                    alert("ByeByeEXIF: Cleaning failed and original files lost.");
                }
            }
            sendResponse(true)
            break;
        case "GetHoveredImage":
            
            if (lastHoveredImage) {
                sendResponse({ 
                    srcUrl: lastHoveredImage.src || lastHoveredImage.currentSrc,
                    alt: lastHoveredImage.alt
                });
            } else {
                sendResponse(null);
            }
            break;
        case "CopyToClipboard":
            
            if (request.imageData) {
                copyToClipboard(request.imageData, request.mimeType || 'image/png');
            }
            sendResponse(true);
            break;
        case "ShowMetadata":
            
            showMetadataPopup(request.metadata || {});
            sendResponse(true);
            break;
        case "GetSiteStatus":
            
            sendResponse({
                hostname: window.location.hostname,
                autoCleanEnabled: autoCleanEnabled,
                shouldClean: shouldCleanOnCurrentSite(),
                siteListMode: siteListMode,
                isListed: siteList.some(site => {
                    const currentHost = window.location.hostname;
                    if (site.startsWith('*.')) {
                        return currentHost.endsWith(site.slice(2)) || currentHost === site.slice(2);
                    }
                    return currentHost === site;
                })
            });
            break;
    }
    return true
})
