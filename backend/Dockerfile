FROM node:22-alpine AS builder

WORKDIR /app

# Копируем корневой манифест монорепозитория
COPY package.json ./
COPY package-lock.json* ./

# Копируем исходники workspace-пакетов
COPY shared/ ./shared/
COPY backend/ ./backend/

# Устанавливаем зависимости только для нужных workspace-пакетов
RUN npm install --workspace=shared --workspace=backend

# Генерируем Prisma Client
RUN cd backend && npx prisma generate

# Собираем shared, затем backend
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

# ---------------------------------------------------------------------------

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Копируем корневой package.json (нужен npm для разрешения workspace-путей)
COPY package.json ./
COPY package-lock.json* ./

# Копируем package.json каждого workspace (нужны для npm workspaces resolve)
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/backend/package.json ./backend/package.json

# Копируем собранные артефакты
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist

# Устанавливаем только production-зависимости
RUN npm install --workspace=shared --workspace=backend --omit=dev

# Prisma schema + generate для runtime
COPY --from=builder /app/backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate

EXPOSE 3000

CMD ["node", "backend/dist/src/main.js"]
