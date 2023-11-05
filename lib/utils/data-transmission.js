import { StorageClient } from "../StorageClient.js";

export async function sendDataToSystem(sendData = (data) => { console.log(data) }) {
    const storageClient = new StorageClient();
    const data = await storageClient.getSavedData();
    sendData(data)
}