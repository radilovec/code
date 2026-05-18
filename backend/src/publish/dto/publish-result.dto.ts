import { IsString, IsNumber, IsPositive, IsInt } from 'class-validator';

/**
 * Ответ на запрос публикации.
 * Возвращается клиенту после успешной сборки и сохранения runtime-снапшота.
 */
export class PublishResultDto {
  /** Номер версии опубликованного снапшота (инкрементируется при каждой публикации). */
  @IsInt()
  @IsPositive()
  version!: number;

  /** Публичный UUID для доступа к снапшоту. Используется в URL `/play/:publicId`. */
  @IsString()
  publicId!: string;

  /** Количество достижимых сцен в снапшоте. */
  @IsInt()
  @IsPositive()
  sceneCount!: number;

  /** Суммарное количество вариантов выбора во всех сценах. */
  @IsNumber()
  choiceCount!: number;
}
