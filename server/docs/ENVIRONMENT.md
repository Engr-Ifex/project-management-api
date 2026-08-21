# Environment Variables

## Overview

The Project Management API uses environment variables to store configuration values and sensitive information.

Environment variables allow the application to behave differently depending on the environment (development, testing, or production) without changing the source code.

Sensitive values such as database connection strings, JWT secrets, and API keys must never be hardcoded or committed to version control.

---

# Environment Files

The project uses the following environment files:

```
.env
.env.example
```

### .env

Contains the actual environment variable values used during development.

> This file **must not** be committed to Git.

### .env.example

Contains placeholder values for all required environment variables.

This file should always be committed so other developers know which variables are required.

---

# Environment Types

The application supports the following environments:

- development
- test
- production

Example:

```env
NODE_ENV=development
```

---

# Required Variables

## Application

### PORT

Description

The port on which the Express server runs.

Example

```env
PORT=5000
```

Required

✅ Yes

---

### NODE_ENV

Description

Specifies the current runtime environment.

Allowed Values

- development
- test
- production

Example

```env
NODE_ENV=development
```

Required

✅ Yes

---

## Database

### MONGODB_URI

Description

MongoDB connection string.

Development Example

```env
MONGODB_URI=mongodb://localhost:27017/project-management-api
```

Production Example

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/project-management-api
```

Required

✅ Yes

---

## Authentication

### JWT_SECRET

Description

Secret key used to sign JSON Web Tokens.

Example

```env
JWT_SECRET=your-super-secret-key
```

Required

✅ Yes

---

### JWT_EXPIRES_IN

Description

Defines how long access tokens remain valid.

Example

```env
JWT_EXPIRES_IN=7d
```

Required

✅ Yes

---

## Logging

### LOG_LEVEL

Description

Controls the amount of log output.

Allowed Values

- error
- warn
- info
- debug

Example

```env
LOG_LEVEL=info
```

Required

❌ Optional

---

## CORS

### CLIENT_URL

Description

Frontend application URL allowed by CORS.

Example

```env
CLIENT_URL=http://localhost:5173
```

Required

✅ Yes

---

# Future Variables

These variables are reserved for future features.

---

## Email

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## Cloud Storage

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

---

## Redis

```env
REDIS_URL=
```

---

## Monitoring

```env
SENTRY_DSN=
```

---

## Rate Limiting

```env
RATE_LIMIT_WINDOW_MS=900000

RATE_LIMIT_MAX_REQUESTS=100
```

---

# Variable Naming Guidelines

All environment variables should:

- Use uppercase letters.
- Use underscores to separate words.
- Have descriptive names.
- Follow a consistent naming convention.

Examples

```env
JWT_SECRET

MONGODB_URI

CLIENT_URL

LOG_LEVEL
```

---

# Security Guidelines

- Never commit `.env` to Git.
- Never expose secrets in logs.
- Never hardcode sensitive values.
- Rotate secrets periodically.
- Use strong, randomly generated values for production.

---

# Validation

The application validates required environment variables during startup.

If any required variable is missing, the application should fail to start and display a clear error message.

Example:

```
❌ Missing required environment variable: JWT_SECRET
```

---

# Example `.env.example`

```env
# Application
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=

# Authentication
JWT_SECRET=
JWT_EXPIRES_IN=7d

# Client
CLIENT_URL=http://localhost:5173

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Email (Future)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Cloud Storage (Future)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Redis (Future)
REDIS_URL=

# Monitoring (Future)
SENTRY_DSN=
```

---

# Summary

Environment variables separate configuration from application code, making the Project Management API easier to configure, deploy, and secure across different environments.

All required variables are documented in this file and mirrored in `.env.example`.
