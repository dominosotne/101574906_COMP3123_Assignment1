const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const {MongoMemoryServer} = require('mongodb-memory-server');
const newman = require('newman');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
let mongo, server;
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /^(password|token)$/.test(key) ? '[REDACTED]' : sanitize(val)]));
  return value;
}
async function folder(name, collection) {
  return new Promise((resolve, reject) => newman.run({collection, folder: name, reporters: 'cli', color: 'off'}, (err, summary) => err ? reject(err) : resolve(summary)));
}
(async () => {
 try {
  fs.mkdirSync(output, {recursive: true});
  const dbPath = path.join(output, 'newman-db-' + Date.now());
  fs.mkdirSync(dbPath, {recursive: true});
  mongo = await MongoMemoryServer.create({instance: {dbPath}});
  process.env.MONGODB_URI = mongo.getUri('comp3123_assignment1');
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.AUTH_RATE_LIMIT = '100';
  process.env.API_RATE_LIMIT = '1000';
  let app = require('../src/app');
  const {User, Employee} = require('../src/models');
  await require('../src/config').connect();
  await Promise.all([User.init(), Employee.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const collection = JSON.parse(fs.readFileSync(path.join(root, 'postman/Employee_API.postman_collection.json')));
  collection.variable.find(v => v.key === 'baseUrl').value = 'http://127.0.0.1:' + server.address().port;
  // Expiration is verified before checking whether the subject exists.
  collection.variable.find(v => v.key === 'expiredToken').value = jwt.sign({}, process.env.JWT_SECRET, {subject: '000000000000000000000001', expiresIn: -1, issuer: 'employee-api', audience: 'employee-api-client'});
  const main = await folder('Main suite', collection);
  await new Promise(resolve => server.close(resolve));
  delete require.cache[require.resolve('../src/app')];
  process.env.AUTH_RATE_LIMIT = '20';
  app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  collection.variable.find(v => v.key === 'baseUrl').value = 'http://127.0.0.1:' + server.address().port;
  const rate = await folder('Rate limit isolated run', collection);
  const summaries = [main, rate];
  const evidence = summaries.flatMap(summary => summary.run.executions.map(execution => {
    const raw = execution.response?.stream?.toString() || '';
    let response; try {response = JSON.parse(raw);} catch {response = raw || '(empty body)';}
    let body; try {body = JSON.parse(execution.request.body?.raw || 'null');} catch {body = execution.request.body?.raw;}
    return {name: execution.item.name, method: execution.request.method, url: execution.request.url.toString().replace(/http:\/\/127\.0\.0\.1:\d+/, '{{baseUrl}}'), status: execution.response?.code, response: sanitize(response), request: sanitize(body), responseTime: execution.response?.responseTime, headers: execution.response?.headers.toJSON().filter(h => /^(content-type|x-content-type-options|x-frame-options|content-security-policy|ratelimit|retry-after)$/i.test(h.key)), assertions: execution.assertions?.map(a => ({assertion: a.assertion, passed: !a.error})), passed: execution.assertions?.every(a => !a.error)};
  }));
  fs.writeFileSync(path.join(output, 'newman-evidence.json'), JSON.stringify({tool: 'Newman Postman collection runner', timestamp: new Date().toISOString(), assertions: summaries.reduce((n,s) => n + s.run.stats.assertions.total, 0), failed: summaries.reduce((n,s) => n + s.run.failures.length, 0), executions: evidence}, null, 2));
  if (summaries.some(summary => summary.run.failures.length)) throw new Error('Newman assertions failed');
 } finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
 }
})().catch(error => {console.error(error); process.exitCode = 1;});
