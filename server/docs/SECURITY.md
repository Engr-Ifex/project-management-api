# Security Guidelines

## Overview

Security is a fundamental aspect of the Project Management API.

This document outlines the security practices, standards, and policies that must be followed throughout the development of the application.

Every new feature added to the project must comply with these security guidelines.

---

# Security Principles

The application follows these core security principles:

- Authenticate every protected request.
- Authorize every sensitive action.
- Never trust user input.
- Validate all incoming data.
- Hash passwords before storing them.
- Keep sensitive information out of source code.
- Follow the principle of least privilege.
- Return safe and consistent error messages.
- Protect against common web vulnerabilities.
- Log security-related events.

---

# Authentication

The API uses JSON Web Tokens (JWT) for authentication.

## Authentication Flow

1. User registers an account.
2. Password is hashed before storage.
3. User logs in with valid credentials.
4. Server generates an access token and returns it in an **httpOnly cookie** —
   it is never placed in the response body, so no script can read it.
5. The browser sends the cookie automatically on subsequent requests.
6. Protected routes verify the token before processing requests.

There is no refresh token. When the access token expires the user logs in
again, and logging out clears the cookie — the token itself stays valid until
it expires.

---

# Authorization

Authentication identifies the user.

Authorization determines what the user is allowed to do.

Role-Based Access Control (RBAC) is used throughout the application.

Roles include:

- Owner
- Admin
- Member

Every protected resource must verify that the authenticated user has permission to perform the requested action.

---

# Password Security

Passwords must never be stored in plain text.

Passwords are hashed using bcrypt before being saved.

The only password rule enforced is a **minimum length of 8 characters**,
checked by the Zod validator on registration and on password change and again
by the model's `minlength`. There is deliberately no composition rule — no
required uppercase letter, digit or symbol.

The strength of a password here rests on bcrypt's cost factor
(`BCRYPT_SALT_ROUNDS`, validated to 10–15 at boot) and on rate limiting the
login endpoint, not on character-class requirements. A composition rule would
reject passphrases that are stronger than `Passw0rd!` while adding nothing
against an offline attack on the hash.

Passwords are never returned in API responses.

---

# JWT Security

JWTs are signed using a secure secret stored in environment variables.

Tokens must:

- Have an expiration time.
- Be verified on every protected request.
- Never contain sensitive information.

JWT secrets must never be committed to version control.

---

# Environment Variables

Sensitive configuration values must be stored in environment variables.

Examples include:

- JWT secrets
- Database connection strings
- API keys
- Third-party service credentials

Environment files must never be pushed to Git repositories.

Use `.env.example` to document required variables.

---

# Input Validation

Every incoming request must be validated.

Validation includes:

- Required fields
- Data types
- String lengths
- Email format
- Password rules
- MongoDB ObjectId validation

Validation is handled using Zod.

---

# Error Handling

The application should return consistent and safe error responses.

Error responses must never expose:

- Stack traces
- Database queries
- Environment variables
- Internal application structure

Unexpected errors should be logged internally while returning a generic error message to the client.

---

# HTTP Security

The API uses Helmet to apply secure HTTP headers.

Security headers help protect against common browser-based attacks.

Examples include protection against:

- Clickjacking
- MIME type sniffing
- Cross-site scripting (XSS)

---

# CORS

Cross-Origin Resource Sharing (CORS) is configured to allow requests only from trusted origins.

Allowed origins should be managed through environment variables.

Credentials should only be enabled when required.

---

# Rate Limiting

Rate limiting protects the API from abuse and brute-force attacks.

Authentication routes should have stricter limits than general API endpoints.

Examples:

- Login attempts
- Registration requests
- Password reset requests

---

# Cookies

When cookies are used, they should be configured with appropriate security settings.

Recommended options:

- HttpOnly
- Secure (production)
- SameSite

Sensitive information must never be stored directly in cookies.

---

# File Upload Security

Uploaded files must be validated before storage.

Validation includes:

- File type
- File size
- Allowed extensions

Executable files must not be accepted.

Uploaded files should use generated filenames instead of user-provided names.

---

# Database Security

Database access should follow the principle of least privilege.

Only required database permissions should be granted.

Sensitive data should never be logged.

Queries should always use Mongoose methods to reduce the risk of injection attacks.

---

# Security Headers

The application applies security headers using Helmet.

Headers include protections for:

- Content Security Policy (future enhancement)
- X-Frame-Options
- X-Content-Type-Options
- Referrer Policy

---

# Logging

Security-related events should be logged.

Examples include:

- Login attempts
- Failed authentication
- Permission denials
- Password changes
- Account deletion

Sensitive information such as passwords and tokens must never appear in logs.

---

# Common Threats

The application is designed to reduce the risk of:

- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Brute Force Attacks
- SQL Injection
- NoSQL Injection
- Credential Theft
- Broken Authentication
- Sensitive Data Exposure

---

# Secure Development Checklist

Before completing any feature, verify the following:

- Input validation implemented
- Authentication applied where required
- Authorization verified
- Errors handled safely
- Sensitive data excluded from responses
- Environment variables used correctly
- Logging implemented
- Tests completed

---

# Future Security Improvements

Potential enhancements include:

- Refresh Token Rotation
- Multi-Factor Authentication (MFA)
- Email Verification
- Password Reset Flow
- OAuth Authentication
- Session Management
- Audit Logging
- API Key Authentication
- Secret Management Services
- Intrusion Detection
