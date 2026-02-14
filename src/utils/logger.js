

let debugMode = false;


export async function initLogger() {
    try {
        const result = await chrome.storage.local.get(['debugMode']);
        debugMode = result.debugMode || false;
    } catch (e) {
        
        debugMode = false;
    }
    
    
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.debugMode !== undefined) {
                debugMode = changes.debugMode.newValue;
            }
        });
    }
}


export function setDebugMode(enabled) {
    debugMode = enabled;
}


export function isDebugMode() {
    return debugMode;
}


export function log(...args) {
    if (debugMode) {
        console.log('[EraseMeta]', ...args);
    }
}


export function warn(...args) {
    if (debugMode) {
        console.warn('[EraseMeta]', ...args);
    }
}


export function debug(...args) {
    if (debugMode) {
        console.debug('[EraseMeta]', ...args);
    }
}


export function error(...args) {
    console.error('[EraseMeta]', ...args);
}


export function info(...args) {
    if (debugMode) {
        console.info('[EraseMeta]', new Date().toISOString(), ...args);
    }
}


export async function group(label, fn) {
    if (debugMode) {
        console.group(`[EraseMeta] ${label}`);
        try {
            await fn();
        } finally {
            console.groupEnd();
        }
    } else {
        await fn();
    }
}


export default {
    init: initLogger,
    setDebugMode,
    isDebugMode,
    log,
    warn,
    debug,
    error,
    info,
    group
};
