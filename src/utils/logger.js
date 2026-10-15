const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.VERCEL ? '/tmp/employee-api-logs' : path.resolve(__dirname, '../../logs');
function log(event, details = {}) {
  // Callers supply only allowlisted metadata; never request bodies, credentials, or headers.
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details });
  console.log(entry);
  try { fs.mkdirSync(directory, { recursive: true }); fs.appendFileSync(path.join(directory, 'application.log'), entry + '\n'); }
  catch { console.error('Local log write failed'); }
}
module.exports = log;
