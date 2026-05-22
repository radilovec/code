import { IsObject } from 'class-validator';

export class SaveLayoutDto {
  @IsObject()
  data!: Record<string, { x: number; y: number }>;
}
