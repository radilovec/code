// Контроллер публичного API плеера.
//
// GET /runtime/:publicId — без авторизации.
// Зритель может быть анонимом; JwtAccessGuard не применяется.

import { Controller, Get, Param } from '@nestjs/common';
import { RuntimeService, SnapshotResponseDto } from './runtime.service';

@Controller('runtime')
export class RuntimeController {
  constructor(private readonly runtimeService: RuntimeService) {}

  /**
   * GET /runtime/:publicId
   *
   * Возвращает runtime-снапшот интерактивного видео для плеера.
   * Снапшот содержит сцены, переходы, AST условий и начальное состояние.
   *
   * Публичный эндпоинт — авторизация не требуется.
   */
  @Get(':publicId')
  async getSnapshot(
    @Param('publicId') publicId: string,
  ): Promise<SnapshotResponseDto> {
    return this.runtimeService.getSnapshot(publicId);
  }
}
