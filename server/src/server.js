// server/src/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const tf = require('@tensorflow/tfjs-node');
const { createGlobalModel } = require('./models/globalModel');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS to allow our Next.js client to connect
const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "http://localhost:3000", // Next.js default port
        methods: ["GET", "POST"]
    }
});

// Step 0: Initialize Global Model
let globalModel = createGlobalModel();
let clientUpdates = []; // In-memory pool for Step 4 (Aggregation)
const MIN_UPDATES_FOR_AGGREGATION = 10; // Threshold before running FedAvg

io.on('connection', async (socket) => {
    console.log(`Node connected: ${socket.id}`);

    // Step 1: Distribution - Client requests the latest global model
    socket.on('request_model', async () => {
        // Extract current weights as binary data to send over WebSockets
        const weights = globalModel.getWeights();
        const serializedWeights = await Promise.all(
            weights.map(async (tensor) => ({
                data: await tensor.data(), // Float32Array
                shape: tensor.shape
            }))
        );
        
        socket.emit('model_dispatched', serializedWeights);
        console.log(`Dispatched global model to ${socket.id}`);
    });

    // Step 3: Return Updates - Client sends their locally trained weights
    socket.on('client_update', (clientPayload) => {
        console.log(`Received model update from ${socket.id}`);
        
        // Push to in-memory array (We will add anomaly detection here later)
        clientUpdates.push(clientPayload);

        // Acknowledge receipt to trigger gamification points on the client
        socket.emit('update_acknowledged', { points: 100 });

        // Step 4: Aggregation - Check if we have enough updates to run FedAvg
        if (clientUpdates.length >= MIN_UPDATES_FOR_AGGREGATION) {
            console.log(`Threshold reached (${MIN_UPDATES_FOR_AGGREGATION}). Triggering FedAvg...`);
            // TODO: Execute Federated Averaging (FedAvg) and Cosine Similarity checks
            
            // Clear the pool for the next epoch
            clientUpdates = []; 
        }
    });

    socket.on('disconnect', () => {
        console.log(`Node disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Parameter Server actively listening on port ${PORT}`);
});

let globalSwarmPoints = 0; // Track the total swarm contribution

io.on('connection', (socket) => {
    console.log(`Node connected: ${socket.id}`);
    
    // Immediately sync the new client with the global score
    socket.emit('swarm_points_update', globalSwarmPoints);

    if (globalModelWeights) {
        socket.emit('global_model_dispatch', globalModelWeights);
        console.log(`Dispatched global model to ${socket.id}`);
    }

    socket.on('client_update', (serializedWeights) => {
        console.log(`Received model update from ${socket.id}`);
        socket.emit('update_acknowledged');
    });

    // NEW: Listen for game scores and broadcast the new total to everyone
    socket.on('submit_score', (score) => {
        globalSwarmPoints += score;
        io.emit('swarm_points_update', globalSwarmPoints);
        console.log(`Node ${socket.id} contributed ${score} points. Total Swarm: ${globalSwarmPoints}`);
    });

    socket.on('disconnect', () => {
        console.log(`Node disconnected: ${socket.id}`);
    });
});