# =============================================================================
# Project Management API — production image
#
# Multi-stage: build tools and dev dependencies live only in the `deps` stage,
# so the shipped image contains production dependencies and nothing else.
#
# Build:  docker build -t project-management-api .
# Run:    docker run --env-file .env.production -p 5000:5000 \
#           -v pm-uploads:/app/src/uploads project-management-api
#
# See docs/DEPLOYMENT.md for the full procedure.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — dependencies
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# `bcrypt` is a native module. It usually installs from a prebuilt binary, but
# the toolchain is present so a source build still succeeds if no prebuild
# matches this platform. None of this ships to the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first: the dependency layer is then cached and only rebuilt
# when the manifests change, not on every source edit.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what the lockfile pins. Dev dependencies are
# omitted — the image does not run tests or lint.
RUN npm ci --omit=dev --ignore-scripts=false

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# `dumb-init` reaps zombies and forwards signals to Node. Node handles SIGTERM
# itself (see src/utils/gracefulShutdown.js), but as PID 1 it cannot reap
# orphaned child processes; this avoids that class of leak.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Run as the unprivileged `node` user that the base image already provides.
# Without this the process would run as root, so any remote-code-execution bug
# would start from full control of the container.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js app.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

# The API serves the OpenAPI document from docs/openapi.json, so this directory
# is part of the runtime, not just the repository.
COPY --chown=node:node docs ./docs

# Writable storage for user uploads. Declared as a volume so the data survives
# a container replacement — without it, every deploy silently discards every
# avatar and attachment.
RUN mkdir -p /app/src/uploads/avatars /app/src/uploads/attachments \
    && chown -R node:node /app/src/uploads

VOLUME ["/app/src/uploads"]

USER node

EXPOSE 5000

# Liveness only — it must not depend on the database. A probe that fails when
# the database blips would cause the orchestrator to restart healthy
# containers, which cannot fix a database problem. Use /api/v1/health/ready for
# load-balancer readiness.
#
# `fetch` is built into Node 22, so no curl/wget is needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
