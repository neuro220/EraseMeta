

import '/libs/jszip.min.js';

function sanitizeXmlForXxe(xmlContent) {
    
    xmlContent = xmlContent.replace(/<!DOCTYPE\s+[^>]*\[[\s\S]*?\]>/gi, '');
    
    
    xmlContent = xmlContent.replace(/<!ENTITY\s+[^>]*>/gi, '');
    
    
    xmlContent = xmlContent.replace(/<!ENTITY\s+\S+\s+SYSTEM\s+["'][^"']*["']\s*>/gi, '');
    xmlContent = xmlContent.replace(/<!ENTITY\s+\S+\s+PUBLIC\s+["'][^"']*["']\s+["'][^"']*["']\s*>/gi, '');
    
    return xmlContent;
}

export default async function(file) {
    try {
        const zip = new JSZip();
        const originalData = await file.arrayBuffer();
        const loadedZip = await zip.loadAsync(originalData);
        
        
        const metadataFiles = [
            'META-INF/container.xml',
            'OEBPS/content.opf',
            'OEBPS/toc.ncx',
            'content.opf',
            'toc.ncx'
        ];
        
        
        for (const filename of metadataFiles) {
            if (loadedZip.files[filename]) {
                const content = await loadedZip.files[filename].async('string');
                const cleaned = cleanXmlMetadata(content, filename);
                zip.file(filename, cleaned);
            }
        }
        
        
        for (const [path, file] of Object.entries(loadedZip.files)) {
            if (!file.dir) {
                const lowerPath = path.toLowerCase();
                
                
                if (lowerPath.endsWith('.opf')) {
                    const content = await file.async('string');
                    const cleaned = cleanOpfMetadata(content);
                    zip.file(path, cleaned);
                }
                
                
                if (lowerPath.endsWith('.ncx')) {
                    const content = await file.async('string');
                    const cleaned = cleanNcxMetadata(content);
                    zip.file(path, cleaned);
                }
                
                
                if (lowerPath.endsWith('.html') || lowerPath.endsWith('.xhtml')) {
                    const content = await file.async('string');
                    const cleaned = cleanHtmlMetadata(content);
                    zip.file(path, cleaned);
                }
            }
        }
        
        return await zip.generateAsync({ type: 'arraybuffer' });
        
    } catch (e) {
        console.error('[EraseMeta] EPUB cleaning failed:', e);
        return await file.arrayBuffer();
    }
}


function cleanOpfMetadata(content) {
    try {
        
        content = sanitizeXmlForXxe(content);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'application/xml');
        
        
        const metadata = doc.querySelector('metadata');
        if (metadata) {
            
            const toRemove = [
                'dc:identifier',
                'dc:title',
                'dc:creator',
                'dc:contributor',
                'dc:publisher',
                'dc:date',
                'dc:source',
                'dc:language',
                'dc:relation',
                'dc:coverage',
                'dc:description',
                'dc:subject',
                'dc:rights',
                'meta',
                'opf:meta'
            ];
            
            for (const selector of toRemove) {
                const elements = metadata.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            }
        }
        
        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
        
    } catch (e) {
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"/>
</package>`;
    }
}


function cleanNcxMetadata(content) {
    try {
        
        content = sanitizeXmlForXxe(content);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'application/xml');
        
        
        const head = doc.querySelector('head');
        if (head) {
            head.remove();
        }
        
        
        const docTitle = doc.querySelector('docTitle');
        if (docTitle) docTitle.remove();
        
        const docAuthor = doc.querySelector('docAuthor');
        if (docAuthor) docAuthor.remove();
        
        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
        
    } catch (e) {
        return content;
    }
}


function cleanHtmlMetadata(content) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        
        
        const metaTags = doc.querySelectorAll('meta');
        metaTags.forEach(meta => {
            const name = meta.getAttribute('name')?.toLowerCase() || '';
            const property = meta.getAttribute('property')?.toLowerCase() || '';
            
            const sensitivePatterns = [
                'author', 'creator', 'publisher', 'date', 'generator',
                'dc.', 'og:', 'article:', 'book:', 'fb:'
            ];
            
            const isSensitive = sensitivePatterns.some(pattern => 
                name.includes(pattern) || property.includes(pattern)
            );
            
            if (isSensitive) {
                meta.remove();
            }
        });
        
        
        const title = doc.querySelector('title');
        if (title) title.remove();
        
        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
        
    } catch (e) {
        return content;
    }
}


function cleanXmlMetadata(content, filename) {
    if (filename.endsWith('.opf')) {
        return cleanOpfMetadata(content);
    } else if (filename.endsWith('.ncx')) {
        return cleanNcxMetadata(content);
    }
    return content;
}
