# Interactive Video Scenario Editor

Веб-приложение для создания и воспроизведения интерактивных видео-сценариев с ветвящимся нарративом.

## Стек

- **Frontend:** Angular 21, Angular Material, Monaco Editor, Foblex Flow + dagre
- **Backend:** NestJS, Prisma ORM, PostgreSQL 17, JWT
- **Shared:** DSL-парсер, AST-интерпретатор (используется и на клиенте, и на сервере)
- **Инфраструктура:** Docker Compose

## Требования

- Docker Desktop (с Docker Compose v2)
- Node.js >= 22 и npm >= 10 (для локальной разработки)

## Быстрый старт

```bash
# 1. Перейти в папку проекта
cd code

# 2. Поднять все сервисы
docker compose up --build -d
```

После запуска:

| Сервис   | URL                       | Описание              |
|----------|---------------------------|-----------------------|
| Frontend | http://localhost:4200     | Angular SPA (nginx)   |
| Backend  | http://localhost:3000/api | REST API (NestJS)     |
| Postgres | localhost:5433            | БД (порт 5433 наружу) |

## Миграция и seed

После первого запуска БД пустая. Нужно применить миграцию и заполнить тестовыми данными.

### 1. Применить миграцию

```bash
DATABASE_URL="postgresql://ivs_user:ivs_password@localhost:5433/ivs_db" \
  npx prisma migrate deploy --schema=backend/prisma/schema.prisma
```

### 2. Запустить seed

```bash
DATABASE_URL="postgresql://ivs_user:ivs_password@localhost:5433/ivs_db" \
  npx tsx backend/prisma/seed.ts
```

Seed создает:

- **Тестового пользователя:** `demo@example.com` / `demo1234`
- **Демо-проект** "Карьерный выбор" -- интерактивный сценарий на 15 сцен с 4 концовками
- **Опубликованный снапшот** (v1) этого проекта

Seed идемпотентен -- при повторном запуске не дублирует данные.

### 3. Проверить что seed отработал

1. Открыть http://localhost:4200 -- должна загрузиться страница приложения
2. Открыть http://localhost:3000/api/health -- должен вернуть `{"status":"ok"}`
3. Войти в приложение с учетными данными `demo@example.com` / `demo1234`
4. В списке проектов должен появиться проект "Карьерный выбор"

## Локальная разработка (без Docker)

```bash
# Установить зависимости
npm install

# Собрать shared (нужен и для backend, и для frontend)
npm run build:shared

# Сгенерировать Prisma Client
npx prisma generate --schema=backend/prisma/schema.prisma

# Запустить backend (нужна запущенная PostgreSQL)
cd backend && npm run start:dev

# Запустить frontend (в отдельном терминале)
cd frontend && npx ng serve
```

## Переменные окружения

Смотри `.env.example`. Ключевые:

| Переменная         | По умолчанию (Docker)                   | Описание                    |
|--------------------|-----------------------------------------|-----------------------------|
| DATABASE_URL       | postgresql://ivs_user:ivs_password@...  | Строка подключения к Postgres|
| JWT_ACCESS_SECRET  | dev-jwt-secret-change-in-production     | Секрет для access-токенов    |
| JWT_REFRESH_SECRET | dev-refresh-secret-change-in-production | Секрет для refresh-токенов   |

## Структура проекта

```
code/
  frontend/          # Angular 21 SPA
  backend/           # NestJS REST API
  shared/            # DSL-парсер, AST-интерпретатор, типы
  docker-compose.yml
```
