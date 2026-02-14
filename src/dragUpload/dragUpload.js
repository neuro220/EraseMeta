import CleanUp from '../utils/cleanup.js';
import fileDict from '../utils/fileDict.js'
import { ChunkSender } from '../utils/chunkManager.js'


let validTabId = null;


async function validateAndGetTabId() {
    const params = new URL(location.href).searchParams;
    const idParam = params.get("id");
    
    
    if (!idParam) {
        console.error("No tab ID provided");
        return null;
    }
    
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
        console.error("Invalid tab ID format");
        return null;
    }
    
    
    try {
        const tab = await chrome.tabs.get(id);
        if (!tab) {
            console.error("Tab does not exist");
            return null;
        }
        return id;
    } catch (e) {
        console.error("Invalid tab ID - tab not found:", e);
        return null;
    }
}

['dragenter', 'dragover'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        document.body.classList.add('dragging');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        document.body.classList.remove('dragging');
    });
});

document.body.addEventListener("drop", async event => {
    event.preventDefault();
    
    
    const id = await validateAndGetTabId();
    if (id === null) {
        alert("Invalid session. Please close this window and try again.");
        window.close();
        return;
    }
    
    
    const files = Object.values(event.dataTransfer.files);
    if (files.length === 0) {
        alert("No files detected.");
        return;
    }
    if (files.length > 100) {
        alert("Too many files. Maximum 100 files allowed.");
        return;
    }
    
    let fileDicts = [];
    for (let file of files) {
        try {
            let cleanedData = await CleanUp(id, file);
            fileDicts.push(await fileDict.compose(file, cleanedData));
        } catch (e) {
            console.error("Failed to clean file:", file.name, e);
        }
    }

    if (fileDicts.length > 0) {
        await sendResult(id, fileDicts);
    }

    window.close();
})

async function sendResult(id, fileDicts) {
    let key = crypto.randomUUID()
    await chrome.tabs.sendMessage(id, { type: "Result", key })
    let cs = new ChunkSender(key, fileDicts)
    await cs.chunkTabSendMessage(id)
}