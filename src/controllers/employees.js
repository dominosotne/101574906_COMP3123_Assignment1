const {Employee} = require('../models');
const {ApiError} = require('../middleware');
const {id} = require('../validators');
const log = require('../utils/logger');
async function owned(req, eid) {
  if (!id.safeParse(eid).success) throw new ApiError(400, 'INVALID_ID', 'A valid employee ID is required');
  const employee = await Employee.findOne({_id: eid, user: req.user._id});
  if (employee) return employee;
  if (await Employee.exists({_id: eid})) throw new ApiError(403, 'FORBIDDEN', 'You cannot access another user employee');
  throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
}
exports.list = async (req, res) => res.json({success: true, data: await Employee.find({user: req.user._id}).sort({created_at: -1})});
exports.create = async (req, res) => {
  const employee = await Employee.create({...req.validated, user: req.user._id});
  log('employee_created', {userId: String(req.user._id), employeeId: String(employee._id)});
  res.status(201).json({success: true, data: employee});
};
exports.get = async (req, res) => res.json({success: true, data: await owned(req, req.params.eid)});
exports.update = async (req, res) => {
  const employee = await owned(req, req.params.eid);
  // Include owner in the write query too; request body never controls ownership.
  const updated = await Employee.findOneAndUpdate({_id: employee._id, user: req.user._id}, {$set: req.validated}, {new: true, runValidators: true});
  log('employee_updated', {employeeId: String(employee._id)});
  res.json({success: true, data: updated});
};
exports.remove = async (req, res) => {
  const employee = await owned(req, req.validated.eid);
  await Employee.deleteOne({_id: employee._id, user: req.user._id});
  log('employee_deleted', {employeeId: String(employee._id)});
  res.status(204).send();
};
