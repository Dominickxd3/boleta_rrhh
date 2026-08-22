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
  userAgent?: string | null;
}

export interface ActorAuditoria {
  usuario?: string | null;
  ip?: string | null;
  userAgent?: string | null;
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
        userAgent: params.userAgent ?? null,
      });
      await this.repo.save(registro);
    } catch {
      /* la auditoría nunca debe romper el flujo */
    }
  }

  async listar(filtros: {
    entidad?: string | null;
    entidadId?: number | null;
    limite?: number;
  }): Promise<Auditoria[]> {
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.fecha', 'DESC');
    if (filtros.entidad) {
      qb.andWhere('a.entidad = :entidad', { entidad: filtros.entidad });
    }
    if (filtros.entidadId != null) {
      qb.andWhere('a.entidad_id = :id', { id: filtros.entidadId });
    }
    if (filtros.limite) {
      qb.take(filtros.limite);
    }
    return qb.getMany();
  }

  async resumenDispositivos() {
    const rows: { usuario: string; userAgent: string }[] =
      await this.repo
        .createQueryBuilder('a')
        .select('a.usuario', 'usuario')
        .addSelect('a.user_agent', 'userAgent')
        .where("a.accion IN ('login','login_fallido')")
        .andWhere('a.user_agent IS NOT NULL')
        .getRawMany();

    const esMovil = (ua: string) =>
      /Mobi|Android|iPhone|iPad|iPod/i.test(ua || '');
    const resumen: {
      total: number;
      moviles: number;
      escritorios: number;
      porUsuario: Record<
        string,
        { total: number; moviles: number; escritorios: number }
      >;
    } = { total: rows.length, moviles: 0, escritorios: 0, porUsuario: {} };

    for (const r of rows) {
      const m = esMovil(String(r.userAgent || ''));
      const u = r.usuario || 'desconocido';
      resumen.moviles += m ? 1 : 0;
      resumen.escritorios += m ? 0 : 1;
      resumen.porUsuario[u] ??= { total: 0, moviles: 0, escritorios: 0 };
      resumen.porUsuario[u].total++;
      if (m) {
        resumen.porUsuario[u].moviles++;
      } else {
        resumen.porUsuario[u].escritorios++;
      }
    }
    return resumen;
  }
}