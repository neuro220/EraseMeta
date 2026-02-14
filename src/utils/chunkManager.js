const CHUNK_SIZE = 5 * 1024 * 1024; 

export class ChunkSender {
    constructor(key, message, onProgress = null) {
        this.key = key;
        this.message = JSON.stringify(message);
        this.chunks = Array.from({ length: Math.ceil(this.message.length / CHUNK_SIZE) }, (_, i) =>
            this.message.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE)
        );
        this.onProgress = onProgress;
    }

    async chunkRuntimeSendMessage() {
        let promises = [];
        await chrome.runtime.sendMessage({
            type: "_open",
            key: this.key,
            total: this.chunks.length
        })
        for(let i = 0; i < this.chunks.length; i++) {
            promises.push(
                chrome.runtime.sendMessage({
                    type: "_chunk",
                    chunk: this.chunks[i],
                    index: i,
                    key: this.key
                }).then(() => {
                    if (this.onProgress) {
                        this.onProgress(i + 1, this.chunks.length);
                    }
                })
            );
        }
        return Promise.all(promises);
    }

    async chunkTabSendMessage(tabId) {
        let promises = [];
        await chrome.tabs.sendMessage(tabId, {
            type: "_open",
            key: this.key,
            total: this.chunks.length
        })
        for(let i = 0; i < this.chunks.length; i++) {
            promises.push(
                chrome.tabs.sendMessage(tabId, {
                    type: "_chunk",
                    chunk: this.chunks[i],
                    index: i,
                    key: this.key
                }).then(() => {
                    if (this.onProgress) {
                        this.onProgress(i + 1, this.chunks.length);
                    }
                })
            );
        }
        return Promise.all(promises);
    }    
}

function validateFileDicts(data) {
    
    if (!Array.isArray(data)) {
        throw new Error('Invalid data: expected array');
    }
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (typeof item !== 'object' || item === null) {
            throw new Error(`Invalid item at index ${i}: expected object`);
        }
        
        
        const allowedKeys = ['name', 'type', 'data'];
        const keys = Object.keys(item);
        for (const key of keys) {
            if (!allowedKeys.includes(key)) {
                throw new Error(`Invalid key in item at index ${i}: ${key}`);
            }
        }
        
        
        if (item.name !== undefined && typeof item.name !== 'string') {
            throw new Error(`Invalid name at index ${i}: expected string`);
        }
        if (item.type !== undefined && typeof item.type !== 'string') {
            throw new Error(`Invalid type at index ${i}: expected string`);
        }
        if (item.data !== undefined && typeof item.data !== 'string') {
            throw new Error(`Invalid data at index ${i}: expected string`);
        }
    }
    
    return data;
}

export class ChunkReceiver {
    constructor(key, onProgress = null) {
        this.key = key;
        this.chunks = new Map(); 
        this.total = null;
        this.resolved = false;
        this.listener = null;
        this.receivedIndices = new Set();
        this.onProgress = onProgress;
    }

    chunkRuntimeReceiveMessage() {
        return new Promise((resolve, reject) => {
            
            this.listener = (message, sender, sendResponse) => {
                
                if (!message || typeof message !== 'object') {
                    return;
                }
                
                if(message.type == "_open" && message.key == this.key) {
                    console.log("debug", message)
                    
                    if (typeof message.total !== 'number' || message.total <= 0 || message.total > 1000) {
                        console.error("Invalid total chunks:", message.total);
                        sendResponse(false);
                        return;
                    }
                    this.total = message.total;
                    sendResponse(true);
                }
                if(message.type == "_chunk" && message.key == this.key) {
                    console.log("debug", message)
                    
                    
                    if (typeof message.index !== 'number' || message.index < 0) {
                        console.error("Invalid chunk index:", message.index);
                        sendResponse(false);
                        return;
                    }
                    
                    
                    if (this.total !== null && message.index >= this.total) {
                        console.error("Chunk index out of bounds:", message.index, ">=", this.total);
                        sendResponse(false);
                        return;
                    }
                    
                    
                    if (!this.receivedIndices.has(message.index)) {
                        this.chunks.set(message.index, message.chunk);
                        this.receivedIndices.add(message.index);
                        
                        
                        if (this.onProgress && this.total !== null) {
                            this.onProgress(this.chunks.size, this.total);
                        }
                    }
                    
                    
                    if(this.total !== null && this.chunks.size === this.total) {
                        
                        const sortedChunks = [];
                        for (let i = 0; i < this.total; i++) {
                            sortedChunks.push(this.chunks.get(i));
                        }
                        this.message = sortedChunks.join("");
                        this.resolved = true;
                        
                        chrome.runtime.onMessage.removeListener(this.listener);
                        this.listener = null;
                        
                        try {
                            const parsed = JSON.parse(this.message);
                            const validated = validateFileDicts(parsed);
                            resolve(validated);
                        } catch (e) {
                            console.error("Failed to parse or validate message:", e);
                            reject(new Error("Invalid message format: " + e.message));
                        }
                    }
                    sendResponse(true);
                }
            };
            
            chrome.runtime.onMessage.addListener(this.listener);
            
            
            setTimeout(() => {
                if (!this.resolved && this.listener) {
                    console.warn("ChunkReceiver timeout - cleaning up listener");
                    chrome.runtime.onMessage.removeListener(this.listener);
                    this.listener = null;
                    reject(new Error("Timeout waiting for all chunks"));
                }
            }, 60000); 
        });
    }
    
    
    cleanup() {
        if (this.listener) {
            chrome.runtime.onMessage.removeListener(this.listener);
            this.listener = null;
        }
        this.chunks.clear();
        this.receivedIndices.clear();
    }
}