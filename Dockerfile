# Node/Bun self-hosted image (preset node-server): SQLite + uploaded files live on the /app/.data volume.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS installer
RUN corepack enable
WORKDIR /app
# Manifests only, so dependency layers stay cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM installer AS builder
COPY . .
ENV NITRO_PRESET=node-server
RUN pnpm nuxt prepare && pnpm build

FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LIBSQL_URL=file:/app/.data/db/sqlite.db
# The server bundle is self-contained (Nitro traces its own node_modules).
COPY --from=builder --chown=node:node /app/.output ./.output
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=node:node scripts/admin.mjs ./scripts/admin.mjs
RUN mkdir -p /app/.data/db /app/.data/blob && chown -R node:node /app/.data
USER node
VOLUME ["/app/.data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
