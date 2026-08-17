import { IsString } from 'class-validator';

export class FirmarDto {
  @IsString()
  firma: string;
}