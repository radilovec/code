// Контроллер приёма состояний прохождения от плеера.
//
// POST /sessions/snapshot/:publicId — опциональная авторизация.
// Анонимные зрители сохраняют сессию без userId, авторизованные — с userId.

import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionCreatedDto, SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * POST /sessions/snapshot/:publicId
   *
   * Принимает итоговое состояние прохождения интерактивного видео.
   * Авторизация опциональна: анонимный пользователь тоже может сохранить сессию.
   *
   * @param publicId — publicId опубликованного снапшота
   * @param dto — финальное состояние переменных + опциональное время завершения
   * @param req — запрос с опциональным request.user (заполняется JwtOptionalGuard)
   * @returns { id, createdAt } созданной сессии
   */
  @UseGuards(JwtOptionalGuard)
  @Post('snapshot/:publicId')
  async createSession(
    @Param('publicId') publicId: string,
    @Body() dto: CreateSessionDto,
    @Req() req: Request,
  ): Promise<SessionCreatedDto> {
    const user = req.user as AuthenticatedUser | undefined;
    return this.sessionsService.createSession(publicId, dto, user?.userId);
  }
}
