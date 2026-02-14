

const EVENT_HANDLER_ATTRS = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmousemove',
    'onmouseout', 'onkeydown', 'onkeypress', 'onkeyup', 'onfocus', 'onblur', 'onchange',
    'onsubmit', 'onreset', 'onselect', 'onload', 'onunload', 'onerror', 'onresize',
    'onscroll', 'onbeforeunload', 'onhashchange', 'onpageshow', 'onpagehide', 'onpopstate',
    'oncopy', 'oncut', 'onpaste', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
    'ondragover', 'ondragstart', 'ondrop', 'oncontextmenu'
];

function removeScriptElements(doc) {
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => script.remove());
}

function removeEventHandlers(doc) {
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        EVENT_HANDLER_ATTRS.forEach(attr => {
            if (el.hasAttribute(attr)) {
                el.removeAttribute(attr);
            }
        });
    });
}

function removeXSSPatterns(text) {
    
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    
    text = text.replace(/javascript:/gi, '');
    
    
    text = text.replace(/on\w+\s*=/gi, '');
    
    return text;
}

export default async function(file) {
    let text = await file.text();
    
    
    text = removeXSSPatterns(text);
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        
        
        removeScriptElements(doc);
        removeEventHandlers(doc);
        
        
        const metadataElements = [
            'metadata',
            'rdf:RDF',
            'cc:Work',
            'dc:title',
            'dc:description',
            'dc:creator',
            'dc:date',
            'dc:format',
            'dc:identifier',
            'dc:language',
            'dc:publisher',
            'dc:relation',
            'dc:rights',
            'dc:source',
            'dc:subject',
            'dc:type',
            'cc:license',
            'cc:attribution',
            'xmp',
            'xmpMM',
            'xmpRights',
            'xmpTPg',
            'xmpDM',
            'stEvt',
            'stRef',
            'stDim',
            'xmpidq',
            'xmpPLUS',
            'xmpBJ',
            'xmpTPg'
        ];
        
        
        for (const selector of metadataElements) {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        }
        
        
        const titles = doc.querySelectorAll('title');
        titles.forEach(el => el.remove());
        
        const descs = doc.querySelectorAll('desc');
        descs.forEach(el => el.remove());
        
        
        removeComments(doc);
        
        
        const sensitiveAttrs = [
            'sodipodi:docname',
            'inkscape:export-filename',
            'inkscape:export-xdpi',
            'inkscape:export-ydpi',
            'inkscape:version',
            'sodipodi:version',
            'id',  
        ];
        
        
        const exportAttrs = [
            'sodipodi:docname',
            'inkscape:export-filename',
            'inkscape:export-xdpi',
            'inkscape:export-ydpi'
        ];
        
        const allElements = doc.querySelectorAll('*');
        allElements.forEach(el => {
            exportAttrs.forEach(attr => {
                el.removeAttribute(attr);
            });
        });
        
        
        const svg = doc.querySelector('svg');
        if (svg) {
            
            const usedNamespaces = new Set();
            const checkElement = (el) => {
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.includes(':')) {
                        const prefix = attr.name.split(':')[0];
                        usedNamespaces.add(prefix);
                    }
                });
                Array.from(el.children).forEach(checkElement);
            };
            checkElement(svg);
            
            
            usedNamespaces.add('xmlns');
            usedNamespaces.add('xlink');
            
            
            Array.from(svg.attributes).forEach(attr => {
                if (attr.name.startsWith('xmlns:') && !usedNamespaces.has(attr.name.replace('xmlns:', ''))) {
                    svg.removeAttribute(attr.name);
                }
            });
        }
        
        
        const serializer = new XMLSerializer();
        let cleanedSvg = serializer.serializeToString(doc);
        
        
        cleanedSvg = cleanedSvg.replace(/<!--[\s\S]*?-->/g, '');
        
        
        cleanedSvg = cleanedSvg.replace(/^\s*\n/gm, '');
        
        return new TextEncoder().encode(cleanedSvg).buffer;
        
    } catch (e) {
        console.error('[EraseMeta] SVG cleaning failed:', e);
        
        return await file.arrayBuffer();
    }
}


function removeComments(node) {
    const walker = node.ownerDocument.createTreeWalker(
        node,
        NodeFilter.SHOW_COMMENT,
        null,
        false
    );
    
    const comments = [];
    while (walker.nextNode()) {
        comments.push(walker.currentNode);
    }
    
    comments.forEach(comment => comment.remove());
}
