import '/libs/pdf-lib.min.js'
export default async function(file){
    const originalDoc = await loadDocument(file)
    const cleanDoc = await PDFLib.PDFDocument.create()

    
    const pages = await cleanDoc.copyPages(originalDoc, originalDoc.getPageIndices())
    for (const page of pages) {
        cleanDoc.addPage(page)
    }

    return (await cleanDoc.save())
}

async function loadDocument(file){
    let ab = await file.arrayBuffer()
    let doc = await PDFLib.PDFDocument.load(ab)
    return doc
}
