import { IsString, IsNumber, IsInt, Min } from 'class-validator';

/**
 * Ответ на запрос публикации.
 * Возвращается клиенту после успешной сборки и сохранения runtime-снапшота.
 */
export class PublishResultDto {
  /** Номер версии опубликованного снапшота (инкрементируется при каждой публикации). */
  @IsInt()
  @Min(1)
  version!: number;

  /** Публичный UUID для доступа к снапшоту. Используется в URL `/play/:publicId`. */
  @IsString()
  publicId!: string;

  /** Количество достижимых сцен в снапшоте. */
  @IsInt()
  @Min(0)
  sceneCount!: number;

  /** Суммарное количество вариантов выбора во всех сценах. */
  @IsNumber()
  @Min(0)
  choiceCount!: number;
}
