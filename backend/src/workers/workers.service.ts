import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GghhService } from '../gghh/gghh.service';
import { Worker } from './worker.entity';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private readonly repo: Repository<Worker>,
    private readonly gghh: GghhService,
  ) {}

  findAll(search?: string, soloActivos?: boolean): Promise<Worker[]> {
    const qb = this.repo.createQueryBuilder('w');
    if (soloActivos) {
      qb.where('w.activo = :activo', { activo: true });
    }
    if (search) {
      qb.andWhere(
        '(w.nombres LIKE :s OR w.apellido_paterno LIKE :s OR w.apellido_materno LIKE :s OR w.dni LIKE :s)',
        { s: `%${search}%` },
      );
    }
    return qb.orderBy('w.apellido_paterno', 'ASC').getMany();
  }

  async findOne(id: number): Promise<Worker> {
    const worker = await this.repo.findOne({ where: { id } });
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    return worker;
  }

  findByDni(dni: string): Promise<Worker | null> {
    return this.repo.findOne({ where: { dni } });
  }

  create(dto: CreateWorkerDto): Promise<Worker> {
    const worker = this.repo.create(dto);
    return this.repo.save(worker);
  }

  async update(id: number, dto: UpdateWorkerDto): Promise<Worker> {
    const worker = await this.findOne(id);
    Object.assign(worker, dto);
    return this.repo.save(worker);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  private parsearNombre(nombre: string): {
    apellidoPaterno: string;
    apellidoMaterno: string;
    nombres: string;
  } {
    const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length <= 1) {
      return {
        apellidoPaterno: partes[0] || '',
        apellidoMaterno: '',
        nombres: '',
      };
    }
    if (partes.length === 2) {
      return { apellidoPaterno: partes[0], apellidoMaterno: partes[1], nombres: '' };
    }
    return {
      apellidoPaterno: partes[0],
      apellidoMaterno: partes[1],
      nombres: partes.slice(2).join(' '),
    };
  }

  async sincronizarDesdeGGHH() {
    const { resumen, trabajadores } = await this.gghh.sincronizarCache();

    let nuevos = 0;
    let actualizados = 0;
    const dnisErp = new Set<string>();

    for (const t of trabajadores) {
      const dni = (t.DOI || '').trim();
      if (!dni) continue;
      dnisErp.add(dni);

      const nombres = this.parsearNombre(t.Trabajador);
      const datos = {
        apellidoPaterno: nombres.apellidoPaterno,
        apellidoMaterno: nombres.apellidoMaterno,
        nombres: nombres.nombres,
        area: (t.Area || '').trim() || undefined,
        cargo: (t.Ocupacion || '').trim() || undefined,
        activo: true,
      };

      const existente = await this.findByDni(dni);
      if (!existente) {
        await this.repo.save(this.repo.create({ dni, ...datos }));
        nuevos++;
        continue;
      }

      const cambia =
        existente.apellidoPaterno !== datos.apellidoPaterno ||
        existente.apellidoMaterno !== datos.apellidoMaterno ||
        existente.nombres !== datos.nombres ||
        (existente.area || undefined) !== datos.area ||
        (existente.cargo || undefined) !== datos.cargo ||
        !existente.activo;
      if (cambia) {
        Object.assign(existente, datos);
        await this.repo.save(existente);
        actualizados++;
      }
    }

    // Trabajadores que ya no figuran en el ERP pasan a inactivos (no se borran).
    const todos = await this.repo.find();
    let inactivos = 0;
    for (const w of todos) {
      if (w.activo && !dnisErp.has(w.dni)) {
        w.activo = false;
        await this.repo.save(w);
        inactivos++;
      }
    }

    const activos = todos.length - (todos.filter((w) => !w.activo).length);

    return {
      fuente: 'DB_GP_Trabajos_TEST / sp_SyncTrabajadoresCache',
      trabajadoresErp: trabajadores.length,
      nuevos,
      actualizados,
      inactivos,
      totalActivos: activos,
      totalInactivos: todos.length - activos,
      ultimaSync: resumen.UltimaSync,
    };
  }
}
