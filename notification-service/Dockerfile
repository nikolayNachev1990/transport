FROM node:lts-slim AS base


WORKDIR /usr/app
RUN apt update && apt install -y git bash curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm knex 


COPY package*.json ./

# --- 2. Development Stage: 
FROM base AS development
ENV NODE_ENV=development
RUN npm install -g nodemon
COPY . .
CMD ["npm", "run", "start-local"]

# --- 3. Production Stage
FROM base AS production
ENV NODE_ENV=production


WORKDIR /usr/app
COPY . .

RUN npm install && npm install --install-links
RUN rm -rf ./dist && NODE_OPTIONS='--max-old-space-size=8192' npx tsc
RUN mkdir -p tmp && chmod 777 tmp/

CMD ["npm", "run", "start-prod"]