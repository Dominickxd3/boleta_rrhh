import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(username: string, password: string) {
    const logon = (username || '').trim();

    // 1) Validar contra el ERP (MA001020) vía sp_validar_login_erp (swAcceso = 1)
    try {
      const rows: Record<string, unknown>[] = await this.dataSource.query(
        'EXEC dbo.sp_validar_login_erp @User_Logon = @0, @Password = @1',
        [logon, password],
      );
      const r = rows?.[0];
      if (r && Number(r.Success) === 1) {
        const rol = r.Rol === 'admin' ? 'admin' : 'rrhh';
        const nombre = String(r.User_Fullname || logon).trim();
        const payload = { sub: -1, username: logon, rol };
        await this.auditoria.registrar({
          usuario: logon,
          accion: 'login',
          detalle: `Login ERP: ${nombre}`,
        });
        return {
          access_token: await this.jwt.signAsync(payload),
          usuario: { id: -1, username: logon, nombre, rol },
        };
      }
    } catch {
      /* si el ERP no responde, se intenta el usuario local */
    }

    // 2) Respaldo: usuarios locales (bcrypt)
    const user = await this.users.findByUsername(logon);
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      await this.auditoria.registrar({
        usuario: user.username,
        accion: 'login',
        detalle: 'Login local',
      });
      const payload = {
        sub: user.id,
        username: user.username,
        rol: user.rol,
      };
      return {
        access_token: await this.jwt.signAsync(payload),
        usuario: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
          rol: user.rol,
        },
      };
    }

    await this.auditoria.registrar({
      usuario: logon || null,
      accion: 'login_fallido',
      detalle: 'Credenciales incorrectas',
    });
    throw new UnauthorizedException('Usuario o contraseña incorrectos');
  }
}