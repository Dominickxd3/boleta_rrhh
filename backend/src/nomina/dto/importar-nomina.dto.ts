import { IsString, Matches } from 'class-validator';

export class ImportarNominaDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'anomes debe ser YYYYMM' })
  anomes: string;

  @IsString()
  @Matches(/^\d{2}$/, { message: 'correl debe ser de 2 dígitos' })
  correl: string;
}