// Runs a REAL disposable mongod process. Data is intentionally temporary.
const {MongoMemoryServer} = require('mongodb-memory-server');
const crypto = require('node:crypto');
(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('comp3123_assignment1');
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.log('Disposable local demo: data is deleted on shutdown. Use .env and npm start for persistent MongoDB.');
  require('../src/server');
  process.on('SIGINT', async () => {await mongo.stop(); process.exit();});
})();
