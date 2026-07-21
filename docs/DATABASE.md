# Database Design

## Overview

The Project Management API uses MongoDB as its primary database, with Mongoose serving as the Object Data Modeling (ODM) library.

The database is designed to support collaboration between users, teams, and workspaces while maintaining scalability, consistency, and flexibility.

MongoDB's document-based model allows us to represent real-world entities naturally while using document references where relationships are required.

---

# Database Technology

Database: MongoDB

ODM: Mongoose

Database Type: NoSQL (Document Database)

---

# Design Principles

The database is designed using the following principles:

- Keep documents focused on a single responsibility.
- Reference large or frequently changing data.
- Embed only small and tightly coupled data.
- Avoid unnecessary data duplication.
- Index frequently queried fields.
- Maintain consistency through application logic.
- Design for scalability and maintainability.

---

# Collections

The application contains the following collections:

- Users
- Workspaces
- WorkspaceMembers
- Projects
- Tasks
- Comments
- Labels
- Notifications
- ActivityLogs
- FileAttachments

---

# Collection Overview

## Users

Stores account information for every registered user.

### Fields

- name
- email
- password
- avatar
- role
- isVerified
- createdAt
- updatedAt

### Relationships

- One user can own many workspaces.
- One user can belong to many workspaces.
- One user can create many projects.
- One user can create many tasks.
- One user can receive many notifications.

---

## Workspaces

A workspace represents an organization or team.

### Fields

- name
- description
- owner
- membersCount
- archived
- createdAt
- updatedAt

### Relationships

- One workspace has many members.
- One workspace contains many projects.

---

## WorkspaceMembers

Stores membership information.

### Fields

- workspace
- user
- role
- joinedAt

### Relationships

- Links users and workspaces.

---

## Projects

Projects belong to workspaces.

### Fields

- workspace
- title
- description
- status
- deadline
- owner
- archived
- createdAt
- updatedAt

### Relationships

- One project belongs to one workspace.
- One project has many tasks.
- One project has many members.

---

## Tasks

Represents work items.

### Fields

- project
- title
- description
- status
- priority
- assignedTo
- createdBy
- dueDate
- startDate
- estimatedHours
- archived
- createdAt
- updatedAt

### Relationships

- One task belongs to one project.
- One task has many comments.
- One task has many labels.
- One task may have many attachments.

---

## Comments

Stores task discussions.

### Fields

- task
- user
- message
- edited
- createdAt
- updatedAt

### Relationships

- Belongs to one task.
- Belongs to one user.

---

## Labels

Used to categorize tasks.

### Fields

- workspace
- name
- color
- createdAt
- updatedAt

### Relationships

- One label can belong to many tasks.

---

## Notifications

Stores user notifications.

### Fields

- user
- title
- message
- type
- isRead
- createdAt

---

## ActivityLogs

Stores important user actions.

### Fields

- user
- action
- resource
- resourceId
- metadata
- createdAt

Examples:

- Project Created
- Task Updated
- Member Invited

---

## FileAttachments

Stores uploaded file metadata.

### Fields

- task
- fileName
- originalName
- mimeType
- size
- uploadedBy
- createdAt

---

# Relationships

User

↓

Workspace

↓

Project

↓

Task

↓

Comment

---

Workspace

↓

Labels

↓

Tasks

---

User

↓

Notifications

---

User

↓

Activity Logs

---

# Referencing Strategy

The application uses document references for relationships.

Examples:

Task → Project

Project → Workspace

Task → Assigned User

Comment → User

Notification → User

---

# Embedded Documents

Only small objects should be embedded.

Examples:

- Task checklist items (future)
- User preferences (optional)

Large datasets should always be referenced.

---

# Indexing Strategy

Indexes improve query performance.

## User

- email (unique)

---

## Workspace

- owner

---

## Project

- workspace
- status

---

## Task

- project
- assignedTo
- dueDate
- priority
- status

---

## Notification

- user
- isRead

---

## Activity Log

- user
- createdAt

---

# Soft Deletes

Resources should not always be permanently deleted.

Instead, use:

- archived
- archivedAt

This allows recovery when needed.

---

# Data Validation

Validation is handled in two layers:

## Mongoose

- Required fields
- Data types
- Default values

## Zod

- Request validation
- Business rules
- API input validation

---

# Future Improvements

Potential database enhancements include:

- MongoDB Transactions
- Full-Text Search
- Compound Indexes
- Geospatial Queries (if required)
- Redis Caching
- Audit History Collections
- Database Sharding

---

# Naming Conventions

Collections

Plural

Examples:

- users
- projects
- tasks

Models

Singular

Examples:

- User
- Project
- Task

Fields

Use camelCase.

Examples:

- assignedTo
- createdBy
- dueDate
- estimatedHours

---

# Summary

The database is designed to be:

- Scalable
- Maintainable
- Modular
- Secure
- Easy to extend

Every collection has a single responsibility, relationships are modeled using references where appropriate, and indexing is planned to support efficient querying as the application grows.