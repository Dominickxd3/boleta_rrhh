import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from './auditoria.entity';

export interface RegistrarAuditoriaParams {
  usuario?: string | null;
  accion: string;
  entidad?: string | null;
  entidadId?: number | null;
  detalle?: string | null;
  ip?: string | null;
}

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(Auditoria) private readonly repo: Repository<Auditoria>,
  ) {}

  async registrar(params: RegistrarAuditoriaParams): Promise<void> {
    try {
      const registro = this.repo.create({
        usuario: params.usuario ?? null,
        accion: params.accion,
        entidad: params.entidad ?? null,
        entidadId: params.entidadId ?? null,
        detalle: params.detalle ?? null,
        ip: params.ip ?? null,
      });
      await this.repo.save(registro);
    } catch {
      /* la auditoría nunca debe romper el flujo */
    }
  }
}