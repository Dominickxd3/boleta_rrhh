import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.users.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
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
}
