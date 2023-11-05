import { StorageClient } from "../StorageClient.js";

export function fetchAndSaveDataFromObd(vehicle, device, timestamp = Date.now()) {
    const storageClient = new StorageClient();
    // fetch data from obd2
    const obd_data = {
        fuel_rate: 1,
        vehicle_speed: 1,
        engine_speed: 1,
        relative_accel_pos: 1,
    };
    const data = {
        vehicle,
        device,
        timestamp,
        obd_data
    };
    storageClient.saveData(JSON.stringify(data))
}
