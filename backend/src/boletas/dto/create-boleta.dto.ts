import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class DetalleItemDto {
  @IsString()
  concepto: string;

  @IsNumber()
  monto: number;
}

export class DetalleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  ingresos: DetalleItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  descuentos: DetalleItemDto[];

  @IsNumber()
  netoPagar: number;
}

export class CreateBoletaDto {
  @IsInt()
  trabajadorId: number;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El periodo debe tener formato AÑOMES, ej: 202608',
  })
  periodo: string;

  @ValidateNested()
  @Type(() => DetalleDto)
  detalle: DetalleDto;
}