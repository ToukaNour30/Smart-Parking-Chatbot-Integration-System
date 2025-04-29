const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const { SessionsClient } = require('@google-cloud/dialogflow');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// MQTT Broker Connection
const mqttClient = mqtt.connect('mqtt://localhost:1883');
const topics = {
  slots: 'parking/slots',
  gate: 'parking/gate',
  chatbot: 'chatbot/messages',
};

mqttClient.on('connect', () => {
  console.log('Connected to MQTT Broker');
  Object.values(topics).forEach((topic) => mqttClient.subscribe(topic));
});

mqttClient.on('message', (topic, message) => {
  const messageStr = message.toString();
  console.log(`MQTT Topic: ${topic}, Message: ${messageStr}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    console.log(`Received from client: ${message}`);

    // Send message to Dialogflow
    const response = await sendToDialogflow(message);
    ws.send(`Chatbot Response: ${response}`);

    // Publish to MQTT
    mqttClient.publish(topics.chatbot, message, (err) => {
      if (err) {
        console.error('MQTT Publish Error:', err);
      } else {
        console.log('Message published to MQTT.');
      }
    });
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Dialogflow Client
const sessionClient = new SessionsClient();
const projectId = 'YOUR_PROJECT_ID'; // Replace with your Dialogflow project ID

async function sendToDialogflow(query) {
  const sessionPath = sessionClient.projectAgentSessionPath(projectId, 'unique-session-id');
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: 'en',
      },
    },
  };

  try {
    const [response] = await sessionClient.detectIntent(request);
    return response.queryResult.fulfillmentText || 'No response from Dialogflow.';
  } catch (error) {
    console.error('Dialogflow Error:', error);
    return 'An error occurred while contacting Dialogflow.';
  }
}

mqttClient.on('error', (err) => {
  console.error('MQTT Error:', err);
  mqttClient.end();
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
