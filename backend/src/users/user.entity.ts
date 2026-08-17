import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column()
  nombre: string;

  @Column({ default: 'admin' })
  rol: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
