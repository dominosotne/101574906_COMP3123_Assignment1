const app = require('./app');
const {connect} = require('./config');
const log = require('./utils/logger');
connect().then(() => app.listen(process.env.PORT || 3000, () => log('server_started', {port: Number(process.env.PORT || 3000)}))).catch(() => {log('startup_failure', {reason: 'Database connection failed'}); process.exitCode = 1;});
