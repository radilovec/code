/**
 * Seed-скрипт для backend.
 *
 * Запускается через: npm run seed (из директории backend)
 * Или: npx tsx prisma/seed.ts
 *
 * Идемпотентен — при повторном запуске не падает и не дублирует данные.
 *
 * Что создаёт:
 * 1. Тестового пользователя demo@example.com / demo1234
 * 2. Демо-проект «Карьерный выбор» с DSL ~14 сцен в духе Bandersnatch
 * 3. PublishedSnapshot этого проекта (пропускает DSL через shared-пайплайн)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

// Импорт из @interactive-video/shared (CommonJS-совместимый dist)
import {
  tokenize,
  parse,
  buildScenario,
  buildSnapshot,
} from '@interactive-video/shared';

// ─────────────────────────────────────────────
// DSL ДЕМО-СЦЕНАРИЯ
// ─────────────────────────────────────────────
//
// Тема: карьерный путь разработчика (мини-Bandersnatch).
// Переменные: determination (number), chosen_path (string).
// Персонаж: mentor.
// 14 сцен, 3 концовки (success_end, fail_end, stable_end, design_end).
//
// Синтаксис строго по грамматике парсера из shared:
//   set id = expr
//   goto id
//   choice "label" -> id
//   choice "label" -> id when expr
//   if expr { } else { }
//   video "url" from N to N
//   text "..."
//   character id { description "..." }

const DEMO_DSL = `
// Демо-сценарий: Карьерный выбор разработчика
// Переменные состояния
set determination = 0
set chosen_path = ""

character mentor {
  description "Опытный технический директор, который видит потенциал в каждом"
}

scene start {
  video "https://example.com/video/start.mp4" from 0 to 30
  text "Понедельник. 8:45. Будильник разрывается. У вас важный день — первый день в новой компании. Вставать или ещё немного полежать?"

  choice "Встать и подготовиться" -> morning
  choice "Поспать ещё 20 минут" -> lazy_morning
}

scene morning {
  video "https://example.com/video/morning.mp4" from 30 to 65
  text "Вы приходите в офис вовремя. В холле вас встречает ментор — Александр, технический директор. Он предлагает вам выбрать направление развития."

  choice "Изучать программирование" -> learn_code
  choice "Идти в продуктовый дизайн" -> learn_design
}

scene lazy_morning {
  video "https://example.com/video/lazy.mp4" from 65 to 90
  text "Вы проспали и опаздываете на 30 минут. Ментор замечает это. Первое впечатление подпорчено."

  set determination = -1
  goto office
}

scene learn_code {
  video "https://example.com/video/code.mp4" from 90 to 140
  text "Вы погружаетесь в JavaScript и алгоритмы. Первые недели тяжёлые, но вы чувствуете прогресс."

  set determination = 1
  set chosen_path = "developer"

  choice "Взяться за сложную архитектурную задачу" -> challenge when determination >= 1
  choice "Сделать по-быстрому, лишь бы работало" -> shortcut
}

scene learn_design {
  video "https://example.com/video/design.mp4" from 140 to 185
  text "Вы открываете Figma и начинаете изучать основы UX. Работа с пользователями и прототипами захватывает вас."

  set chosen_path = "designer"
  goto design_career
}

scene challenge {
  video "https://example.com/video/challenge.mp4" from 185 to 240
  text "Задача оказывается непростой — нужно переписать модуль авторизации с учётом масштабирования. Три ночи отладки. Но вы справляетесь."

  set determination = 3
  goto senior_dev
}

scene shortcut {
  video "https://example.com/video/shortcut.mp4" from 240 to 275
  text "Решение работает, но код хрупкий. Техдолг накапливается. Коллеги замечают качество работы."

  set determination = 0
  goto office
}

scene office {
  video "https://example.com/video/office.mp4" from 275 to 320
  text "Проходит полгода. Рутина. Вы сидите на одном месте. Ментор предлагает два варианта: остаться в стабильной компании или рискнуть и уйти в стартап."

  choice "Остаться — стабильность важнее" -> stable_end
  choice "Уйти в стартап" -> startup
}

scene startup {
  video "https://example.com/video/startup.mp4" from 320 to 370
  text "Вы подаёте заявление об уходе. Стартап — это три человека в коворкинге, амбиции и отсутствие бюджета. Получится?"

  if determination >= 3 {
    goto success_end
  } else {
    goto fail_end
  }
}

scene design_career {
  video "https://example.com/video/design_career.mp4" from 370 to 415
  text "Вы растёте как дизайнер. Ваши прототипы высоко оценивают пользователи. Через год вас повышают до lead designer."

  goto design_end
}

scene senior_dev {
  video "https://example.com/video/senior.mp4" from 415 to 455
  text "Вы стали старшим разработчиком быстрее, чем кто-либо в истории компании. Ментор гордится вами."

  goto success_end
}

scene success_end {
  video "https://example.com/video/success.mp4" from 455 to 500
  text "Стартап выстреливает. Ваш продукт набирает первых тысячу пользователей за неделю. Вы — один из основателей. Это только начало."
}

scene fail_end {
  video "https://example.com/video/fail.mp4" from 500 to 540
  text "Стартап закрывается через восемь месяцев. Денег нет, команда расходится. Но вы получили бесценный опыт и понимаете, что сделать иначе в следующий раз."
}

scene stable_end {
  video "https://example.com/video/stable.mp4" from 540 to 575
  text "Годы идут. Стабильная зарплата, понятные задачи. Иногда вы думаете о том, что могло бы быть. Но у вас есть время на семью и хобби — и это тоже ценно."
}

scene design_end {
  video "https://example.com/video/design_end.mp4" from 575 to 610
  text "Вы создаёте интерфейсы, которыми пользуются миллионы людей. Каждый день — это поиск баланса между красотой и пользой. Вы нашли своё призвание."
}
`;

// ─────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Запуск seed-скрипта...');

  // ── 1. Тестовый пользователь ──────────────────
  const passwordHash = await bcrypt.hash('demo1234', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash,
      name: 'Demo User',
    },
  });

  console.log(`Пользователь: ${user.email} (id=${user.id})`);

  // ── 2. Демо-проект — удаляем старый и создаём заново ──
  // deleteMany + create вместо upsert, чтобы сбросить все связанные записи
  // (PublishedSnapshot, Layout) и начать с чистого листа.
  await prisma.project.deleteMany({
    where: {
      ownerId: user.id,
      name: 'Карьерный выбор',
    },
  });

  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: 'Карьерный выбор',
      description: 'Демо-сценарий интерактивного видео в духе Bandersnatch. Разветвлённый нарратив о карьерном пути разработчика с тремя концовками.',
      dslText: DEMO_DSL,
    },
  });

  console.log(`Проект: "${project.name}" (id=${project.id})`);

  // ── 3. Сохраняем метаданные персонажа ─────────
  await prisma.characterMetadata.create({
    data: {
      projectId: project.id,
      characterName: 'mentor',
      avatarUrl: null,
    },
  });

  // ── 4. DSL-пайплайн: tokenize → parse → buildScenario → buildSnapshot ──
  console.log('Запуск DSL-пайплайна...');

  const tokens = tokenize(DEMO_DSL);
  const parseResult = parse(tokens);

  if (parseResult.errors.length > 0) {
    console.error('Ошибки парсинга DSL:');
    for (const diag of parseResult.errors) {
      console.error(`  [${diag.line}:${diag.column}] ${diag.message}`);
    }
    throw new Error('DSL содержит синтаксические ошибки — снапшот не может быть создан');
  }

  const scenario = buildScenario(parseResult.program);

  const snapshot = buildSnapshot(scenario, 1);

  console.log(`Снапшот: ${Object.keys(snapshot.scenes).length} сцен, startScene="${snapshot.startSceneId}"`);

  // ── 5. Сохраняем PublishedSnapshot ────────────
  await prisma.publishedSnapshot.create({
    data: {
      projectId: project.id,
      version: 1,
      publicId: randomUUID(),
      snapshotData: JSON.parse(JSON.stringify(snapshot)) as object,
      publishedAt: new Date(),
    },
  });

  console.log('PublishedSnapshot создан (version=1).');
  console.log('Seed завершён успешно.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed упал с ошибкой:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
