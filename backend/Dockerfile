FROM node:26-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:26-alpine

ENV NODE_ENV=production
WORKDIR /app

# Reproducible install from the lockfile, prod deps only — no devDependencies
# (ts-node-dev, jest, eslint, etc.) shipped into the runtime image.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

# node:26-alpine ships a non-root `node` user (uid 1000) — no reason for
# this process to run as root.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/healthz',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
