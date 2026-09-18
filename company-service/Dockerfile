# company-service's own build. Build context is the repo root
# (docker-compose.yaml sets context: . and dockerfile: ./company-service/Dockerfile)
# — needed so COPY core/Events/langs below can reach those repo-root
# folders. Not shared with other services — each service's build differs
# (own deps, own steps), so each gets its own Dockerfile.

FROM node:22-bookworm-slim AS base
WORKDIR /usr/app
# curl: docker-compose's healthcheck for this service runs `curl` inside
# the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY company-service/package*.json ./
COPY core ./core
COPY Events ./Events
COPY langs ./langs

FROM base AS development
ENV NODE_ENV=development
RUN npm install -g nodemon
RUN npm install --install-links
COPY company-service/. .
CMD ["npm", "run", "dev"]

FROM base AS production
# --include=dev overrides NODE_ENV=production for this install so
# typescript (a devDependency) is actually present for the tsc build
# below — same reasoning as auth-service/Dockerfile.
ENV NODE_ENV=production
RUN npm install --install-links --include=dev
COPY company-service/. .
RUN rm -rf ./dist && NODE_OPTIONS='--max-old-space-size=8192' npx tsc
RUN npm prune --omit=dev
CMD ["npm", "run", "prod"]
