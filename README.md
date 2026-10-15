# COMP 3123 Assignment 1

This is an employee management API built with Node.js, Express, MongoDB and Mongoose. Users can sign up, log in and manage their own employees. The database is named `comp3123_assignment1`.

## Setup

Use Node.js 22 or newer and MongoDB locally or through Atlas.

```powershell
git clone https://github.com/YOUR_USERNAME/StudentNumber_COMP3123_Assignment1.git
cd StudentNumber_COMP3123_Assignment1
npm ci
Copy-Item .env.example .env
```

Replace the repository URL with your own. Set `MONGODB_URI` and `JWT_SECRET` in `.env`. The secret must be random and at least 32 characters. Start the local MongoDB service if using the example local URI. Then run:

```powershell
npm start
```

The local API runs at `http://localhost:3000`. To generate a JWT secret, run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Keep the result private.

`npm run demo` starts a real disposable MongoDB server for a quick local demonstration. The first run downloads MongoDB. Demo data is temporary; use `npm start` with your own database to keep records.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| MONGODB_URI | Private MongoDB connection string | Required |
| JWT_SECRET | Private JWT signing secret | Required |
| PORT | Local server port | 3000 |
| JWT_EXPIRES_IN | Token lifetime | 1h |
| AUTH_RATE_LIMIT | Combined signup and login limit per IP | 20 |
| API_RATE_LIMIT | General API limit per IP | 300 |
| RATE_WINDOW_MS | Limit window in milliseconds | 900000 |

The application selects `comp3123_assignment1` explicitly. `.env` is excluded from Git and the submission ZIP.

## Project structure

- `src/routes`: Express routes
- `src/controllers`: user and employee operations
- `src/models`: Mongoose schemas
- `src/middleware`: authentication, validation and error handling
- `src/validators`: Zod validation schemas
- `src/utils/logger.js`: local JSON logging
- `src/config.js`: environment checks and database connection
- `src/app.js`: Express app and Vercel entry point
- `src/server.js`: local server startup
- `scripts`: testing and demonstration scripts
- `postman`: exported Postman collection
- `logs`: sample log and locally generated logs
- `screenshots`: API and database evidence

## API endpoints

| Method | Endpoint | Success |
| --- | --- | --- |
| POST | /api/v1/user/signup | 201 |
| POST | /api/v1/user/login | 200 |
| GET | /api/v1/emp/employees | 200 |
| POST | /api/v1/emp/employees | 201 |
| GET | /api/v1/emp/employees/{eid} | 200 |
| PUT | /api/v1/emp/employees/{eid} | 200 |
| DELETE | /api/v1/emp/employees?eid=xxx | 204 |
| GET | /health | 200 |

Signup request:

```json
{"username":"marker_a","email":"marker.a@example.test","password":"DemoOnly!3123Pass"}
```

Login accepts either `username` or `email`, plus `password`. It returns a JWT in `data.token`. For employee endpoints, send `Authorization: Bearer <token>`.

Employee POST and PUT request:

```json
{
  "first_name": "Alex",
  "last_name": "Example",
  "email": "alex@example.test",
  "position": "Developer",
  "salary": 65000,
  "date_of_joining": "2026-10-01",
  "department": "Engineering"
}
```

PUT requires all editable fields. Salary must be a positive JSON number up to 1 billion. Dates use a valid `YYYY-MM-DD` calendar date. Unknown fields are rejected. Usernames allow 3–40 letters, digits or underscores. Passwords require 10–72 characters, up to 72 UTF-8 bytes, with uppercase, lowercase, a digit and a symbol.

Successful responses use `{"success":true,"data":...}`. Lists return an array. DELETE returns an empty body. Errors use `{"success":false,"error":{"code":"...","message":"..."}}`, with field details for validation errors.

## Authentication and ownership

Passwords are hashed using bcrypt with cost 12 and are excluded from API responses. JWTs use HS256, a fixed issuer and audience, and an expiry. Middleware checks the token and verifies that its user still exists.

Each employee has an immutable `user` ObjectId referencing its creator. The owner comes from the verified token. List, detail, update and delete queries include the owner. A client cannot assign or change ownership. Accessing another user's employee returns 403; an employee that does not exist returns 404.

## Security and errors

Helmet adds security headers, including CSP, frame protection and `X-Content-Type-Options: nosniff`. Express branding is disabled. Zod validates bodies, IDs, dates and field lengths. Request bodies are limited to 16 KB. Malformed JSON is handled by the central error middleware.

Rate limiting counts requests from each IP within a time window. Signup and login share 20 attempts per 15 minutes. General API traffic is limited to 300 per 15 minutes. Excess requests return 429, `Retry-After` and rate-limit headers. All attempts count. The test verifies that request 21 is blocked after 20 allowed authentication attempts.

The limiter store is local to each process. A shared store is needed for a global limit across multiple Vercel instances. Vercel is treated as one trusted reverse proxy.

Status codes: 400 invalid input, 401 invalid or missing authentication, 403 wrong employee owner, 404 missing resource, 409 duplicate username/email, 413 oversized body, 429 rate limit, and 500 unexpected server/database error. Internal diagnostics and stack traces are not returned to clients.

Secrets belong in environment variables. Do not publish `.env`, database passwords, JWT secrets or live tokens.

## Logs and health check

Local logs are written to `logs/application.log`. Each JSON line records a timestamp and event. Request logs include method, path, status and duration. Other events include login attempts, validation errors, ownership failures and employee changes. Request bodies, authorization headers and credentials are not logged. `logs/sample.log` contains verification examples.

`GET /health` checks the API and database. Example:

```json
{"success":true,"data":{"status":"ok","database":"connected","uptime_seconds":12}}
```

On Vercel, logs are printed to the deployment log stream and also written under `/tmp/employee-api-logs`. That directory is temporary. Local logging evidence is captured from a local run.

## Testing

```powershell
npm test
npm run verify:postman
```

The first command runs Supertest against an isolated real MongoDB server. It checks successful operations, validation, duplicate accounts, JWT errors, owner filtering, access in both directions, rate limits, hashing and safe database failures. The second runs the exported Postman collection through Newman. Neither command uses or clears your Atlas database. Newman is a development tool; its dependency audit currently reports advisories. `npm audit --omit=dev` reported zero production vulnerabilities during verification.

Import `postman/Employee_API.postman_collection.json` into Postman. Set `baseUrl` and run requests in order. The main suite expects a fresh database and `AUTH_RATE_LIMIT=100`; run the rate-limit folder separately after restarting with `AUTH_RATE_LIMIT=20`. Tokens and employee IDs are saved as collection variables. For the expired-token case, set `expiredToken` to an expired JWT generated with your local secret.

The API screenshots show real Newman request/response results displayed in an evidence viewer. They are labelled with their source. The Atlas screenshots show the live collections. Automated test details are included under `evidence`.

Demonstration accounts are `marker_a` / `marker.a@example.test` and `marker_b` / `marker.b@example.test`, both using the non-sensitive password `DemoOnly!3123Pass`. These accounts and one employee each were created in the configured Atlas database. To create them on another running API, use `npm run seed:demo`. The script does not delete data or change existing credentials. Never reuse this password for a real account.

## Vercel

Push the project to your own public `StudentNumber_COMP3123_Assignment1` repository and import it at https://vercel.com/new. Vercel detects Express through `src/app.js`; no static output directory or frontend build command is needed. Set `MONGODB_URI` and a fresh `JWT_SECRET` in the Vercel environment variables. Configure Atlas network access for the hosting environment. Deploy, check `/health`, then repeat the Postman requests with the deployed URL as `baseUrl`.

The project is ready for deployment, but no live Vercel URL has been created. GitHub upload, Vercel deployment and D2L submission are to be completed separately.

Reference: https://vercel.com/kb/guide/ship-a-express-app-on-vercel
