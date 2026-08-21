# Contributing Guide

## Overview

Thank you for your interest in contributing to the Project Management API.

This document outlines the development workflow, coding standards, Git practices, and contribution guidelines used throughout the project.

Following these guidelines helps maintain a clean, consistent, and maintainable codebase.

---

# Development Philosophy

This project follows a quality-first approach.

Every feature should be:

- Planned before implementation.
- Developed in small, manageable steps.
- Properly documented.
- Tested before completion.
- Reviewed and refactored where necessary.

The goal is to build production-quality software while following professional software engineering practices.

---

# Before You Start

Before implementing a feature:

- Read the relevant documentation in the `docs` folder.
- Understand the business requirements.
- Review the project roadmap.
- Confirm the database design if the feature affects data.
- Ensure the API contract has been defined.

---

# Development Workflow

Every feature should follow this workflow:

1. Read the feature requirements.
2. Create or update the database model.
3. Create validation schemas.
4. Implement business logic.
5. Implement controllers.
6. Register API routes.
7. Apply authentication and authorization.
8. Test the feature.
9. Update documentation.
10. Refactor if necessary.

Do not skip any step.

---

# Git Workflow

## Branch Naming

Create a new branch for every feature.

Examples:

```
feature/authentication

feature/projects

feature/tasks

bugfix/login-error

refactor/task-service

docs/update-readme
```

---

## Commit Messages

Write clear and descriptive commit messages.

Examples:

```
feat: add user registration

feat: implement task creation

fix: resolve login validation bug

refactor: simplify authentication middleware

docs: update API documentation

test: add authentication integration tests
```

Follow the Conventional Commits format where possible.

---

# Coding Standards

## General Principles

- Write readable code.
- Prefer clarity over cleverness.
- Avoid code duplication.
- Keep functions small and focused.
- Use meaningful names.
- Follow the Single Responsibility Principle.
- Keep files organized.

---

## Naming Conventions

### Variables

Use camelCase.

Examples:

```javascript
projectOwner;
taskPriority;
assignedUser;
```

---

### Constants

Use UPPER_SNAKE_CASE.

Examples:

```javascript
JWT_SECRET;
MAX_FILE_SIZE;
DEFAULT_PAGE_SIZE;
```

---

### Models

Use PascalCase.

Examples:

```
User
Project
Task
```

---

### File Names

Use camelCase.

Examples:

```
userController.js
projectService.js
taskValidator.js
```

---

# Folder Structure

Every new feature should follow the established project structure.

Example:

```
controllers/
services/
models/
routes/
validators/
middlewares/
```

Avoid creating unnecessary folders or changing the existing architecture without discussion.

---

# Validation

Every request entering the application must be validated.

Use Zod for request validation.

Validation should occur before business logic is executed.

---

# Error Handling

- Use custom error classes where appropriate.
- Return consistent error responses.
- Never expose internal implementation details.
- Log unexpected errors.

---

# Security

Every new feature must follow the project's security guidelines.

Examples include:

- Validate user input.
- Protect sensitive routes.
- Verify permissions.
- Hash passwords.
- Never expose secrets.
- Use environment variables for configuration.

Refer to `SECURITY.md` for detailed requirements.

---

# Testing

Every completed feature should be tested before it is merged.

Testing should verify:

- Successful requests.
- Validation failures.
- Authorization rules.
- Error handling.
- Edge cases.

---

# Documentation

Whenever a feature changes:

- Update the API documentation if endpoints change.
- Update the database documentation if the schema changes.
- Update the feature list if functionality changes.
- Update the changelog.

Documentation is considered part of the feature.

---

# Pull Requests

Before creating a pull request, ensure:

- The feature is complete.
- Code has been tested.
- Documentation has been updated.
- No unnecessary files are included.
- The branch is up to date.

---

# Code Review Checklist

Before marking a feature as complete, verify:

- Code follows project standards.
- Validation is implemented.
- Errors are handled correctly.
- Authentication is applied where required.
- Authorization is enforced.
- No sensitive information is exposed.
- Documentation is updated.
- Tests pass successfully.

---

# Reporting Issues

When reporting a bug, include:

- Description of the issue.
- Steps to reproduce.
- Expected behavior.
- Actual behavior.
- Screenshots or logs (if applicable).
- Environment information.

---

# Feature Requests

When suggesting a new feature, provide:

- Feature description.
- Problem being solved.
- Proposed solution.
- Potential impact on the project.

---

# Communication

Keep discussions respectful, constructive, and focused on improving the project.

Feedback should be specific and actionable.

---

# Thank You

Thank you for contributing to the Project Management API.

Every contribution, whether it's code, documentation, testing, or feedback, helps improve the project and makes it a better learning resource.
