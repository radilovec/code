import {
  Controller,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { PublishService } from './publish.service';
import { PublishResultDto } from './dto/publish-result.dto';

@UseGuards(JwtAccessGuard)
@Controller('publish')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  /**
   * POST /publish/:projectId
   *
   * Запускает pipeline публикации:
   * DSL → tokenize → parse → buildScenario → buildSnapshot → сохранение в БД.
   *
   * Возвращает версию, publicId и статистику снапшота.
   * Ошибки DSL возвращаются как 400 Bad Request.
   */
  @Post(':projectId')
  @HttpCode(HttpStatus.CREATED)
  async publish(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublishResultDto> {
    return this.publishService.publishProject(projectId, user.userId);
  }
}
