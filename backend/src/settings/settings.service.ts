import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class SettingsService {
  constructor(private readonly auditoria: AuditoriaService) {}

  private ruta(): string {
    return path.join(__dirname, '../../assets/representante_firma.png');
  }

  async existe(): Promise<boolean> {
    try {
      await fs.access(this.ruta());
      return true;
    } catch {
      return false;
    }
  }

  async leer(): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.ruta());
    } catch {
      return null;
    }
  }

  async guardar(
    dataUrl: string,
    actor?: { usuario?: string | null; ip?: string | null },
  ) {
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) {
      throw new NotFoundException(
        'Imagen inválida: debe ser un PNG en base64',
      );
    }
    const buffer = Buffer.from(m[1], 'base64');
    if (!buffer.length) {
      throw new NotFoundException('Imagen vacía');
    }
    await fs.writeFile(this.ruta(), buffer);
    await this.auditoria.registrar({
      usuario: actor?.usuario ?? null,
      ip: actor?.ip ?? null,
      accion: 'actualizar_representante',
      entidad: 'configuracion',
      detalle: 'Se actualizó la firma del representante legal',
    });
    return { ok: true, guardado: true };
  }

  async eliminar(actor?: { usuario?: string | null; ip?: string | null }) {
    try {
      await fs.unlink(this.ruta());
    } catch {
      /* noop */
    }
    await this.auditoria.registrar({
      usuario: actor?.usuario ?? null,
      ip: actor?.ip ?? null,
      accion: 'eliminar_representante',
      entidad: 'configuracion',
      detalle: 'Se eliminó la firma del representante legal',
    });
    return { ok: true, eliminado: true };
  }
}
