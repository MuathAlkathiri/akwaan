FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/backend/package.json ./backend/package.json
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/frontend/package.json ./frontend/package.json
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .
RUN npm run build --workspace backend

FROM node:20-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
  && python3 -m pip install --no-cache-dir --break-system-packages --upgrade yt-dlp \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_PATH=/app/backend/node_modules:/app/node_modules
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=prod-deps --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist

RUN mkdir -p uploads .cache && chown -R node:node uploads .cache

USER node

EXPOSE 3000

CMD ["npm", "run", "start:prod", "--workspace", "backend"]
