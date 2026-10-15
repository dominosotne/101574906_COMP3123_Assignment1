const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {User} = require('../models');
const {ApiError} = require('../middleware');
const log = require('../utils/logger');
exports.signup = async (req, res) => {
  const data = req.validated;
  const user = await User.create({...data, password: await bcrypt.hash(data.password, 12)});
  log('signup_success', {userId: String(user._id)});
  res.status(201).json({success: true, data: user});
};
exports.login = async (req, res) => {
  const data = req.validated;
  const user = await User.findOne(data.username ? {username: data.username} : {email: data.email}).select('+password');
  // A constant valid hash keeps unknown-user attempts on the bcrypt path.
  const hash = user?.password || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5ZGOt8Y1WEYjI.Wv7bGvHhbZVs2P7nO';
  const valid = await bcrypt.compare(data.password, hash);
  if (!user || !valid) {log('login_failure'); throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username/email or password');}
  const token = jwt.sign({}, process.env.JWT_SECRET, {subject: String(user._id), expiresIn: process.env.JWT_EXPIRES_IN || '1h', algorithm: 'HS256', issuer: 'employee-api', audience: 'employee-api-client'});
  log('login_success', {userId: String(user._id)});
  res.json({success: true, data: {token, token_type: 'Bearer', user: user.toJSON()}});
};
