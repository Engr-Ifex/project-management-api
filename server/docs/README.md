# Project Management API

A RESTful Project Management API built with Node.js, Express, and MongoDB, designed to practice professional backend development concepts including authentication, authorization, project and task management, validation, security, and scalable API architecture.

---

## 📖 Table of Contents

- About the Project
- Objectives
- Features
- Tech Stack
- Project Structure
- Documentation
- Getting Started
- Environment Variables
- API Overview
- Project Roadmap
- Development Status
- Future Improvements
- Contributing
- License

---

# About the Project

Project Management API is a backend application that provides a robust system for managing projects, tasks, workspaces, teams, and user collaboration.

The primary goal of this project is to simulate the development of a production-ready Software-as-a-Service (SaaS) backend while following professional software engineering practices.

This project serves as a backend learning project, focusing on clean architecture, scalable code organization, secure authentication, proper validation, RESTful API design, and maintainable business logic.

---

# Objectives

The objectives of this project are to:

- Practice professional backend development using Express.js.
- Build a scalable REST API.
- Learn proper project architecture.
- Master MongoDB and Mongoose.
- Implement secure authentication and authorization.
- Apply validation and error handling best practices.
- Implement role-based access control (RBAC).
- Design maintainable backend systems.
- Document software professionally.
- Prepare for larger production projects.

---

# Features

## Authentication

- User Registration
- User Login
- User Logout
- JWT Authentication
- Password Hashing
- Protected Routes

---

## User Management

- User Profile
- Update Profile
- Change Password
- Avatar Support

---

## Workspace Management

- Create Workspace
- Update Workspace
- Delete Workspace
- Invite Members

---

## Team Management

- Member Roles
- Permissions
- Invitations

---

## Project Management

- Create Projects
- Update Projects
- Archive Projects
- Restore Projects

---

## Task Management

- Create Tasks
- Update Tasks
- Assign Tasks
- Due Dates
- Priorities
- Status
- Labels
- Subtasks

---

## Comments

- Task Comments
- Edit Comments
- Delete Comments

---

## Notifications

- User Notifications
- Read/Unread Status

---

## Dashboard

- Project Statistics
- Task Statistics
- Recent Activities

---

## Search

- Search Projects
- Search Tasks
- Search Members

---

## Security

- JWT Authentication
- Password Hashing
- Input Validation
- Helmet
- CORS
- Rate Limiting

---

# Tech Stack

## Backend

- Node.js
- Express.js
- MongoDB
- Mongoose

## Security

- JWT
- bcrypt
- Helmet
- CORS

## Validation

- Zod

## Utilities

- dotenv
- Morgan
- Cookie Parser
- Multer

---

# Project Structure

```text
project-management-api/

client/
server/            the API — everything below lives here
  src/             application code
  tests/           the automated suite
  scripts/         route inventory, OpenAPI generation, preflight
  docs/            this directory
  Dockerfile       production image
  docker-compose.yml

README.md
```

The repository root holds `README.md` and `client/`; there is no `LICENSE` file
and no root-level `docs/` — the API's documentation is `server/docs/`.

A more detailed architecture can be found in:

> server/docs/ARCHITECTURE.md

---

# Documentation

Project documentation is located inside the **docs** directory.

- DEPLOYMENT.md — production deployment, health checks, and the operational limitations
- API.md — every endpoint, role, permission and status code
- openapi.json — the machine-readable OpenAPI 3.1 contract
- ARCHITECTURE.md
- DATABASE.md
- SECURITY.md
- ENVIRONMENT.md
- FEATURES.md
- ROADMAP.md
- VISION.md
- SETUP.md
- CHANGELOG.md
- CONTRIBUTING.md

The first three are current. The rest predate the implementation and have not
been brought up to date — treat `API.md`, `DEPLOYMENT.md`, `.env.example` and
the code as authoritative.

---

# Getting Started

### Clone the repository

```bash
git clone <repository-url>
```

### Install dependencies

```bash
cd server
npm install
```

### Configure environment variables

Create a `.env` file inside the server directory.

Example:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
CORS_ORIGINS=
```

The full list, with defaults and notes, is in `.env.example`. The names above
must match exactly — `JWT_SECRET` is not read by anything, and a misnamed
variable fails at boot rather than being silently ignored.

### Run the development server

```bash
npm run dev
```

---

# Environment Variables

The required environment variables are documented in:

```
docs/ENVIRONMENT.md
```

---

# API Overview

The API follows RESTful principles. All routes are versioned under `/api/v1`:

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login

POST   /api/v1/workspaces
GET    /api/v1/workspaces

POST   /api/v1/workspaces/:workspaceId/projects
GET    /api/v1/workspaces/:workspaceId/projects

GET    /api/v1/workspaces/:workspaceId/projects/:projectId/tasks
POST   /api/v1/workspaces/:workspaceId/projects/:projectId/tasks
```

Projects and tasks are always nested under a workspace, so there is no
top-level `/projects` or `/tasks` collection.

Complete documentation can be found in:

```
docs/API.md          full guide: auth, roles, permissions, every endpoint
docs/openapi.json    machine-readable OpenAPI 3.1 contract
```

`docs/openapi.json` is generated from the implementation and checked against the
route table with `npm run docs:verify`, so it cannot drift from the code.

---

# Project Roadmap

The project is developed in structured phases.

Examples include:

- Planning
- Backend Setup
- Authentication
- Users
- Workspaces
- Teams
- Projects
- Tasks
- Notifications
- Dashboard
- Deployment

The complete roadmap is available in:

```
docs/ROADMAP.md
```

---

# Development Status

**Current Phase**

Backend feature-complete and prepared for deployment: authentication,
workspaces, projects, tasks, comments, labels, attachments, notifications,
dashboards, the activity trail, generated API documentation, an automated test
suite, and container/deployment configuration.

**Not yet launched.** No deployment has been performed, so the API has not
served real traffic.

This section is a summary, not the source of truth. `docs/ROADMAP.md` holds the
phase plan, and the repository history records what each phase changed.

---

# Future Improvements

Not implemented:

- Real-time notifications (WebSockets)
- Email delivery for invitations and notifications
- Object storage for uploads, to allow more than one API host
- A shared rate-limit store, for the same reason
- A frontend and a mobile client
- CI/CD pipeline

Delivered since this list was first written, and no longer future work:
file storage, the activity timeline, Docker support, and URL-versioned
endpoints (`/api/v1`).

---

# Contributing

This project is primarily a personal learning project.

Suggestions and improvements are always welcome.

Contribution guidelines are available in:

```
docs/CONTRIBUTING.md
```

---

# License

This project is licensed under the MIT License.
