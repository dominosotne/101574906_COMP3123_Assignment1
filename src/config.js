require('dotenv').config();
const mongoose = require('mongoose');
let connection;
async function connect() {
  if (connection) return connection;
  if (mongoose.connection.readyState === 1) return;
  if (!connection) connection = mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'comp3123_assignment1', serverSelectionTimeoutMS: 5000
  }).then(async () => {
    const {User, Employee} = require('./models');
    await Promise.all([User.init(), Employee.init()]);
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}
function checkConfig() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
}
module.exports = { connect, checkConfig };
