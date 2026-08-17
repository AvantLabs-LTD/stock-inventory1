FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS prisma-client
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npx prisma generate

FROM prisma-client AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM prisma-client AS migrator
COPY docker/migrate-and-bootstrap.sh /usr/local/bin/migrate-and-bootstrap
COPY scripts ./scripts
RUN chmod +x /usr/local/bin/migrate-and-bootstrap
ENTRYPOINT ["migrate-and-bootstrap"]

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY docker/app-entrypoint.sh /usr/local/bin/app-entrypoint
RUN chmod +x /usr/local/bin/app-entrypoint

USER nextjs
EXPOSE 3000
ENTRYPOINT ["app-entrypoint"]
CMD ["node", "server.js"]
