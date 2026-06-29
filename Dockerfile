FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/docs ./docs
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "run", "start"]
