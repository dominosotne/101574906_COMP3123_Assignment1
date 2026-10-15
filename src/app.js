const express = require('express');
const helmet = require('helmet');
const {rateLimit} = require('express-rate-limit');
const mongoose = require('mongoose');
const {connect, checkConfig} = require('./config');
const {ApiError, errors} = require('./middleware');
const {userRouter, employeeRouter} = require('./routes');
const log = require('./utils/logger');
checkConfig();
const app = express();
app.disable('x-powered-by');
// Vercel is the single trusted reverse proxy; do not trust arbitrary proxy chains.
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use(helmet());
app.use((req, res, next) => {const start = Date.now(); res.on('finish', () => log('request', {method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start})); next();});
function limiter(limit) {return rateLimit({windowMs: Number(process.env.RATE_WINDOW_MS || 900000), limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests; retry after the rate limit window'))});}
app.use('/api', limiter(Number(process.env.API_RATE_LIMIT || 300)));
app.use('/api/v1/user', limiter(Number(process.env.AUTH_RATE_LIMIT || 20)));
app.use(express.json({limit: '16kb', strict: true}));
app.use(async (_req, _res, next) => {await connect(); next();});
app.get('/health', (_req, res) => res.json({success: true, data: {status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', uptime_seconds: Math.floor(process.uptime())}}));
app.use('/api/v1/user', userRouter);
app.use('/api/v1/emp', employeeRouter);
app.use((_req, _res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'Route not found')));
app.use(errors);
module.exports = app;
