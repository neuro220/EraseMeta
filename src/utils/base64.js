function uint8ToBase64(bytes) {
    const base64abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = bytes.length;
    
    for (let i = 0; i < len; i += 3) {
        const b1 = bytes[i];
        const b2 = i + 1 < len ? bytes[i + 1] : 0;
        const b3 = i + 2 < len ? bytes[i + 2] : 0;
        
        const bitmap = (b1 << 16) | (b2 << 8) | b3;
        
        result += base64abc[(bitmap >> 18) & 63];
        result += base64abc[(bitmap >> 12) & 63];
        result += i + 1 < len ? base64abc[(bitmap >> 6) & 63] : '=';
        result += i + 2 < len ? base64abc[bitmap & 63] : '=';
    }
    
    return result;
}

function base64ToUint8(base64) {
    const len = base64.length;
    const result = new Uint8Array(Math.floor(len * 3 / 4));
    let resultIndex = 0;
    
    const decodeChar = (c) => {
        if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 65;
        if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97 + 26;
        if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48 + 52;
        if (c === '+') return 62;
        if (c === '/') return 63;
        return 0;
    };
    
    for (let i = 0; i < len; i += 4) {
        const c1 = base64[i];
        const c2 = base64[i + 1];
        const c3 = base64[i + 2] || '=';
        const c4 = base64[i + 3] || '=';
        
        const b1 = decodeChar(c1);
        const b2 = decodeChar(c2);
        const b3 = decodeChar(c3);
        const b4 = decodeChar(c4);
        
        const bitmap = (b1 << 18) | (b2 << 12) | (b3 << 6) | b4;
        
        result[resultIndex++] = (bitmap >> 16) & 255;
        if (c3 !== '=') result[resultIndex++] = (bitmap >> 8) & 255;
        if (c4 !== '=') result[resultIndex++] = bitmap & 255;
    }
    
    return result.subarray(0, resultIndex);
}

export default {
    decode: s => base64ToUint8(s),
    encode: b => {
        if (b instanceof ArrayBuffer) {
            return uint8ToBase64(new Uint8Array(b));
        }
        if (b instanceof Uint8Array) {
            return uint8ToBase64(b);
        }
        return uint8ToBase64(new Uint8Array(b));
    }
}
