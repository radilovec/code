import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard для опциональной JWT-авторизации.
 *
 * Если токен передан и валиден — request.user заполняется обычным образом.
 * Если токен отсутствует или невалиден — запрос пропускается без ошибки,
 * request.user остаётся undefined.
 *
 * Используется для публичных эндпоинтов, где авторизованный пользователь
 * получает расширенный функционал (сохранение сессии с userId), но
 * анонимный доступ тоже разрешён.
 */
@Injectable()
export class JwtOptionalGuard extends AuthGuard('jwt') {
  override handleRequest<TUser>(
    _err: Error | null,
    user: TUser | false,
  ): TUser | undefined {
    // Не бросаем ошибку при отсутствии или невалидном токене —
    // просто возвращаем undefined вместо user.
    return user !== false ? user : undefined;
  }

  override canActivate(context: ExecutionContext) {
    // Вызываем родительский canActivate, но перехватываем ошибку.
    // canActivate возвращает Promise/Observable/boolean — приводим к Promise.
    return super.canActivate(context);
  }
}
