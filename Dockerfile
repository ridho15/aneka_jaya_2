FROM node:22-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/docs ./docs
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "run", "start"]
