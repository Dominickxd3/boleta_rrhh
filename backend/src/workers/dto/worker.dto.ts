import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateWorkerDto {
  @IsString()
  @Matches(/^[0-9]{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni: string;

  @IsString()
  @MaxLength(100)
  nombres: string;

  @IsString()
  @MaxLength(100)
  apellidoPaterno: string;

  @IsString()
  @MaxLength(100)
  apellidoMaterno: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  activo?: boolean;
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombres?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidoPaterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidoMaterno?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  activo?: boolean;
}
