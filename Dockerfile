FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /app

RUN npm install --global npm@11.6.2

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
COPY server/ ./server/
COPY package.json ./

USER node

EXPOSE 3000

CMD ["node", "server/index.js"]
