import b64 from './base64.js'
export default {
    async compose(file, data){
        let _data = data || await file.arrayBuffer()
        return {
            name: file.name,
            type: file.type,
            data: b64.encode(_data)
        }
    },
    restore(dict){
        return new File([b64.decode(dict.data)], dict.name, {type: dict.type})
    },
    async multiCompose(files){
        const fileArray = Array.from(files);
        const composePromises = fileArray.map(file => this.compose(file));
        const fileDicts = await Promise.all(composePromises);
        return fileDicts;
    },
    multiRestore(dicts){
        let files = [];
        dicts.forEach(dict => {
            let file = this.restore(dict)
            files.push(file)
        })
        return files
    },
    filesToFileList(files) {
        const dataTransfer = new DataTransfer();
        for (const file of files) {
          dataTransfer.items.add(file);
        }
        return dataTransfer.files;
    }
}
