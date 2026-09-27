const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

let mongoServer;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/user', require('../routes/userLogin'));
    app.use('/user', require('../routes/userSignUp'));
    return app;
}

async function connect() {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
}

async function disconnect() {
    await mongoose.disconnect();
    await mongoServer.stop();
}

async function clearDB() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

module.exports = { buildApp, connect, disconnect, clearDB };
