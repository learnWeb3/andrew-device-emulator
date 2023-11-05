import { join } from 'path'
import { writeFile, readdir, readFile } from 'fs/promises';
import { remove } from 'fs-extra';

export class StorageClient {
    STORAGE_PATH = join(process.cwd(), 'data');

    async createFile(fileName, data) {
        const filePath = join(this.STORAGE_PATH, fileName)
        await writeFile(filePath, data, { encoding: 'utf-8' })
    }

    async getFiles(ignoredFileNames = ['.DS_Store']) {
        const ignoredFileNamesMapping = ignoredFileNames.reduce((map, fileName) => {
            map[fileName] = true;
            return map;
        }, {})
        const fileNames = await readdir(this.STORAGE_PATH)
        return fileNames.filter((fileName) => !ignoredFileNamesMapping[fileName])
    }

    async removeFiles(fileNames = []) {
        for (const fileName of fileNames) {
            const filePath = join(this.STORAGE_PATH, fileName)
            await remove(filePath)
        }
    }

    async saveData(data) {
        const date = new Date()
        const fileName = `${date.getTime()}_data.json`
        await this.createFile(fileName, data)
    }

    async getSavedData() {
        const data = []
        const fileNames = await this.getFiles();
        // extract datas
        for (const fileName of fileNames) {
            const filePath = join(this.STORAGE_PATH, fileName)
            const fileData = await readFile(filePath, { encoding: 'utf8' }).then((data) => JSON.parse(data))
            console.log(fileData)
            data.push(fileData)
        }
        // remove files
        await this.removeFiles(fileNames)
        return data
    }

}
