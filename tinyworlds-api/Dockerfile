# syntax=docker/dockerfile:1
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
# postinstall runs `prisma generate`, which needs the schema and its config
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.ts ./
# migrations for `prisma migrate deploy`, and the seed (`npm run seed`)
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{health}'})}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# single replica: the migrations run before the server starts
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
