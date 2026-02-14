import CleanUp from './cleanup.js';
import fileDict from './fileDict.js';



let downloadCleaningEnabled = false;



const SUPPORTED_EXTENSIONS = [
    
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'ppm', 'tiff',
    
    'mp4', 'webm', 'ogv', 'mpg', 'mpeg', 'm1v', 'm4v', 'avi', 'mkv', 'mov', 'wmv', 'avif', 'avifs',
    
    'mp3', 'aac', 'wav', 'wv', 'ogg', 'opus', 'flac',
    
    'pdf',
    'doc', 'dot', 'docx', 'dotx', 'docm', 'dotm', 'xls', 'xlt', 'xla', 'xlsx', 'xltx', 'xlsm', 'xltm', 'xlam', 'xlsb',
    'ppt', 'pot', 'pps', 'ppa', 'pptx', 'potx', 'ppsx', 'ppam', 'pptm', 'potm', 'ppsm', 'mdb',
    'odt', 'ods', 'odp', 'odg', 'odc', 'odf', 'odi', 'odm', 'odb', 'ott', 'ots', 'otp', 'otg', 'otc', 'oti', 'oth'
];


const processedDownloads = new Set();


function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return 'download';
    }
    
    
    let sanitized = filename.split(/[/\\]/).pop();
    
    
    sanitized = sanitized.replace(/\.\./g, '');
    
    
    sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
    
    
    sanitized = sanitized.replace(/^\.+/, '');
    
    
    if (sanitized.length > 200) {
        const ext = getExtension(sanitized);
        const baseName = sanitized.slice(0, -(ext.length + 1));
        sanitized = baseName.slice(0, 200 - ext.length - 1) + '.' + ext;
    }
    
    
    if (!sanitized || sanitized.trim() === '') {
        return 'download';
    }
    
    return sanitized;
}

export async function initDownloadListener() {
    
    const result = await chrome.storage.local.get(['cleanDownloads']);
    downloadCleaningEnabled = result.cleanDownloads !== undefined ? result.cleanDownloads : true;

    
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.cleanDownloads) {
            downloadCleaningEnabled = changes.cleanDownloads.newValue;
        }
    });

    chrome.downloads.onCreated.addListener(async (downloadItem) => {
        if (!downloadCleaningEnabled) return;

        
        
        

        
    });

    
    chrome.downloads.onChanged.addListener(onDownloadChanged);
}

async function onDownloadChanged(delta) {
    if (!downloadCleaningEnabled) return;

    
    if (delta.state && delta.state.current === 'complete') {
        const downloadId = delta.id;

        
        if (processedDownloads.has(downloadId)) {
            return;
        }

        
        const items = await chrome.downloads.search({ id: downloadId });
        if (!items || items.length === 0) return;
        const item = items[0];

        
        const ext = getExtension(item.filename).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

        
        
        
        
        if (item.url.startsWith('blob:') || item.url.startsWith('data:')) return;

        console.log("Processing download:", item.filename);

        try {
            
            
            
            
            
            

            

            
            
            const MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024; 
            
            
            const headResponse = await fetch(item.url, { method: 'HEAD' });
            const contentLength = headResponse.headers.get('content-length');
            
            if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
                console.warn('Download too large, skipping:', item.filename, contentLength);
                return;
            }
            
            
            const response = await fetch(item.url);
            
            
            const contentLengthFromGet = response.headers.get('content-length');
            if (contentLengthFromGet && parseInt(contentLengthFromGet) > MAX_DOWNLOAD_SIZE) {
                console.warn('Download too large, skipping:', item.filename, contentLengthFromGet);
                return;
            }
            
            const blob = await response.blob();
            
            
            if (blob.size > MAX_DOWNLOAD_SIZE) {
                console.warn('Download blob too large, skipping:', item.filename, blob.size);
                return;
            }
            
            
            const safeFilename = sanitizeFilename(getFilename(item.filename));
            const file = new File([blob], safeFilename, { type: blob.type });

            
            
            
            
            

            
            
            const cleanedData = await CleanUp(-1, file);

            if (!cleanedData) return; 

            
            
            
            
            

            
            const cleanedBlob = new Blob([cleanedData.data || cleanedData], { type: file.type });
            const url = URL.createObjectURL(cleanedBlob);

            
            processedDownloads.add(downloadId);
            
            
            if (processedDownloads.size > 1000) {
                const entries = Array.from(processedDownloads);
                entries.slice(0, 500).forEach(id => processedDownloads.delete(id));
            }

            
            chrome.downloads.download({
                url: url,
                filename: "cleaned-" + safeFilename,
                saveAs: false 
            }, (newId) => {
                
                if (newId) {
                    processedDownloads.add(newId);
                    
                    
                    const listener = (delta) => {
                        if (delta.id === newId && delta.state && delta.state.current === 'complete') {
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
                
                
                
                chrome.downloads.removeFile(downloadId);
            });

        } catch (e) {
            console.error("Failed to clean download", e);
        }
    }
}

function getExtension(path) {
    const parts = path.split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function getFilename(path) {
    
    
    return path.split(/[/\\]/).pop();
}

export function setDownloadCleaningEnabled(enabled) {
    downloadCleaningEnabled = enabled;
    chrome.storage.local.set({ cleanDownloads: enabled });
}
