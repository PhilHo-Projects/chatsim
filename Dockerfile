FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm test
RUN npm run build:chatsim

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV CHATSIM_BASE_PATH=/chatsim
ENV CHATSIM_STORE_FILE=/app/data/story-store.local.json

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/data/storyDatabase.json ./src/data/storyDatabase.json
COPY --from=build /app/tsconfig*.json ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "run", "start:api"]
