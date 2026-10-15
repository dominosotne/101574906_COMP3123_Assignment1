const mongoose = require('mongoose');
const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };
const User = mongoose.model('User', new mongoose.Schema({
  username: {type: String, required: true, unique: true, minlength: 3, maxlength: 40},
  email: {type: String, required: true, unique: true, lowercase: true, maxlength: 254},
  password: {type: String, required: true, select: false}
}, {timestamps, toJSON: {transform(_doc, ret) {delete ret.password; delete ret.__v; return ret;}}}));
const employeeSchema = new mongoose.Schema({
  first_name: {type: String, required: true, maxlength: 80},
  last_name: {type: String, required: true, maxlength: 80},
  email: {type: String, required: true, lowercase: true, maxlength: 254},
  position: {type: String, required: true, maxlength: 120},
  salary: {type: Number, required: true, min: 0.01, max: 1000000000},
  date_of_joining: {type: Date, required: true},
  department: {type: String, required: true, maxlength: 120},
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true}
}, {timestamps, versionKey: false});
employeeSchema.index({user: 1, created_at: -1});
const Employee = mongoose.model('Employee', employeeSchema);
module.exports = {User, Employee};
