import fileDict from './utils/fileDict.js'
import { ChunkSender, ChunkReceiver } from './utils/chunkManager.js'

let lastActiveInput = null
let pendingFiles = null
let activeFiles = null // Cache for fail-safe fallback

// Auto-Clean Settings
let autoCleanEnabled = false;
let blockOnError = false;

chrome.storage.local.get(['autoCleanUploads', 'blockOnError'], (result) => {
    autoCleanEnabled = result.autoCleanUploads !== undefined ? result.autoCleanUploads : true;
    blockOnError = result.blockOnError || false;
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.autoCleanUploads) {
        autoCleanEnabled = changes.autoCleanUploads.newValue;
    }
    if (changes.blockOnError) {
        blockOnError = changes.blockOnError.newValue;
    }
});

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
    if (depth > 10) return []
    let elements = [...root.querySelectorAll('input[type="file"]')]
    const allNodes = root.querySelectorAll('*');
    for (const node of allNodes) {
        if (node.shadowRoot) {
            elements = elements.concat(getElements(node.shadowRoot, depth + 1))
        }
    }
    if (root === document && !window.fileSelectors) {
        window.fileSelectors = elements
    } else if (root === document) {
        window.fileSelectors = elements
    }
    return elements
}

const observer = new MutationObserver((mutations) => {
    window.fileSelectors = null
})
observer.observe(document.body, { childList: true, subtree: true })

function handleIntercept(e, target) {
    if (!autoCleanEnabled) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    console.log("EraseMeta: Intercepted file upload action", e.type);

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
        activeFiles = files // Cache
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
            activeFiles = files // Cache
            resolve(files)
        })
    })
}

function unlockUserActivation() {
    return new Promise(resolve => {
        if (navigator.userActivation.isActive) {
            resolve()
        } else {
            alert("To unlock user activation, click anywhere in webpage")
            setInterval(() => {
                navigator.userActivation.isActive ? resolve() : null
            }, 100)
        }
    })
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
                // Success: Clear cache and upload clean files
                activeFiles = null;
                uploadResult(fileDict, window.fileIndex)
            })
            sendResponse(true)
            break;
        case "Error":
            // Fail-safe logic
            if (blockOnError) {
                alert("BbeByeEXIF: Cleaning failed. Upload blocked based on your settings.");
            } else {
                // Upload original files
                if (activeFiles) {
                    console.log("ByeByeEXIF: Cleaning failed. Fallback to original files.");
                    uploadResult(activeFiles, window.fileIndex);
                } else {
                    alert("ByeByeEXIF: Cleaning failed and original files lost.");
                }
            }
            sendResponse(true)
    }
    return true
})
