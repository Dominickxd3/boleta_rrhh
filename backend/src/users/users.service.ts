import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedAdmin();
  }

  async seedAdmin(): Promise<void> {
    const username = this.config.get<string>('ADMIN_USER', 'admin');
    const exists = await this.repo.findOne({ where: { username } });
    if (exists) return;

    const password = this.config.get<string>('ADMIN_PASSWORD', 'admin123');
    const nombre = this.config.get<string>('ADMIN_NOMBRE', 'Recursos Humanos');
    const user = this.repo.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      nombre,
      rol: 'admin',
    });
    await this.repo.save(user);
    console.log(`Usuario admin creado: ${username}`);
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }
}
