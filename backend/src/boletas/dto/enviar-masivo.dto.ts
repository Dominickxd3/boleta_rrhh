import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class EnviarMasivoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}