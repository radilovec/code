FROM node:22-alpine AS builder

WORKDIR /app

# Копируем корневой манифест монорепозитория
COPY package.json ./
COPY package-lock.json* ./

# Копируем исходники workspace-пакетов
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# Устанавливаем зависимости только для нужных workspace-пакетов
RUN npm install --workspace=shared --workspace=frontend

# Собираем shared, затем frontend
RUN npm run build --workspace=shared
RUN npm run build --workspace=frontend

# ---------------------------------------------------------------------------

FROM nginx:alpine AS runner

# SPA-конфигурация nginx
COPY --from=builder /app/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Angular build output: dist/frontend/browser (angular.json: outputPath="dist/frontend")
COPY --from=builder /app/frontend/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
