export default async function(file){
    const img = await loadImage(file)
    
    try {
        const canvas = new OffscreenCanvas(img.width, img.height)
        const ctx = canvas.getContext("2d")
        
        ctx.drawImage(img, 0, 0, img.width, img.height)
        
        return (await getCleanedBlob(canvas, file.type))
    } finally {
        // Always close ImageBitmap to free GPU memory
        img.close();
    }
}

async function loadImage(file){
    let img = await createImageBitmap(new Blob([file]));
    return img
}

function getCleanedBlob(canvas, type){
    return new Promise(resolve => {
        canvas.convertToBlob({type: type}).then(blob => resolve(blob.arrayBuffer()))
    })
}
