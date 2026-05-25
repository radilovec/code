// Сервис приёма и хранения сессий прохождения интерактивных видео.
//
// POST /sessions/snapshot/:publicId — анонимный или авторизованный пользователь
// отправляет итоговое состояние переменных после прохождения истории.
// Сервис создаёт запись PlaySession и возвращает её идентификатор.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';

export interface SessionCreatedDto {
  id: string;
  createdAt: Date;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создаёт запись PlaySession для публичного снапшота.
   *
   * @param publicId — publicId опубликованного снапшота
   * @param dto — финальное состояние и опциональное время завершения
   * @param userId — идентификатор авторизованного пользователя (может быть undefined)
   * @returns SessionCreatedDto с id и временем начала сессии
   * @throws NotFoundException — снапшот с таким publicId не найден
   */
  async createSession(
    publicId: string,
    dto: CreateSessionDto,
    userId: string | undefined,
  ): Promise<SessionCreatedDto> {
    this.logger.log(
      `Creating play session for publicId=${publicId}, userId=${userId ?? 'anonymous'}`,
    );

    // Найти снапшот по publicId
    const snapshot = await this.prisma.publishedSnapshot.findUnique({
      where: { publicId },
      select: { id: true },
    });

    if (!snapshot) {
      throw new NotFoundException(
        `Snapshot with publicId "${publicId}" not found`,
      );
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();

    // Состояние сессии: финальное состояние переменных + время завершения.
    // Явное приведение к Prisma.InputJsonValue — Record<string, unknown>
    // совместим структурно, но Prisma требует точного типа.
    const state: Prisma.InputJsonValue = {
      finalState: dto.finalState as Prisma.InputJsonValue,
      visitedScenes: (dto.visitedScenes ?? []) as Prisma.InputJsonValue,
      completedAt: completedAt.toISOString(),
    };

    const session = await this.prisma.playSession.create({
      data: {
        snapshotId: snapshot.id,
        userId: userId ?? null,
        state,
      },
      select: {
        id: true,
        startedAt: true,
      },
    });

    this.logger.log(`Play session created: id=${session.id}`);

    return {
      id: session.id,
      createdAt: session.startedAt,
    };
  }
}
