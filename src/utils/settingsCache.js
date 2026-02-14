

const settingsCache = {
    cache: null,
    lastUpdate: 0,
    CACHE_TTL: 5000, 
    
    defaultSettings: {
        autoCleanUploads: true,
        blockOnError: false,
        cleanDownloads: true,
        debugMode: false,
        siteListMode: 'none',
        siteList: [],
        removeGPS: true,
        removeCamera: true,
        removeTimestamp: false,
        removeAuthor: true,
        removeSoftware: true,
        removeDocAuthor: true,
        removeDocTitle: false,
        removeDocDate: false,
        statsFilesCleaned: 0,
        stats: {
            totalFilesCleaned: 0,
            filesByType: { images: 0, videos: 0, documents: 0, audio: 0 },
            metadataRemoved: { gps: 0, author: 0, camera: 0, timestamp: 0 },
            storageSaved: 0,
            sitesCleanedOn: {},
            lastCleaned: null
        }
    },
    
    async get(keys) {
        const now = Date.now();
        
        
        if (this.cache && (now - this.lastUpdate) < this.CACHE_TTL) {
            if (!keys) {
                return { ...this.defaultSettings, ...this.cache };
            }
            
            const result = {};
            const keysToFetch = [];
            
            for (const key of keys) {
                if (this.cache.hasOwnProperty(key)) {
                    result[key] = this.cache[key];
                } else {
                    keysToFetch.push(key);
                }
            }
            
            if (keysToFetch.length > 0) {
                const fetched = await chrome.storage.local.get(keysToFetch);
                this.cache = { ...this.cache, ...fetched };
                Object.assign(result, fetched);
            }
            
            return result;
        }
        
        
        const result = await chrome.storage.local.get(keys || this.defaultSettings);
        this.cache = { ...result };
        this.lastUpdate = now;
        
        return result;
    },
    
    async set(items) {
        await chrome.storage.local.set(items);
        
        
        if (this.cache) {
            this.cache = { ...this.cache, ...items };
        }
        this.lastUpdate = Date.now();
    },
    
    invalidate() {
        this.cache = null;
        this.lastUpdate = 0;
    },
    
    init() {
        
        chrome.storage.onChanged.addListener((changes) => {
            if (this.cache) {
                for (const [key, change] of Object.entries(changes)) {
                    this.cache[key] = change.newValue;
                }
                this.lastUpdate = Date.now();
            }
        });
    }
};

settingsCache.init();

export default settingsCache;
