import b64 from './base64.js'
import fileDict from './fileDict.js'
import { ChunkSender, ChunkReceiver } from './chunkManager.js'

export default async function (file) {
    if (chrome.offscreen) {
        return await offscreenRun(file)
    } else {
        
        return await run(file)
    }
}

let FFmpegClass = null;
let ffmpegInstance = null;
let ffmpegLoaded = false;
let lastUsedTime = 0;
const CLEANUP_TIMEOUT = 5 * 60 * 1000; 

async function loadFFmpegModule() {
    if (!FFmpegClass) {
        const module = await import("/libs/ffmpeg/ffmpeg/dist/esm/index.js");
        FFmpegClass = module.FFmpeg;
    }
    return FFmpegClass;
}

async function getFFmpeg() {
    
    if (ffmpegInstance && ffmpegLoaded && (Date.now() - lastUsedTime > CLEANUP_TIMEOUT)) {
        await cleanupFFmpeg();
    }
    
    const FFmpeg = await loadFFmpegModule();
    
    if (!ffmpegInstance) {
        ffmpegInstance = new FFmpeg();
    }
    if (!ffmpegLoaded) {
        await ffmpegInstance.load({
            coreURL: "/libs/ffmpeg/core/dist/esm/ffmpeg-core.js",
        });
        ffmpegLoaded = true;
    }
    lastUsedTime = Date.now();
    return ffmpegInstance;
}

async function cleanupFFmpeg() {
    if (ffmpegInstance && ffmpegLoaded) {
        try {
            await ffmpegInstance.terminate();
        } catch (e) {
            console.warn('FFmpeg cleanup error:', e);
        }
    }
    ffmpegInstance = null;
    ffmpegLoaded = false;
}

async function run(file) {
    let ffmpeg = await getFFmpeg();
    let data = await file.arrayBuffer()

    

    
    const safeName = file.name.replace(/[/\\]/g, '_').replace(/\.\./g, '');
    
    await ffmpeg.writeFile(safeName, new Uint8Array(data));
    await ffmpeg.exec([
        '-i', safeName,
        '-codec', 'copy',
        '-map_metadata', '-1',
        '-map_chapters', '-1',
        '-disposition', '0',
        '-fflags', '+bitexact',
        '-flags:v', '+bitexact',
        '-flags:a', '+bitexact',
        "cleaned" + safeName
    ]);
    let result = await ffmpeg.readFile("cleaned" + safeName);
    
    await ffmpeg.deleteFile(safeName);
    await ffmpeg.deleteFile("cleaned" + safeName);

    return result.buffer
}


let offscreenCreating = false;

async function getOffscreenDocument() {
    
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length > 0) {
        return true; 
    }
    
    
    if (offscreenCreating) {
        await new Promise(resolve => {
            const checkInterval = setInterval(async () => {
                const contexts = await chrome.runtime.getContexts({
                    contextTypes: ['OFFSCREEN_DOCUMENT']
                });
                if (contexts.length > 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
        return true;
    }
    
    
    offscreenCreating = true;
    try {
        await chrome.offscreen.createDocument({
            url: '/utils/offscreen.html',
            reasons: ['WORKERS'],
            justification: 'To use ffmpeg.wasm in chromium'
        });
    } catch (e) {
        
        if (!e.message.includes('already exists')) {
            throw e;
        }
    } finally {
        offscreenCreating = false;
    }
    return true;
}

async function offscreenRun(file) {
    await getOffscreenDocument();
    
    let key1 = crypto.randomUUID()
    let key2 = crypto.randomUUID()
    await chrome.runtime.sendMessage({ type: "offscreenFFmpegRun", key1, key2 })
    let cs = new ChunkSender(key1, await fileDict.compose(file))
    let cr = new ChunkReceiver(key2)
    console.log("debug", cs)
    await cs.chunkRuntimeSendMessage()
    let result = await cr.chunkRuntimeReceiveMessage()
    console.log("debug", b64.decode(result))

    
    
    return b64.decode(result)
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!chrome.offscreen && request.type == "offscreenFFmpegRun") {
        let cr = new ChunkReceiver(request.key1)
        cr.chunkRuntimeReceiveMessage().then(async fd => {
            let file = await fileDict.restore(fd)
            let result = await run(file).then(ret => b64.encode(ret))
            let cs = new ChunkSender(request.key2, result)
            await cs.chunkRuntimeSendMessage()
        })
        sendResponse(true)
        return true
    }
    return false
})
