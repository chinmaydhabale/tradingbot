FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY apps/server/package.json ./apps/server/
RUN npm install --workspace=apps/server
COPY tsconfig.json ./
COPY apps/server ./apps/server/
RUN npx prisma generate --schema=./apps/server/prisma/schema.prisma
RUN npm run build --workspace=apps/server

FROM node:20-alpine AS runner
WORKDIR /app
COPY package.json ./
COPY apps/server/package.json ./apps/server/
RUN npm install --omit=dev --workspace=apps/server
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/server/dist/main"]
