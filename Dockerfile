FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate
ENV VITE_API_URL=/api
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
RUN mkdir -p server/uploads/verifications && chown -R node:node server/uploads
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
