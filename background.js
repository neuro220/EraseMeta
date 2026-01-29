import CleanUp from './utils/cleanup.js';
import fileDict from './utils/fileDict.js'
import { ChunkSender, ChunkReceiver } from './utils/chunkManager.js'
import { initDownloadListener } from './utils/downloadInterceptor.js';

// Initialize download listener immediately
initDownloadListener();

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

    // New feature: Download clean image
    chrome.contextMenus.create({
        id: "downloadClean",
        title: "Download clean version",
        contexts: ["image"]
    })
}

async function setIndex(id) {
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

async function updateStats(count = 1) {
    let items = await chrome.storage.local.get({ statsFilesCleaned: 0 });
    let newCount = items.statsFilesCleaned + count;
    await chrome.storage.local.set({ statsFilesCleaned: newCount });

    // Update badge
    chrome.action.setBadgeText({ text: newCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); // Green
}

async function go(id) {
    await setIndex(id)
    let fileDicts = []
    let files = await queryFiles(id);
    for (let file of files) {
        let cleanedData = await CleanUp(id, file)
        fileDicts.push(await fileDict.compose(file, cleanedData))
    }

    if (files.length > 0) {
        updateStats(files.length);
    }

    sendResult(id, fileDicts)
}

// Pre-initialize FFmpeg (lazy loading trigger)
// We can't directly call internal utils easily from here without structuring
// But cleanByFFmpeg.js is an ES module.
// We can just import and init.
import('./utils/cleanByFFmpeg.js').then(module => {
    // Calling getFFmpeg directly if exposed, or just import to trigger top-level setup if any
    // Added a specific init method to cleanByFFmpeg would be cleaner, but for now just import helps
    if (module.getFFmpeg) module.getFFmpeg();
});

if (chrome.contextMenus) {
    chrome.runtime.onInstalled.addListener(createMenu)
    chrome.runtime.onStartup.addListener(createMenu)

    // Initialize download listener - Moved to top level imports

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "AutoClean" && sender.tab) {
            go(sender.tab.id);
        }
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
                try {
                    // Fetch the image
                    let response = await fetch(info.srcUrl);
                    let blob = await response.blob();
                    let file = new File([blob], "image", { type: blob.type });

                    // Clean it (using -1 as ID for offscreen/background context)
                    let cleanedData = await CleanUp(-1, file);
                    if (cleanedData) {
                        // Create download
                        // Note: cleanup returns arraybuffer or similar, need to wrap in Blob
                        // CleanUp usually returns ArrayBuffer so:
                        let cleanedBlob = new Blob([cleanedData.data || cleanedData], { type: file.type });
                        let url = URL.createObjectURL(cleanedBlob);

                        let filename = "cleaned-" + (response.url.split('/').pop().split('?')[0] || "image.png");
                        if (!filename.includes('.')) filename += ".png"; // Fallback extension

                        chrome.downloads.download({
                            url: url,
                            filename: filename,
                            saveAs: true
                        });

                        updateStats(1);
                    }
                } catch (e) {
                    console.error("Failed to download clean image", e);
                }
                break;
        }
    })
}
chrome.action.onClicked.addListener(tab => go(tab.id))
