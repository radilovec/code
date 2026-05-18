// Сервис публикации проекта.
//
// При публикации DSL-текст проекта проходит полный pipeline:
// tokenize → parse → buildScenario → buildSnapshot.
// Результат сохраняется в PublishedSnapshot и возвращается клиенту.
//
// Разделение authoring и runtime взято из подхода Netflix:
// authoring-модель (DSL) хранится в Project.dslText,
// runtime-модель (снапшот) — в PublishedSnapshot.snapshotData.
// (source.md, раздел "Netflix Bandersnatch / Shakti / Falcor").

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublishResultDto } from './dto/publish-result.dto';

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Публикует проект: собирает runtime-снапшот из DSL и сохраняет его в БД.
   *
   * @param projectId — UUID проекта
   * @param userId — UUID пользователя (проверяется владение проектом)
   * @returns PublishResultDto с версией, publicId и статистикой
   * @throws NotFoundException — проект не найден
   * @throws ForbiddenException — пользователь не является владельцем
   * @throws BadRequestException — DSL содержит синтаксические ошибки
   */
  async publishProject(
    projectId: string,
    userId: string,
  ): Promise<PublishResultDto> {
    this.logger.log(`Publishing project ${projectId} for user ${userId}`);

    // 1. Загружаем проект и проверяем владельца
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, dslText: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // 2. Динамический импорт shared-пакета (ESM из CommonJS NestJS)
    const { tokenize, parse, buildScenario, buildSnapshot } = await import(
      '@interactive-video/shared'
    );

    // 3. DSL pipeline: tokenize → parse → buildScenario → buildSnapshot
    const tokens = tokenize(project.dslText);
    const { program, errors } = parse(tokens);

    // 4. Если парсер нашёл ошибки — прерываем публикацию
    if (errors.length > 0) {
      const errorMessages = errors
        .map(
          (e: { line: number; column: number; message: string }) =>
            `Line ${e.line}:${e.column} — ${e.message}`,
        )
        .join('; ');
      throw new BadRequestException(
        `DSL contains syntax errors: ${errorMessages}`,
      );
    }

    const scenario = buildScenario(program);
    const nextVersion = await this.getNextVersion(projectId);
    const snapshot = buildSnapshot(scenario, nextVersion);

    // 5. Генерируем publicId через Node.js crypto (без eval/Function)
    const publicId = crypto.randomUUID();

    // 6. Сохраняем PublishedSnapshot в БД
    await this.prisma.publishedSnapshot.create({
      data: {
        projectId,
        version: nextVersion,
        publicId,
        snapshotData: snapshot as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
    });

    this.logger.log(
      `Project ${projectId} published as version ${nextVersion}, publicId=${publicId}`,
    );

    // 7. Считаем статистику для ответа
    const scenes = Object.values(
      snapshot.scenes as Record<string, { choices: unknown[] }>,
    );
    const sceneCount = scenes.length;
    const choiceCount = scenes.reduce(
      (sum: number, scene: { choices: unknown[] }) =>
        sum + scene.choices.length,
      0,
    );

    return {
      version: nextVersion,
      publicId,
      sceneCount,
      choiceCount,
    };
  }

  /**
   * Определяет следующий номер версии: MAX(existing) + 1, или 1 если нет снапшотов.
   */
  private async getNextVersion(projectId: string): Promise<number> {
    const latest = await this.prisma.publishedSnapshot.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return latest !== null ? latest.version + 1 : 1;
  }
}
