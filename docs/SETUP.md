# Project Setup Guide

## Overview

This guide explains how to set up the Project Management API for local development.

Follow each step carefully to ensure the project runs correctly.

---

# Prerequisites

Before setting up the project, ensure the following software is installed on your computer.

## Required Software

- Node.js (Latest LTS Version)
- npm
- Git
- MongoDB Community Edition (or MongoDB Atlas)
- Visual Studio Code (Recommended)

---

# Verify Installation

Check each installation by running:

```bash
node -v
```

```bash
npm -v
```

```bash
git --version
```

---

# Clone the Repository

```bash
git clone https://github.com/<your-username>/project-management-api.git
```

Navigate into the project folder.

```bash
cd project-management-api
```

---

# Project Structure

```
project-management-api/

client/

server/

docs/

README.md
```

---

# Backend Setup

Navigate to the backend folder.

```bash
cd server
```

---

# Install Dependencies

```bash
npm install
```

---

# Environment Variables

Inside the **server** directory, create a file named:

```
.env
```

You can copy the example configuration:

```bash
cp .env.example .env
```

If your operating system does not support the command above, manually create the file.

---

# Configure Environment Variables

Update the values inside `.env`.

Example:

```env
PORT=5000

NODE_ENV=development

MONGODB_URI=

JWT_SECRET=

JWT_EXPIRES_IN=7d
```

---

# MongoDB Setup

## Option 1 — MongoDB Community Edition

Install MongoDB locally.

Start the MongoDB service.

Update the connection string.

Example:

```
mongodb://localhost:27017/project-management-api
```

---

## Option 2 — MongoDB Atlas

Create a MongoDB Atlas account.

Create a cluster.

Create a database user.

Whitelist your IP address.

Copy the connection string.

Paste it into:

```
MONGODB_URI=
```

---

# Run the Development Server

```bash
npm run dev
```

Expected output:

```
Server running on port 5000

MongoDB Connected
```

---

# Production Build

Future versions will include production deployment instructions.

---

# Available Scripts

Start development server:

```bash
npm run dev
```

Start production server:

```bash
npm start
```

Run tests:

```bash
npm test
```

Lint project:

```bash
npm run lint
```

Format project:

```bash
npm run format
```

---

# Folder Responsibilities

## client/

Frontend application (Future)

---

## server/

Backend source code.

---

## docs/

Project documentation.

---

# Troubleshooting

## Port Already In Use

Change the port inside:

```
.env
```

---

## MongoDB Connection Failed

Check:

- MongoDB service is running.
- Connection string is correct.
- Internet connection (Atlas).
- IP whitelist (Atlas).

---

## Missing Environment Variables

Ensure all required variables are present in:

```
.env
```

---

## Dependencies Not Installed

Run:

```bash
npm install
```

---

# Recommended VS Code Extensions

- ESLint
- Prettier
- MongoDB for VS Code
- DotENV
- Error Lens
- GitLens

---

# Recommended Terminal

- Windows Terminal
- PowerShell
- Git Bash

---

# Development Workflow

The recommended workflow for contributing to this project is:

1. Pull the latest changes.
2. Create a new branch.
3. Implement a single feature.
4. Test the feature.
5. Update documentation.
6. Commit changes.
7. Push the branch.
8. Create a pull request.

---

# Need Help?

If you encounter any issues while setting up the project:

1. Verify all prerequisites are installed.
2. Confirm your environment variables are correct.
3. Check that MongoDB is running.
4. Review the project documentation.