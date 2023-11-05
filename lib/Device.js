export class Device {
    constructor(vehicleVIN = "", deviceId = "") {
        this._isActive = false
        this._vehicleVIN = vehicleVIN;
        this._deviceId = deviceId;
        this._busy = false
        this._drivingSessions = [];
        this._drivingSessionHasStarted = false
    }

    get drivingSessionHasStarted() {
        return this._drivingSessionHasStarted;
    }

    startDrivingSession() {
        if (!this._drivingSessionHasStarted) {
            this._drivingSessionHasStarted = true
            const newDrivingSession = { start: new Date(), end: null }
            this._drivingSessions = [...this._drivingSessions, newDrivingSession]
        } else {
            console.log(`===> ERROR last session has not yet ended`)
        }
    }

    endDrivingSession() {
        if (this._drivingSessionHasStarted) {
            this._drivingSessionHasStarted = false
            this._drivingSessions[this._drivingSessions.length - 1].end = new Date()
            this._drivingSessions = this._drivingSessions;
        } else {
            console.log(`===> ERROR last session has already ended`)
        }
    }

    // active state in respect to device status coming from API
    get isActive() {
        return this._isActive;
    }
    set isActive(isActive) {
        console.log(isActive ? `===> device is now activated` : `===> device is now desactivated`)
        this._isActive = isActive;
    }

    // busy state for communication concurrency in the cron loop
    get busy() {
        return this._busy;
    }
    set busy(busy = false) {
        console.log(busy ? `===> device is now busy` : `===> device is now available`)
        this._busy = busy;
    }

    get vehicleVIN() {
        return this._vehicleVIN;
    }
    set vehicleVIN(vehicleVIN) {
        this._vehicleVIN = vehicleVIN;
    }

    get deviceId() {
        return this._deviceId;
    }
    set deviceId(deviceId) {
        this._deviceId = deviceId;
    }
}