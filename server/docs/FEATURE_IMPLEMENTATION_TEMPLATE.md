# Feature Implementation Template

## Overview

This document defines the standard process for implementing every feature in the Project Management API.

Each feature should follow this workflow from planning to completion.

No step should be skipped.

---

# Feature Information

Feature Name:

```
Example: User Authentication
```

Module:

```
Authentication
```

Current Phase:

```
Phase 4
```

Status:

```
⬜ Not Started
🟡 In Progress
🟢 Completed
```

Developer:

```
Your Name
```

Start Date:

```
YYYY-MM-DD
```

Completion Date:

```
YYYY-MM-DD
```

---

# Step 1 — Understand the Feature

## Objective

Write a short description of what the feature should accomplish.

Example:

```
Allow users to securely register, log in, and access protected resources.
```

---

## Requirements

List all functional requirements.

Example:

- User can register.
- User can log in.
- Passwords are hashed.
- JWT is generated.
- Protected routes require authentication.

---

## Business Rules

Example:

- Email must be unique.
- Password must meet security requirements.
- Users cannot access another user's data without permission.

---

# Step 2 — Database Design

## Collection

Example:

```
users
```

---

## Schema Fields

| Field     | Type   | Required | Default      |
| --------- | ------ | -------- | ------------ |
| name      | String | Yes      | -            |
| email     | String | Yes      | -            |
| password  | String | Yes      | -            |
| createdAt | Date   | Yes      | Current Date |

---

## Relationships

List related collections.

---

## Indexes

List indexes that should be created.

---

# Step 3 — API Design

## Endpoint

Example:

```
POST /auth/register
```

---

## Request Body

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123!"
}
```

---

## Success Response

```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {}
}
```

---

## Error Responses

- Validation Error
- Email Already Exists
- Internal Server Error

---

# Step 4 — Validation

## Validation Rules

- Required fields
- Email format
- Password length
- Password complexity

---

## Validator File

```
authValidator.js
```

---

# Step 5 — Model

Checklist:

- [ ] Create schema
- [ ] Add timestamps
- [ ] Add indexes
- [ ] Add default values
- [ ] Export model

---

# Step 6 — Service

Checklist:

- [ ] Create service file
- [ ] Implement business logic
- [ ] Handle edge cases
- [ ] Throw custom errors

---

# Step 7 — Controller

Checklist:

- [ ] Handle request
- [ ] Call service
- [ ] Return response
- [ ] Handle errors

---

# Step 8 — Routes

Checklist:

- [ ] Create routes
- [ ] Register routes
- [ ] Apply middleware

---

# Step 9 — Middleware

Determine whether the feature requires:

- [ ] Authentication
- [ ] Authorization
- [ ] Validation
- [ ] Rate Limiting
- [ ] File Upload
- [ ] Logging

---

# Step 10 — Security

Verify:

- [ ] Password hashing
- [ ] Input validation
- [ ] Secure responses
- [ ] Environment variables
- [ ] Role verification
- [ ] Resource ownership

---

# Step 11 — Testing

## Manual Testing

- [ ] Successful request
- [ ] Invalid input
- [ ] Unauthorized request
- [ ] Forbidden request
- [ ] Resource not found
- [ ] Duplicate resource
- [ ] Edge cases

---

## Automated Testing

- [ ] Unit tests
- [ ] Integration tests

---

# Step 12 — Documentation

Update:

- [ ] API.md
- [ ] DATABASE.md
- [ ] FEATURES.md
- [ ] CHANGELOG.md

---

# Step 13 — Refactoring

Review:

- [ ] Naming conventions
- [ ] Code duplication
- [ ] Readability
- [ ] Performance
- [ ] Folder structure

---

# Step 14 — Definition of Done

A feature is complete only if:

- [ ] Database updated
- [ ] Validation implemented
- [ ] Business logic completed
- [ ] Controllers completed
- [ ] Routes completed
- [ ] Middleware applied
- [ ] Security verified
- [ ] Testing completed
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Feature works correctly

---

# Lessons Learned

Document anything learned while implementing the feature.

Examples:

- Better validation approach
- Simpler query
- Performance improvement
- Common mistake to avoid

---

# Known Limitations

List any current limitations or technical debt.

---

# Future Improvements

Ideas for enhancing this feature later.

Example:

- Add caching
- Improve performance
- Add pagination
- Add search

---

# Completion Summary

Feature:

Status:

Completed On:

Time Taken:

Summary:

```
Briefly describe what was implemented, what challenges were encountered, and how they were resolved.
```
