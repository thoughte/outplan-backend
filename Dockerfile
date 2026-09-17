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
# needed above and nowhere below.
#
# Only prisma survives this, because it is a runtime dependency: migrate deploy
# runs at boot. Nothing else may be copied out of node_modules after this line -
# an earlier version tried to copy ts-node and typescript from here, they had
# already been pruned, the COPY failed, and the container was replaced by
# nothing.
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
COPY --from=build /app/prisma.config.mjs ./prisma.config.mjs

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
