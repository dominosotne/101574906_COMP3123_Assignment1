const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {MongoMemoryServer} = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '..');
const results = [], collection = [];
const secret = crypto.randomBytes(48).toString('hex');
process.env.JWT_SECRET = secret;
process.env.AUTH_RATE_LIMIT = '100';
process.env.API_RATE_LIMIT = '1000';
const password = 'DemoOnly!3123Pass';
const employee = {first_name: 'Alex', last_name: 'Example', email: 'alex@example.test', position: 'Developer', salary: 65000, date_of_joining: '2026-10-01', department: 'Engineering'};
let app, mongo, tokenA, tokenB, eidA, eidB;
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /^(token|password)$/.test(key) ? '[REDACTED]' : scrub(val)]));
  return value;
}
async function run(name, method, url, expected, body, token, options = {}) {
  let req = request(app)[method.toLowerCase()](url);
  if (token) req = req.set('Authorization', 'Bearer ' + token);
  if (options.raw) req = req.set('Content-Type', 'application/json');
  if (body !== undefined) req = req.send(body);
  const res = await req;
  results.push({name, method, url, expected, status: res.status, passed: res.status === expected, request: scrub(body), response: scrub(res.body), headers: Object.fromEntries(Object.entries(res.headers).filter(([key]) => /^(content-type|x-content-type-options|x-frame-options|content-security-policy|ratelimit|retry-after)/.test(key)))});
  const item = {name, request: {method, header: [{key: 'Content-Type', value: 'application/json'}], url: '{{baseUrl}}' + (options.url || url), ...(body !== undefined ? {body: {mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2)}} : {})}, event: [{listen: 'test', script: {type: 'text/javascript', exec: [`pm.test(${JSON.stringify('HTTP ' + expected)}, function () { pm.response.to.have.status(${expected}); });`, ...(options.save ? [options.save] : [])]}}]};
  if (token) item.request.header.push({key: 'Authorization', value: 'Bearer ' + (token === tokenA ? '{{tokenA}}' : token === tokenB ? '{{tokenB}}' : token === 'invalid.token.here' ? token : '{{expiredToken}}')});
  collection.push(item);
  assert.equal(res.status, expected, name + ': ' + JSON.stringify(res.body));
  return res;
}
(async () => {
 try {
  const dbPath = path.join(root, 'test-results', 'mongo-' + Date.now());
  fs.mkdirSync(dbPath, {recursive: true});
  mongo = await MongoMemoryServer.create({instance: {dbPath}});
  process.env.MONGODB_URI = mongo.getUri('comp3123_assignment1');
  app = require('../src/app');
  const {User, Employee} = require('../src/models');
  await require('../src/config').connect();
  await Promise.all([User.init(), Employee.init()]);
  await run('Health and MongoDB connectivity', 'GET', '/health', 200);
  const a = {username: 'marker_a', email: 'marker.a@example.test', password};
  const b = {username: 'marker_b', email: 'marker.b@example.test', password};
  const userA = await run('Signup user A', 'POST', '/api/v1/user/signup', 201, a);
  await run('Signup user B', 'POST', '/api/v1/user/signup', 201, b);
  assert.ok(!JSON.stringify(userA.body).includes('password'));
  await run('Duplicate username', 'POST', '/api/v1/user/signup', 409, {...a, email: 'other@example.test'});
  await run('Duplicate email', 'POST', '/api/v1/user/signup', 409, {...a, username: 'different'});
  await run('Signup invalid email', 'POST', '/api/v1/user/signup', 400, {...a, email: 'bad'});
  await run('Signup weak password', 'POST', '/api/v1/user/signup', 400, {...a, password: 'weak'});
  await run('Signup missing fields', 'POST', '/api/v1/user/signup', 400, {});
  const saveA = "pm.collectionVariables.set('tokenA', pm.response.json().data.token);";
  tokenA = (await run('Login with username', 'POST', '/api/v1/user/login', 200, {username: a.username, password}, null, {save: saveA})).body.data.token;
  await run('Login with email', 'POST', '/api/v1/user/login', 200, {email: a.email, password}, null, {save: saveA});
  tokenB = (await run('Login user B', 'POST', '/api/v1/user/login', 200, {email: b.email, password}, null, {save: "pm.collectionVariables.set('tokenB', pm.response.json().data.token);"})).body.data.token;
  await run('Invalid login credentials', 'POST', '/api/v1/user/login', 401, {username: a.username, password: 'incorrect'});
  await run('Missing login credentials', 'POST', '/api/v1/user/login', 400, {});
  await run('Reject NoSQL injection', 'POST', '/api/v1/user/login', 400, {username: {$ne: null}, password});
  await run('Employee create without token', 'POST', '/api/v1/emp/employees', 401, employee);
  await run('Employee list without token', 'GET', '/api/v1/emp/employees', 401);
  await run('Invalid JWT', 'GET', '/api/v1/emp/employees', 401, undefined, 'invalid.token.here');
  const expired = jwt.sign({}, secret, {subject: String(userA.body.data._id), expiresIn: -1, issuer: 'employee-api', audience: 'employee-api-client'});
  await run('Expired JWT', 'GET', '/api/v1/emp/employees', 401, undefined, expired);
  eidA = (await run('Create employee A', 'POST', '/api/v1/emp/employees', 201, employee, tokenA, {save: "pm.collectionVariables.set('eidA', pm.response.json().data._id);"})).body.data._id;
  eidB = (await run('Create employee B', 'POST', '/api/v1/emp/employees', 201, {...employee, first_name: 'Blair', email: 'blair@example.test'}, tokenB, {save: "pm.collectionVariables.set('eidB', pm.response.json().data._id);"})).body.data._id;
  for (const [name, data] of [['Missing employee fields', {}], ['Invalid employee email', {...employee, email: 'invalid'}], ['Invalid salary', {...employee, salary: -1}], ['Salary string rejected', {...employee, salary: '500'}], ['Invalid calendar date', {...employee, date_of_joining: '2026-02-30'}], ['Client owner injection rejected', {...employee, user: userA.body.data._id}]]) await run(name, 'POST', '/api/v1/emp/employees', 400, data, tokenA);
  const listA = await run('List user A employees only', 'GET', '/api/v1/emp/employees', 200, undefined, tokenA);
  assert.deepEqual(listA.body.data.map(e => e._id), [eidA]);
  const listB = await run('List user B employees only', 'GET', '/api/v1/emp/employees', 200, undefined, tokenB);
  assert.deepEqual(listB.body.data.map(e => e._id), [eidB]);
  for (const [label, token, own, other, ownVar, otherVar] of [['A', tokenA, eidA, eidB, 'eidA', 'eidB'], ['B', tokenB, eidB, eidA, 'eidB', 'eidA']]) {
    await run('Get own employee ' + label, 'GET', '/api/v1/emp/employees/' + own, 200, undefined, token, {url: '/api/v1/emp/employees/{{' + ownVar + '}}'});
    await run('Update own employee ' + label, 'PUT', '/api/v1/emp/employees/' + own, 200, {...employee, salary: 70000}, token, {url: '/api/v1/emp/employees/{{' + ownVar + '}}'});
    await run(label + ' cannot get other owner employee', 'GET', '/api/v1/emp/employees/' + other, 403, undefined, token, {url: '/api/v1/emp/employees/{{' + otherVar + '}}'});
    await run(label + ' cannot update other owner employee', 'PUT', '/api/v1/emp/employees/' + other, 403, employee, token, {url: '/api/v1/emp/employees/{{' + otherVar + '}}'});
    await run(label + ' cannot delete other owner employee', 'DELETE', '/api/v1/emp/employees?eid=' + other, 403, undefined, token, {url: '/api/v1/emp/employees?eid={{' + otherVar + '}}'});
  }
  await run('Invalid employee ID', 'GET', '/api/v1/emp/employees/invalid', 400, undefined, tokenA);
  await run('Nonexistent employee', 'GET', '/api/v1/emp/employees/000000000000000000000001', 404, undefined, tokenA);
  await run('Delete requires employee ID', 'DELETE', '/api/v1/emp/employees', 400, undefined, tokenA);
  await run('Malformed JSON', 'POST', '/api/v1/user/signup', 400, '{"username":', undefined, {raw: true});
  await run('Unknown route', 'GET', '/missing', 404);
  const headers = await request(app).get('/health');
  assert.equal(headers.headers['x-content-type-options'], 'nosniff');
  assert.ok(headers.headers['content-security-policy']);
  const users = await User.find().select('+password').lean();
  const bcrypt = require('bcryptjs');
  assert.ok(await bcrypt.compare(password, users[0].password));
  assert.ok(users.every(u => u.password.startsWith('$2')));
  fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
  fs.writeFileSync(path.join(root, 'test-results/database.json'), JSON.stringify({database: mongoose.connection.name, users, employees: await Employee.find().lean()}, null, 2));
  await run('Delete own employee A', 'DELETE', '/api/v1/emp/employees?eid=' + eidA, 204, undefined, tokenA, {url: '/api/v1/emp/employees?eid={{eidA}}'});
  await run('Deleted employee is absent', 'GET', '/api/v1/emp/employees/' + eidA, 404, undefined, tokenA, {url: '/api/v1/emp/employees/{{eidA}}'});
  await run('Delete own employee B', 'DELETE', '/api/v1/emp/employees?eid=' + eidB, 204, undefined, tokenB, {url: '/api/v1/emp/employees?eid={{eidB}}'});
  // Isolated fault injection exercises the production error handler without a public debug route.
  const original = Employee.find;
  Employee.find = () => {throw new Error('Private database diagnostic that must never reach the client');};
  const fault = await run('Database failure safely returns 500', 'GET', '/api/v1/emp/employees', 500, undefined, tokenA);
  assert.ok(!JSON.stringify(fault.body).includes('Private database'));
  Employee.find = original;
  collection.pop(); // Fault injection is automated-only, not a production Postman request.
  // A separate app instance uses the normal authentication limit for an isolated limiter test.
  delete require.cache[require.resolve('../src/app')];
  process.env.AUTH_RATE_LIMIT = '20';
  app = require('../src/app');
  for (let i = 1; i <= 21; i++) await run('Rate limit attempt ' + i, 'POST', '/api/v1/user/login', i === 21 ? 429 : 401, {username: 'nobody', password: 'incorrect'});
  const postman = {info: {name: 'COMP3123 Employee API verification', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Run in order on a fresh database. Auth limit 100 for the main suite; the last folder requires a fresh server with AUTH_RATE_LIMIT=20. See README. Expired token must be generated using the local secret.'}, variable: [{key: 'baseUrl', value: 'http://localhost:3000'}, {key: 'tokenA', value: ''}, {key: 'tokenB', value: ''}, {key: 'eidA', value: ''}, {key: 'eidB', value: ''}, {key: 'expiredToken', value: ''}], item: [{name: 'Main suite', item: collection.filter(x => !x.name.startsWith('Rate limit attempt'))}, {name: 'Rate limit isolated run', item: collection.filter(x => x.name.startsWith('Rate limit attempt'))}]};
  fs.mkdirSync(path.join(root, 'postman'), {recursive: true});
  fs.writeFileSync(path.join(root, 'postman/Employee_API.postman_collection.json'), JSON.stringify(postman, null, 2));
 } finally {
  fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
  fs.writeFileSync(path.join(root, 'test-results/results.json'), JSON.stringify(results, null, 2));
  console.log('RESULTS: ' + results.filter(r => r.passed).length + '/' + results.length + ' passed');
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
 }
})().catch(error => {console.error(error); process.exitCode = 1;});
