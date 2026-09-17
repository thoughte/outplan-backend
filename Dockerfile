# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app

# generated/ is gitignored, so the Prisma client does not exist in the repo and
# MUST be generated here. A build that skips this fails at the first import, not
# at the first request, which is the better of the two.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Drop dev dependencies AFTER building - tsc and prisma are needed above and
# nowhere below.
# Prune dev dependencies AFTER building - tsc and the Prisma generator are
# needed above. prisma and ts-node survive this because migrate deploy runs in
# the runtime stage and needs both.
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl tzdata

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
# ts-node is needed to read prisma.config.ts, and prisma itself is a runtime
# dependency because migrate deploy runs at boot. Both were pruned before; the
# container came up, answered 503 forever, and said exactly why.
COPY --from=build /app/node_modules/ts-node ./node_modules/ts-node
COPY --from=build /app/node_modules/typescript ./node_modules/typescript

# Run as a non-root user. The image ships one; use it.
USER node

EXPOSE 4000

# Migrate, then serve - with a semicolon rather than &&, deliberately. A failed
# migration must NOT stop the process: /health reports the pending count and
# answers 503, which is visible from the platform's own panel. Exiting instead
# gives a crash loop whose reason is buried in a log nobody has opened.
CMD ["sh", "-c", "npx prisma migrate deploy; node ./dist/src/index.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-4000}/health || exit 1
