import mqtt from "mqtt";
import cron from "node-cron";
import dotenv from "dotenv";
import { KeycloakClient } from "./lib/KeycloakClient.js";
import { StorageClient } from "./lib/StorageClient.js";
import { fetchAndSaveDataFromObd } from "./lib/utils/data-collection.js";
import {
  AndrewDeviceActivationStatusRequestEvent,
  AndrewDeviceActivationStatusResponseEvent,
  AndrewDeviceDrivingSessionEndEvent,
  AndrewDeviceDrivingSessionStartEvent,
  AndrewDeviceEvent,
  AndrewDeviceMetricEvent,
} from "andrew-events-schema/andrew-device-events";
import { Device } from "./lib/Device.js";
import { sendDataToSystem } from "./lib/utils/data-transmission.js";
import { Vehicle } from "./lib/Vehicle.js";
import express from "express";

const isProd = process.env.NODE_ENV === "production";

if (!isProd) {
  dotenv.config({
    path: ".env.development",
  });
}

const {
  MQTT_AUTH_USERNAME,
  MQTT_BROKER_HOST,
  MQTT_PUBLISH_TOPIC_PREFIX,
  MQTT_SUBSCRIBE_TOPIC_PREFIX,
  MQTT_BROKER_PROTOCOL,
  KEYCLOAK_ISSUER,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  VEHICLE_VIN,
  DEVICE_ID,
} = process.env;

async function main() {

  const DEVICE_ACTIVE_STATUS = "PAIRED"

  const DEVICE_API_EVENT_TYPES = {
    ACTIVATION_STATUS_RESPONSE: "andrew.device.activation-status-response",
  };

  const VEHICLE_ENGINE_STATE_CHECK_CRON_PATTERN = "* * * * * *";
  const DATA_COLLECTION_CRON_PATTERN = "* * * * * *";
  const DATA_TRANSMISSION_CRON_PATTERN = "*/30 * * * * *";

  const VEHCILE_OBJ = new Vehicle(VEHICLE_VIN);
  const DEVICE_OBJ = new Device(VEHICLE_VIN, DEVICE_ID);

  // EXPRESS SERVER TO START ENGINE
  const app = express();

  app.post("/engine/on", async (req, res) => {
    VEHCILE_OBJ.engineOn = true;
    console.log(`===> vehicle engine set to ON`);
    res.status(200);
    res.json({
      engineOn: VEHCILE_OBJ.engineOn,
    });
  });

  app.post("/engine/off", async (req, res) => {
    VEHCILE_OBJ.engineOn = false;
    console.log(`===> vehicle engine set to OFF`);
    res.status(200);
    res.json({
      engineOn: VEHCILE_OBJ.engineOn,
    });
  });

  app.listen(6000, "0.0.0.0", () => {
    console.log(`server running on port 6000`);
  });

  cron.schedule(DATA_COLLECTION_CRON_PATTERN, () => {
    if (
      DEVICE_OBJ.isActive &&
      DEVICE_OBJ.drivingSessionHasStarted &&
      VEHCILE_OBJ.engineOn
    ) {
      fetchAndSaveDataFromObd(DEVICE_OBJ.vehicleVIN, DEVICE_OBJ.deviceId);
    }
  });

  // open mqtt connection
  const KEYCLOAK_CLIENT = new KeycloakClient(KEYCLOAK_ISSUER, {
    clientId: KEYCLOAK_CLIENT_ID,
    clientSecret: KEYCLOAK_CLIENT_SECRET,
  });

  KEYCLOAK_CLIENT.authenticate().then(({ access_token }) => {
    console.log(`===> authenticated with keycloak`);
    console.log(
      `===> attempting mqtt broker connection to ${MQTT_BROKER_PROTOCOL}://${MQTT_BROKER_HOST}`
    );

    const MQTT_CLIENT = mqtt.connect(
      `${MQTT_BROKER_PROTOCOL}://${MQTT_BROKER_HOST}`,
      {
        username: MQTT_AUTH_USERNAME,
        password: access_token,
        rejectUnauthorized: true,
        clientId: KEYCLOAK_CLIENT_ID,
      }
    );

    MQTT_CLIENT.on("connect", function () {
      console.log("===> mqtt broker connection opened.");

      /** DEVICE ACTIVATION STATUS REQUEST */
      const deviceActivationRequestEvent = JSON.stringify(
        new AndrewDeviceActivationStatusRequestEvent(DEVICE_OBJ.deviceId, {
          device: DEVICE_OBJ.deviceId,
          vehicle: DEVICE_OBJ.vehicleVIN,
        })
      );

      MQTT_CLIENT.publish(
        `${MQTT_PUBLISH_TOPIC_PREFIX}/activation-request`,
        deviceActivationRequestEvent,
        {
          qos: 2,
          retain: true,
        },
        function (err) {
          if (!err) {
            console.log(
              "===> attempting device activation request",
              deviceActivationRequestEvent
            );
          }
        }
      );

      cron.schedule(VEHICLE_ENGINE_STATE_CHECK_CRON_PATTERN, () => {
        if (
          DEVICE_OBJ.isActive &&
          !DEVICE_OBJ.busy &&
          !DEVICE_OBJ.drivingSessionHasStarted &&
          VEHCILE_OBJ.engineOn
        ) {
          /** MAKE DEVICE BUSY */
          DEVICE_OBJ.busy = true;
          /** DRIVING SESSION START  */
          const drivingSessionStartEvent = JSON.stringify(
            new AndrewDeviceDrivingSessionStartEvent(DEVICE_OBJ.deviceId, {
              device: DEVICE_OBJ.deviceId,
              vehicle: DEVICE_OBJ.vehicleVIN,
            })
          );

          MQTT_CLIENT.publish(
            `${MQTT_PUBLISH_TOPIC_PREFIX}/driving-session-start`,
            drivingSessionStartEvent,
            {
              qos: 2,
              retain: true,
            },
            function (err) {
              if (!err) {
                // log
                console.log(
                  "===> send driving session start event",
                  drivingSessionStartEvent
                );
                // START DRIVING SESSION
                DEVICE_OBJ.startDrivingSession();
              }
            }
          );

          /** RELEASE DEVICE BUSY STATE */
          DEVICE_OBJ.busy = false;
        }

        if (
          DEVICE_OBJ.isActive &&
          !DEVICE_OBJ.busy &&
          DEVICE_OBJ.drivingSessionHasStarted &&
          !VEHCILE_OBJ.engineOn
        ) {
          /** MAKE DEVICE BUSY */
          DEVICE_OBJ.busy = true;
          /** DRIVING SESSION END  */
          const drivingSessionEndEvent = JSON.stringify(
            new AndrewDeviceDrivingSessionEndEvent(DEVICE_OBJ.deviceId, {
              device: DEVICE_OBJ.deviceId,
              vehicle: DEVICE_OBJ.vehicleVIN,
            })
          );

          MQTT_CLIENT.publish(
            `${MQTT_PUBLISH_TOPIC_PREFIX}/driving-session-end`,
            drivingSessionEndEvent,
            {
              qos: 2,
              retain: true,
            },
            function (err) {
              if (!err) {
                // log
                console.log(
                  "===> send driving session end event",
                  drivingSessionEndEvent
                );
                // END DRIVING SESSION
                DEVICE_OBJ.endDrivingSession();
              }
            }
          );

          /** RELEASE DEVICE BUSY STATE */
          DEVICE_OBJ.busy = false;
        }
      });

      /** SUBSCRIBE TO DATA COMMING FROM THE API */
      MQTT_CLIENT.subscribe(`${MQTT_SUBSCRIBE_TOPIC_PREFIX}/#`, (err) => {
        if (err) {
          console.log(err);
        } else {
          console.log(`subscribed to topic ${MQTT_SUBSCRIBE_TOPIC_PREFIX}/#`);
        }
      });

      /** DEVICE DATA TRANSMISSION LOOP */
      cron.schedule(DATA_TRANSMISSION_CRON_PATTERN, () => {
        if (
          DEVICE_OBJ.isActive &&
          !DEVICE_OBJ.busy &&
          DEVICE_OBJ.drivingSessionHasStarted &&
          VEHCILE_OBJ.engineOn
        ) {
          DEVICE_OBJ.busy = true;

          sendDataToSystem((dataPoints = []) => {
            for (const data of dataPoints) {
              const deviceMetricEvent = JSON.stringify(
                new AndrewDeviceMetricEvent(DEVICE_OBJ.deviceId, {
                  ...data,
                })
              );

              MQTT_CLIENT.publish(
                `${MQTT_PUBLISH_TOPIC_PREFIX}/metric`,
                deviceMetricEvent,
                {
                  qos: 2,
                  retain: true,
                },
                function (err) {
                  if (!err) {
                    console.log(
                      "===> sending device metric",
                      deviceMetricEvent
                    );
                  }
                }
              );
            }
            DEVICE_OBJ.busy = false;
          });
        } else {
          if (!VEHCILE_OBJ.engineOn) {
            console.log(`===> engine is off retrying later on ...`);
          }

          if (DEVICE_OBJ.isActive && DEVICE_OBJ.busy) {
            console.log(`===> device is busy retrying later on...`);
          }

          if (!DEVICE_OBJ.isActive) {
            console.log(`===> device is desactvated retrying later on ...`);
          }
        }
      });
    });

    MQTT_CLIENT.on("message", function (topic, message) {
      // message is Buffer
      const parsedMessage = JSON.parse(message.toString());

      switch (parsedMessage.type) {
        case DEVICE_API_EVENT_TYPES.ACTIVATION_STATUS_RESPONSE:
          const activationStatusResponseEvent =
            new AndrewDeviceActivationStatusResponseEvent(
              parsedMessage.subject,
              parsedMessage.data
            );
          if (DEVICE_ACTIVE_STATUS === activationStatusResponseEvent.data.status) {
            DEVICE_OBJ.isActive = true;
          }
          break;
        default:
          console.log(
            `===> api events not implemented for type ${parsedMessage.type}`
          );
          break;
      }
    });

    MQTT_CLIENT.on("error", function (err) {
      console.error(err);
    });
  });
}

main();
