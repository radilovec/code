// Сервис отдачи runtime-снапшота плееру.
//
// Снапшот ищется по publicId — глобально уникальному идентификатору,
// который был выдан при публикации (POST /publish/:projectId).
// Авторизация не требуется: снапшот публичен для любого зрителя.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SnapshotResponseDto {
  version: number;
  snapshotData: unknown;
  publishedAt: Date;
}

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает опубликованный снапшот по его publicId.
   *
   * @param publicId — глобально уникальный идентификатор снапшота
   * @returns SnapshotResponseDto с версией, snapshotData и датой публикации
   * @throws NotFoundException — снапшот с таким publicId не найден
   */
  async getSnapshot(publicId: string): Promise<SnapshotResponseDto> {
    this.logger.log(`Fetching snapshot by publicId=${publicId}`);

    const snapshot = await this.prisma.publishedSnapshot.findUnique({
      where: { publicId },
      select: {
        version: true,
        snapshotData: true,
        publishedAt: true,
      },
    });

    if (!snapshot) {
      throw new NotFoundException(
        `Snapshot with publicId "${publicId}" not found`,
      );
    }

    return {
      version: snapshot.version,
      snapshotData: snapshot.snapshotData,
      publishedAt: snapshot.publishedAt,
    };
  }
}
