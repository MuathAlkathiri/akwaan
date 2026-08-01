FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY Lammah-game-backend/package.json ./Lammah-game-backend/package.json
COPY Lammah-game-frontend/package.json ./Lammah-game-frontend/package.json
RUN npm ci

FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/Lammah-game-backend/package.json ./Lammah-game-backend/package.json
COPY --from=deps /app/Lammah-game-backend/node_modules ./Lammah-game-backend/node_modules
COPY --from=deps /app/Lammah-game-frontend/package.json ./Lammah-game-frontend/package.json
COPY --from=deps /app/Lammah-game-frontend/node_modules ./Lammah-game-frontend/node_modules

ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN npm run build --workspace Lammah-game-frontend

FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY Lammah-game-backend/package.json ./Lammah-game-backend/package.json
COPY Lammah-game-frontend/package.json ./Lammah-game-frontend/package.json
RUN npm ci --omit=dev
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=prod-deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/Lammah-game-frontend/package.json ./Lammah-game-frontend/package.json
COPY --from=prod-deps --chown=node:node /app/Lammah-game-frontend/node_modules ./Lammah-game-frontend/node_modules
COPY --from=build --chown=node:node /app/Lammah-game-frontend/.next ./Lammah-game-frontend/.next
COPY --from=build --chown=node:node /app/Lammah-game-frontend/public ./Lammah-game-frontend/public
COPY --from=build --chown=node:node /app/Lammah-game-frontend/next.config.js ./Lammah-game-frontend/next.config.js

USER node

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace", "Lammah-game-frontend"]
