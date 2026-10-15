const jwt = require('jsonwebtoken');
const {User} = require('../models');
const log = require('../utils/logger');
class ApiError extends Error { constructor(status, code, message, details) { super(message); Object.assign(this, {status, code, details}); } }
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data', result.error.issues.map(issue => ({field: issue.path.join('.'), message: issue.message}))));
    req.validated = result.data; next();
  };
}
async function authenticate(req, _res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) throw new ApiError(401, 'MISSING_TOKEN', 'A Bearer token is required');
  let payload;
  try { payload = jwt.verify(match[1], process.env.JWT_SECRET, {algorithms: ['HS256'], issuer: 'employee-api', audience: 'employee-api-client'}); }
  catch(error) { throw new ApiError(401, error.name === 'TokenExpiredError' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN', 'Token is invalid or expired'); }
  if (typeof payload.sub !== 'string' || !/^[0-9a-f]{24}$/i.test(payload.sub)) throw new ApiError(401, 'INVALID_TOKEN', 'Invalid token subject');
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'INVALID_TOKEN', 'Token user no longer exists');
  req.user = user; next();
}
function errors(error, req, res, _next) {
  let status = error.status || 500, code = error.code || 'INTERNAL_ERROR', message = error.message;
  if (error.code === 11000) {status = 409; code = 'DUPLICATE_USER'; message = 'Username or email already exists';}
  else if (error.type === 'entity.parse.failed') {status = 400; code = 'MALFORMED_JSON'; message = 'Request body must be valid JSON';}
  else if (error.type === 'entity.too.large') {status = 413; code = 'BODY_TOO_LARGE'; message = 'Request body exceeds 16 KB';}
  else if (error.name === 'ValidationError' || error.name === 'CastError') {status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request data';}
  if (status >= 500) {code = 'INTERNAL_ERROR'; message = 'An unexpected server error occurred';}
  log(status >= 500 ? 'application_error' : 'request_rejected', {status, code, method: req.method, path: req.path});
  res.status(status).json({success: false, error: {code, message, ...(error.details && status < 500 ? {details: error.details} : {})}});
}
module.exports = {ApiError, validate, authenticate, errors};
