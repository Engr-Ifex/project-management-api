# API Documentation

## Overview

The Project Management API follows RESTful principles and provides endpoints for authentication, user management, workspaces, teams, projects, tasks, comments, labels, notifications, file management, and activity logs.

All endpoints return JSON responses and use standard HTTP status codes.

Base URL (Development)

```
http://localhost:5000/api/v1
```

---

# API Conventions

## Request Format

All requests should use JSON unless uploading files.

Example:

```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

---

## Success Response Format

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "data": {}
}
```

---

## Error Response Format

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": []
}
```

---

# Authentication

Base Route

```
/auth
```

| Method | Endpoint | Description | Auth Required |
|---------|----------|-------------|---------------|
| POST | /register | Register a user | No |
| POST | /login | Login | No |
| POST | /logout | Logout | Yes |
| GET | /me | Get current user | Yes |
| PATCH | /change-password | Change password | Yes |

---

# Users

Base Route

```
/users
```

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /profile | Get profile |
| PATCH | /profile | Update profile |
| DELETE | /profile | Delete account |
| PATCH | /avatar | Upload avatar |

---

# Workspaces

Base Route

```
/workspaces
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| GET | /:id |
| POST | / |
| PATCH | /:id |
| DELETE | /:id |
| PATCH | /:id/archive |
| PATCH | /:id/restore |

---

# Workspace Members

Base Route

```
/workspaces/:workspaceId/members
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| POST | /invite |
| PATCH | /:memberId/role |
| DELETE | /:memberId |

---

# Projects

Base Route

```
/projects
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| GET | /:id |
| POST | / |
| PATCH | /:id |
| DELETE | /:id |
| PATCH | /:id/archive |
| PATCH | /:id/restore |

---

# Tasks

Base Route

```
/tasks
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| GET | /:id |
| POST | / |
| PATCH | /:id |
| DELETE | /:id |

Additional Routes

| Method | Endpoint |
|---------|----------|
| PATCH | /:id/status |
| PATCH | /:id/priority |
| PATCH | /:id/assign |
| PATCH | /:id/archive |
| PATCH | /:id/restore |

---

# Comments

Base Route

```
/comments
```

| Method | Endpoint |
|---------|----------|
| GET | /task/:taskId |
| POST | / |
| PATCH | /:id |
| DELETE | /:id |

---

# Labels

Base Route

```
/labels
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| POST | / |
| PATCH | /:id |
| DELETE | /:id |

---

# Notifications

Base Route

```
/notifications
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| PATCH | /:id/read |
| PATCH | /read-all |
| DELETE | /:id |

---

# Activity Logs

Base Route

```
/activity-logs
```

| Method | Endpoint |
|---------|----------|
| GET | / |
| GET | /:id |

---

# File Uploads

Base Route

```
/uploads
```

| Method | Endpoint |
|---------|----------|
| POST | / |
| DELETE | /:id |

---

# Dashboard

Base Route

```
/dashboard
```

| Method | Endpoint |
|---------|----------|
| GET | /overview |
| GET | /projects |
| GET | /tasks |

---

# Search

Base Route

```
/search
```

| Method | Endpoint |
|---------|----------|
| GET | / |

Query Parameters

```
?q=
&type=
&page=
&limit=
```

---

# Query Parameters

Supported query parameters:

Pagination

```
?page=1
&limit=10
```

Sorting

```
?sort=createdAt
?order=asc
```

Filtering

```
?status=completed
?priority=high
?assignedTo=userId
```

Search

```
?q=design
```

---

# Authentication

Protected endpoints require a valid JWT.

Example Header

```
Authorization: Bearer <token>
```

---

# HTTP Status Codes

| Code | Meaning |
|------|----------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

# Error Codes

Examples

```
AUTH_INVALID_CREDENTIALS

AUTH_UNAUTHORIZED

AUTH_FORBIDDEN

USER_NOT_FOUND

PROJECT_NOT_FOUND

TASK_NOT_FOUND

VALIDATION_ERROR
```

---

# Versioning

Current Version

```
v1
```

Base URL

```
/api/v1
```

Future versions should be introduced without breaking existing clients.

Example

```
/api/v2
```

---

# Rate Limiting

Authentication routes will have stricter limits than general endpoints to reduce abuse.

---

# API Security

The API uses:

- JWT Authentication
- Password Hashing
- Helmet
- CORS
- Input Validation
- Role-Based Authorization
- Rate Limiting

---

# Future Endpoints

Potential additions include:

- WebSocket Notifications
- Audit Reports
- Bulk Task Operations
- Team Analytics
- Import / Export