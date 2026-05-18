import { IsISO8601, IsObject, IsOptional } from 'class-validator';

/**
 * Тело POST /sessions/snapshot/:publicId.
 *
 * Плеер отправляет итоговое состояние прохождения (значения переменных)
 * после завершения сессии. Авторизация — опциональная.
 */
export class CreateSessionDto {
  /**
   * Финальное состояние переменных сценария.
   * Ключи — имена переменных DSL, значения — number | string | boolean.
   */
  @IsObject()
  finalState!: Record<string, unknown>;

  /**
   * Время завершения прохождения (ISO 8601).
   * Если не передано — используется текущий момент.
   */
  @IsOptional()
  @IsISO8601()
  completedAt?: string;
}
