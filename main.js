const mqtt = require("mqtt");
const cron = require("node-cron");
const { KeycloakClient } = require("./lib/KeycloakClient");

const isProd = process.env.NODE_ENV === "production";

if (!isProd) {
  require("dotenv").config({
    path: ".env.development",
  });
}

const {
  MQTT_AUTH_USERNAME,
  MQTT_BROKER_HOST,
  MQTT_TOPIC_PREFIX,
  MQTT_BROKER_PROTOCOL,
  KEYCLOAK_ISSUER,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
} = process.env;

async function main() {
  const keycloakClient = new KeycloakClient(KEYCLOAK_ISSUER, {
    clientId: KEYCLOAK_CLIENT_ID,
    clientSecret: KEYCLOAK_CLIENT_SECRET,
  });
  keycloakClient.authenticate().then(({ access_token }) => {

    const client = mqtt.connect(`${MQTT_BROKER_PROTOCOL}://${MQTT_BROKER_HOST}`, {
      username: MQTT_AUTH_USERNAME,
      password: access_token,
      rejectUnauthorized: true,
      clientId: KEYCLOAK_CLIENT_ID,
      will: {
        topic: `${MQTT_TOPIC_PREFIX}/${KEYCLOAK_CLIENT_ID}/status`,
        payload: JSON.stringify({
          online: false,
        }),
        qos: 2,
        retain: true,
      },
    });

    client.on("connect", function () {
      console.log("broker connection opened.");

      // send online status on connection of the device
      const deviceStatusMQTTMessageOptions = {
        qos: 2,
        retain: true,
      };
      const statusMessage = JSON.stringify({
        online: true,
      });
      client.publish(
        `${MQTT_TOPIC_PREFIX}/${KEYCLOAK_CLIENT_ID}/status`,
        statusMessage,
        deviceStatusMQTTMessageOptions,
        function (err) {
          if (!err) {
            console.log(
              "connected, sending device status",
              JSON.stringify(statusMessage, null, 4)
            );
          }
        }
      );

      cron.schedule("* * * * * *", () => {
        const deviceTestMQTTMessageOptions = {
          qos: 2,
          retain: true,
        };
        const testMessage = JSON.stringify({
          message: "This a test message",
          createdAt: Date.now(),
        });
        client.publish(
          `${MQTT_TOPIC_PREFIX}/${KEYCLOAK_CLIENT_ID}/test`,
          testMessage,
          deviceTestMQTTMessageOptions,
          function (err) {
            if (!err) {
              console.log(
                "connected, sending test message",
                JSON.stringify(testMessage, null, 4)
              );
            }
          }
        );
      });
    });

    client.on("message", function (topic, message) {
      // message is Buffer
      message = JSON.parse(message.toString());
      console.log(message);
    });

    client.on("error", function (err) {
      console.error(err);
    });

  })
}

main();
