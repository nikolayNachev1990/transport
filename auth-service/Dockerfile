# auth-service's own build. Build context is the repo root (docker-compose.yaml
# sets context: . and dockerfile: ./auth-service/Dockerfile) — needed so
# COPY core/Events/langs below can reach those repo-root folders; that's a
# Docker build-context requirement, unrelated to where this file itself lives.
# Not shared with other services — each service's build differs (own deps,
# own native modules to compile, own steps), so each gets its own Dockerfile.

FROM node:22-bookworm-slim AS base
WORKDIR /usr/app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git bash curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY auth-service/package*.json ./
COPY core ./core
COPY Events ./Events
COPY langs ./langs

FROM base AS development
ENV NODE_ENV=development
RUN npm install -g nodemon
RUN npm install --install-links
COPY auth-service/. .
CMD ["npm", "run", "dev"]

FROM base AS production
# --include=dev overrides NODE_ENV=production for this install so
# typescript (a devDependency) is actually present for the tsc build
# below — without it, `npx tsc` silently resolves to an unrelated
# deprecated "tsc" package instead of the TypeScript compiler.
ENV NODE_ENV=production
RUN npm install --install-links --include=dev
COPY auth-service/. .
RUN rm -rf ./dist && NODE_OPTIONS='--max-old-space-size=8192' npx tsc
RUN npm prune --omit=dev
RUN mkdir -p tmp && chmod 777 tmp/
CMD ["npm", "run", "prod"]
