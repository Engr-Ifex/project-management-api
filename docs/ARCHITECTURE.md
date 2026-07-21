# Architecture

## Overview

The Project Management API follows a layered architecture designed to promote scalability, maintainability, separation of concerns, and code reusability.

Each layer of the application has a clearly defined responsibility, ensuring that business logic, routing, validation, and data access remain independent from one another.

The application is structured to resemble a production-ready backend system rather than a simple CRUD project.

---

# Architecture Style

The application follows a layered architecture consisting of the following layers:

```
Client
    │
    ▼
Routes
    │
    ▼
Middlewares
    │
    ▼
Controllers
    │
    ▼
Services
    │
    ▼
Models (Mongoose)
    │
    ▼
MongoDB
```

---

# Architectural Principles

The project is built around the following principles:

- Separation of Concerns
- Single Responsibility Principle
- Reusability
- Scalability
- Maintainability
- Readability
- Security First
- Modular Design

---

# Folder Structure

```
server/

├── src/
│
├── config/
├── constants/
├── controllers/
├── database/
├── docs/
├── errors/
├── lib/
├── middlewares/
├── models/
├── routes/
├── services/
├── uploads/
├── utils/
├── validators/
│
├── app.js
├── server.js
```

---

# Layer Responsibilities

## Routes

Responsible for defining API endpoints.

Responsibilities:

- Define endpoints
- Apply middleware
- Forward requests to controllers

Routes should contain **no business logic**.

---

## Controllers

Responsible for handling HTTP requests and responses.

Responsibilities:

- Receive requests
- Extract request data
- Call services
- Return responses

Controllers should remain thin.

Business logic should never be placed here.

---

## Services

Responsible for business logic.

Responsibilities:

- Process application logic
- Communicate with database models
- Apply business rules
- Coordinate multiple models

Services contain the core functionality of the application.

---

## Models

Responsible for interacting with MongoDB.

Responsibilities:

- Define schemas
- Apply validations
- Create indexes
- Define relationships
- Database queries

Models should not contain business logic.

---

## Middlewares

Responsible for processing requests before they reach controllers.

Examples:

- Authentication
- Authorization
- Error Handling
- Validation
- Logging
- Rate Limiting

---

## Validators

Responsible for validating incoming request data.

Validation includes:

- Required fields
- Email validation
- Password validation
- Object IDs
- Custom rules

---

## Utilities

Reusable helper functions.

Examples:

- Async handler
- API response formatter
- Date formatter
- Pagination helper

---

## Constants

Application-wide constants.

Examples:

- User roles
- HTTP status codes
- Error messages
- Success messages

---

## Config

Application configuration.

Examples:

- Database connection
- Environment variables
- Logger
- JWT configuration

---

## Database

Responsible for:

- MongoDB connection
- Database initialization

---

## Errors

Custom error classes.

Examples:

- ApiError
- AuthenticationError
- ValidationError
- NotFoundError

---

## Uploads

Temporary storage for uploaded files.

This may later be replaced by cloud storage.

---

# Request Lifecycle

A request follows the sequence below:

```
Client

↓

Route

↓

Middleware

↓

Controller

↓

Service

↓

Model

↓

MongoDB

↓

Service

↓

Controller

↓

Response
```

---

# Error Handling Flow

```
Request

↓

Controller

↓

Service

↓

Error

↓

Global Error Handler

↓

Standardized Error Response
```

---

# Authentication Flow

```
User Login

↓

Validate Credentials

↓

Hash Comparison

↓

Generate JWT

↓

Return Token

↓

Protected Route

↓

Authentication Middleware

↓

Authorized Request
```

---

# Authorization Flow

```
Authenticated User

↓

Role Verification

↓

Permission Check

↓

Resource Ownership

↓

Access Granted / Denied
```

---

# Naming Conventions

## Files

Use camelCase.

Examples:

```
userController.js

taskService.js

projectRoutes.js
```

---

## Models

Use PascalCase.

```
User.js

Task.js

Project.js
```

---

## Variables

Use camelCase.

```
projectOwner

assignedUser

taskPriority
```

---

## Constants

Use UPPER_SNAKE_CASE.

```
JWT_SECRET

MAX_FILE_SIZE

DEFAULT_PAGE_SIZE
```

---

# API Design Principles

The API follows RESTful conventions.

Examples:

```
GET     /projects

GET     /projects/:id

POST    /projects

PATCH   /projects/:id

DELETE  /projects/:id
```

---

# Security Principles

The architecture enforces:

- Authentication
- Authorization
- Input Validation
- Error Handling
- Secure Environment Variables
- Secure Password Storage
- Request Logging

---

# Scalability

The project is designed so new features can be added with minimal changes to existing modules.

Every new feature should follow the same structure:

```
Model

↓

Validator

↓

Service

↓

Controller

↓

Route
```

---

# Future Improvements

The architecture can later be expanded to include:

- Repository Pattern
- Dependency Injection
- Redis Caching
- Background Jobs
- Message Queues
- Docker
- Microservices
- GraphQL
- WebSockets