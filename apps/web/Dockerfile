FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install --workspace=apps/web
COPY tsconfig.json ./
COPY apps/web ./apps/web/
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS runner
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install --omit=dev --workspace=apps/web
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start", "--workspace=apps/web"]
