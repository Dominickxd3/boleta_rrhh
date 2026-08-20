import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

@Injectable()
export class SettingsService {
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

  async guardar(dataUrl: string) {
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
    return { ok: true, guardado: true };
  }

  async eliminar() {
    try {
      await fs.unlink(this.ruta());
    } catch {
      /* noop */
    }
    return { ok: true, eliminado: true };
  }
}
