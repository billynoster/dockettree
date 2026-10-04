# Docket Tree — production image for Cloud Run (Node 22 + native better-sqlite3)
FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

# ca-certificates: Firebase ID-token verify fetches Google JWKS over HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --create-home appuser

WORKDIR /app

# DOCKSY_DATA_DIR is only used when Cloud SQL / GCS env is unset (ephemeral demo).
# Production should set CLOUD_SQL_CONNECTION_NAME + GCS_BUCKET instead — never SQLite on GCS FUSE.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DOCKSY_DATA_DIR=/tmp/docksy-data

RUN mkdir -p /tmp/docksy-data \
  && chown -R appuser:appuser /tmp/docksy-data

COPY --from=build --chown=appuser:appuser /app/package.json /app/package-lock.json ./
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --from=build --chown=appuser:appuser /app/server ./server
COPY --from=build --chown=appuser:appuser /app/src ./src
COPY --from=build --chown=appuser:appuser /app/tsconfig.json ./
COPY --from=build --chown=appuser:appuser /app/tsconfig.app.json ./
COPY --from=build --chown=appuser:appuser /app/tsconfig.node.json ./
COPY --from=build --chown=appuser:appuser /app/tsconfig.server.json ./

USER appuser

# Cloud Run sets PORT (commonly 8080); HOST defaults to 0.0.0.0 above.
EXPOSE 8080

CMD ["npm", "start"]
