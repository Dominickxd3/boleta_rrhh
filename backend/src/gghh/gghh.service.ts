import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

export interface TrabajadorGGHH {
  IdTrabajadorERP: number;
  DOI: string;
  Trabajador: string;
  Ocupacion: string;
  Area: string;
  Activo: string;
}

export interface ResumenSyncGGHH {
  Total: number;
  Activos: number;
  Inactivos: number;
  UltimaSync: Date;
}

@Injectable()
export class GghhService {
  constructor(private readonly config: ConfigService) {}

  private configSql(): sql.config {
    const host = this.config.get<string>('GGHH_DB_HOST', '10.10.1.6');
    const user = this.config.get<string>('GGHH_DB_USER', 'sa');
    const password = this.config.get<string>('GGHH_DB_PASSWORD', '');
    const database = this.config.get<string>('GGHH_DB_NAME', 'DB_GP_Trabajos_TEST');
    if (!password) {
      throw new Error('Falta GGHH_DB_PASSWORD en backend/.env');
    }
    return {
      server: host,
      port: parseInt(this.config.get<string>('GGHH_DB_PORT', '1433'), 10),
      user,
      password,
      database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    };
  }

  /**
   * Ejecuta el SP de sincronización creado por el usuario (sp_SyncTrabajadoresCache),
   * que materializa en tiempo real los trabajadores del ERP en TBL_GGHH_TrabajadorCache.
   */
  async sincronizarCache(): Promise<{
    resumen: ResumenSyncGGHH;
    trabajadores: TrabajadorGGHH[];
  }> {
    const pool = await new sql.ConnectionPool(this.configSql()).connect();
    try {
      const resumen = await pool.request().execute('sp_SyncTrabajadoresCache');
      const cache = await pool.request().query(
        `SELECT IdTrabajadorERP, DOI, Trabajador, Ocupacion, Area, Activo
         FROM dbo.TBL_GGHH_TrabajadorCache
         WHERE Activo = '1'
         ORDER BY Trabajador`,
      );
      return {
        resumen: resumen.recordset[0],
        trabajadores: cache.recordset,
      };
    } finally {
      await pool.close();
    }
  }
}