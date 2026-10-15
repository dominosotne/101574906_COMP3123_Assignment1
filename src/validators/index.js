const { z } = require('zod');
const text = max => z.string().trim().min(1).max(max);
const email = z.string().trim().max(254).email().transform(value => value.toLowerCase());
const password = z.string().min(10).max(72).refine(value => Buffer.byteLength(value) <= 72, 'Password must fit within 72 UTF-8 bytes').regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9]/);
const signup = z.object({username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_]+$/), email, password}).strict();
const login = z.object({username: text(40).optional(), email: email.optional(), password: z.string().min(1).max(128)}).strict().refine(value => Boolean(value.username) !== Boolean(value.email), 'Provide exactly one of username or email');
const employee = z.object({first_name: text(80), last_name: text(80), email, position: text(120), salary: z.number().positive().max(1000000000), date_of_joining: z.iso.date(), department: text(120)}).strict();
const id = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected a valid MongoDB ObjectId');
module.exports = {signup, login, employee, id};
