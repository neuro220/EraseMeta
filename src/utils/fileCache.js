

const CACHE_NAME = 'erasemeta-file-cache';
const CACHE_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const CACHE_MAX_ENTRIES = 100;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

async function computeFileHash(file) {
    const buffer = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const fileCache = {
    async get(file) {
        try {
            const hash = await computeFileHash(file);
            const cacheKey = `${CACHE_NAME}:${hash}`;
            
            const cached = await chrome.storage.local.get(cacheKey);
            if (!cached[cacheKey]) {
                return null;
            }
            
            const entry = cached[cacheKey];
            
            // Check expiry
            if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
                await chrome.storage.local.remove(cacheKey);
                return null;
            }
            
            // Convert base64 back to ArrayBuffer
            const binaryString = atob(entry.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            return bytes.buffer;
        } catch (e) {
            console.error('Cache get error:', e);
            return null;
        }
    },
    
    async set(file, cleanedData) {
        try {
            const hash = await computeFileHash(file);
            const cacheKey = `${CACHE_NAME}:${hash}`;
            
            // Convert ArrayBuffer to base64
            const bytes = new Uint8Array(cleanedData);
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            const base64Data = btoa(binaryString);
            
            // Check cache size before adding
            await this.enforceCacheLimits();
            
            const entry = {
                data: base64Data,
                timestamp: Date.now(),
                size: cleanedData.byteLength
            };
            
            await chrome.storage.local.set({ [cacheKey]: entry });
        } catch (e) {
            console.error('Cache set error:', e);
        }
    },
    
    async enforceCacheLimits() {
        try {
            const allData = await chrome.storage.local.get(null);
            const cacheEntries = Object.entries(allData)
                .filter(([key]) => key.startsWith(CACHE_NAME))
                .map(([key, value]) => ({ key, ...value }));
            
            // Sort by timestamp (oldest first)
            cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
            
            let totalSize = cacheEntries.reduce((sum, entry) => sum + (entry.size || 0), 0);
            
            // Remove old entries if over size limit or count limit
            const entriesToRemove = [];
            while (cacheEntries.length > 0 && 
                   (totalSize > CACHE_MAX_SIZE || cacheEntries.length > CACHE_MAX_ENTRIES)) {
                const entry = cacheEntries.shift();
                entriesToRemove.push(entry.key);
                totalSize -= (entry.size || 0);
            }
            
            if (entriesToRemove.length > 0) {
                await chrome.storage.local.remove(entriesToRemove);
            }
        } catch (e) {
            console.error('Cache limit enforcement error:', e);
        }
    },
    
    async clear() {
        try {
            const allData = await chrome.storage.local.get(null);
            const cacheKeys = Object.keys(allData).filter(key => key.startsWith(CACHE_NAME));
            if (cacheKeys.length > 0) {
                await chrome.storage.local.remove(cacheKeys);
            }
        } catch (e) {
            console.error('Cache clear error:', e);
        }
    },
    
    async getStats() {
        try {
            const allData = await chrome.storage.local.get(null);
            const cacheEntries = Object.entries(allData)
                .filter(([key]) => key.startsWith(CACHE_NAME))
                .map(([key, value]) => ({ key, ...value }));
            
            const totalSize = cacheEntries.reduce((sum, entry) => sum + (entry.size || 0), 0);
            
            return {
                entryCount: cacheEntries.length,
                totalSize: totalSize,
                maxSize: CACHE_MAX_SIZE,
                maxEntries: CACHE_MAX_ENTRIES
            };
        } catch (e) {
            console.error('Cache stats error:', e);
            return { entryCount: 0, totalSize: 0, maxSize: CACHE_MAX_SIZE, maxEntries: CACHE_MAX_ENTRIES };
        }
    }
};

export default fileCache;
