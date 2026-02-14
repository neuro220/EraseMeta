import cleanImages from './cleanImages.js';
import cleanPdf from './cleanPdf.js';
import cleanOffice from './cleanOffice.js';
import cleanByFFmpeg from './cleanByFFmpeg.js';
import cleanSvg from './cleanSvg.js';
import cleanEpub from './cleanEpub.js';
import logger from './logger.js';
import fileCache from './fileCache.js';


const MAX_FILE_SIZE = 500 * 1024 * 1024;


const UTILS = [
    [cleanImages, [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]],
    [cleanPdf, [".pdf"]],
    [cleanOffice, [".doc", ".dot", ".docx", ".dotx", ".docm", ".dotm", ".xls", ".xlt", ".xla", ".xlsx", ".xltx", ".xlsm", ".xltm", ".xlam", ".xlsb", ".ppt", ".pot", ".pps", ".ppa", ".pptx", ".potx", ".ppsx", ".ppam", ".pptm", ".potm", ".ppsm", ".mdb", ".odt", ".ods", ".odp", ".odg", ".odc", ".odf", ".odi", ".odm", ".odb", ".ott", ".ots", ".otp", ".otg", ".otc", ".oti", ".oth"]],
    [cleanByFFmpeg, [".mp4", ".webm", ".ogv", ".mpg", ".mpeg", ".m1v", ".m4v", ".avi", ".mkv", ".mov", ".wmv", ".avif", ".avifs"]], 
    [cleanByFFmpeg, [".mp3", ".aac", ".wav", ".wv", ".ogg", ".opus", ".flac"]], 
    [cleanByFFmpeg, [".heic", ".ppm", ".tiff"]], 
    [cleanSvg, [".svg", ".svgz"]], 
    [cleanEpub, [".epub"]] 
];


const SUPPORTED_EXTENSIONS = new Set(UTILS.flatMap(([_, exts]) => exts));


function getFileType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'ppm', 'tiff', 'svg', 'svgz', 'avif', 'avifs'];
    const videoExts = ['mp4', 'webm', 'ogv', 'mpg', 'mpeg', 'm1v', 'm4v', 'avi', 'mkv', 'mov', 'wmv'];
    const audioExts = ['mp3', 'aac', 'wav', 'wv', 'ogg', 'opus', 'flac'];
    const docExts = ['pdf', 'doc', 'dot', 'docx', 'dotx', 'docm', 'dotm', 'xls', 'xlt', 'xla', 'xlsx', 'xltx', 'xlsm', 'xltm', 'xlam', 'xlsb', 'ppt', 'pot', 'pps', 'ppa', 'pptx', 'potx', 'ppsx', 'ppam', 'pptm', 'potm', 'ppsm', 'mdb', 'odt', 'ods', 'odp', 'odg', 'odc', 'odf', 'odi', 'odm', 'odb', 'ott', 'ots', 'otp', 'otg', 'otc', 'oti', 'oth', 'epub'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (docExts.includes(ext)) return 'document';
    
    return 'other';
}


function validateFile(file) {
    
    if (!file) {
        return { valid: false, error: "No file provided" };
    }
    
    
    if (!file.name || typeof file.name !== 'string') {
        return { valid: false, error: "Invalid file name" };
    }
    
    
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
        return { valid: false, error: "Invalid file name: path traversal detected" };
    }
    
    
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }
    
    if (file.size === 0) {
        return { valid: false, error: "File is empty" };
    }
    
    
    const fileName = file.name.toLowerCase();
    const isSupported = Array.from(SUPPORTED_EXTENSIONS).some(ext => fileName.endsWith(ext));
    
    if (!isSupported) {
        return { valid: false, error: `Unsupported file format: ${file.name}` };
    }
    
    return { valid: true };
}

export default async function (id, file, onProgress = null) {
    logger.log('Processing file:', file.name);
    
    
    const validation = validateFile(file);
    if (!validation.valid) {
        logger.error("File validation failed:", validation.error);
        if (id !== -1) {
            chrome.tabs.sendMessage(id, { type: "Error", error: validation.error });
        }
        throw new Error(validation.error);
    }
    
    
    const cachedResult = await fileCache.get(file);
    if (cachedResult) {
        logger.log('Cache hit for file:', file.name);
        return {
            data: cachedResult,
            fileType: getFileType(file.name),
            storageSaved: 0,
            originalSize: file.size,
            cleanedSize: cachedResult.byteLength,
            fromCache: true
        };
    }

    
    const fileName = file.name.toLowerCase();
    let cleanerFound = false;
    
    for (let [cleaner, extensions] of UTILS) {
        if (extensions.some(ext => fileName.endsWith(ext))) {
            cleanerFound = true;
            
            
            const startTime = Date.now();
            
            try {
                if (onProgress) {
                    onProgress(10);
                }
                
                const result = await cleaner(file);
                
                if (onProgress) {
                    onProgress(90);
                }
                
                if (result) {
                    const duration = Date.now() - startTime;
                    logger.log(`Cleaned ${file.name} in ${duration}ms`);
                    
                    
                    const originalSize = file.size;
                    const cleanedSize = result.byteLength || result.size || 0;
                    const storageSaved = Math.max(0, originalSize - cleanedSize);
                    
                    
                    await fileCache.set(file, result);
                    
                    if (onProgress) {
                        onProgress(100);
                    }
                    
                    return {
                        data: result,
                        fileType: getFileType(file.name),
                        storageSaved: storageSaved,
                        originalSize: originalSize,
                        cleanedSize: cleanedSize
                    };
                } else {
                    throw new Error("Cleaner returned empty result");
                }
            } catch (error) {
                logger.error("Cleaning failed:", error);
                if (id !== -1) {
                    chrome.tabs.sendMessage(id, { type: "Error", error: error.message });
                }
                throw error;
            }
        }
    }

    
    if (!cleanerFound) {
        const error = "No cleaner found for file: " + file.name;
        logger.error(error);
        if (id !== -1) {
            chrome.tabs.sendMessage(id, { type: "Error", error });
        }
        throw new Error(error);
    }
}


export { SUPPORTED_EXTENSIONS, getFileType };
